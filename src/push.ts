// 앱 푸시 — ① 페이지 열림 중 OS 알림(Notification) ② 원격 Web Push 구독(접수 도착 폰 알림).
import { supabase } from './data/supabaseClient'
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported'
}

export async function ensurePushPermission(): Promise<boolean> {
  if (!pushSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export function pushNotify(title: string, body: string): void {
  if (pushSupported() && Notification.permission === 'granted') {
    try {
      new Notification(title, { body })
    } catch {
      /* ignore */
    }
  }
}

// ── 원격 Web Push(접수 도착 시 폰/PC 알림 — 앱이 닫혀 있어도 도착) ──
//  구독은 기기·브라우저별. 보건교사 로그인 상태에서 등록하면 서버(push_subs, 학교 스코프)에
//  저장되고, 키오스크 접수 직후 /api/push notify가 학교의 모든 구독 기기로 발송한다.

function urlB64ToU8(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function remotePushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

/** 이 기기에 활성 푸시 구독이 있는지. */
export async function remotePushActive(): Promise<boolean> {
  if (!remotePushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}

export type RemotePushResult = 'ok' | 'denied' | 'unsupported' | 'unconfigured' | 'login_required' | 'error'

/** 이 기기에서 접수 푸시 구독(보건교사 로그인 필요). */
export async function subscribeRemotePush(): Promise<RemotePushResult> {
  if (!remotePushSupported()) return 'unsupported'
  if (!(await ensurePushPermission())) return 'denied'
  try {
    const kr = await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pubkey' }),
    })
    if (kr.status === 501) return 'unconfigured'
    const { key } = (await kr.json().catch(() => ({}))) as { key?: string }
    if (!key) return 'unconfigured'

    const jwt = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
    if (!jwt) return 'login_required'

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToU8(key) as unknown as BufferSource,
      })
    }
    const r = await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'subscribe', sub: sub.toJSON() }),
    })
    return r.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

/** 현재 구독(없으면 null). 서비스워커가 등록되지 않은 기기에서는 ready가 끝나지 않으므로 시간 제한. */
async function currentSub(): Promise<PushSubscription | null> {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 2000)),
  ])
  return reg ? reg.pushManager.getSubscription() : null
}

/** 이 기기의 기존 구독을 현재 로그인한 보건교사의 학교로 다시 등록.
 *  배경: 서버 구독(push_subs)의 학교는 "켤 때" 한 번만 기록됐다. 연수 때 테스트초(demo)로 켠 폰이
 *  이후 실학교로 로그인해도 demo로 남아, 테스트초 시뮬레이션 접수가 그 폰으로 푸시됐다.
 *  보건교사 세션이 확인될 때마다 호출해 서버의 학교를 현재 학교로 맞춘다(구독이 없으면 아무것도 안 함). */
export async function resyncRemotePush(): Promise<void> {
  if (!remotePushSupported()) return
  try {
    const sub = await currentSub()
    if (!sub) return
    const jwt = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
    if (!jwt) return
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'subscribe', sub: sub.toJSON() }),
    })
  } catch {
    /* ignore — 다음 세션 확인 때 재시도 */
  }
}

/** 로그아웃 시 — 서버 구독만 삭제(브라우저 구독은 유지해 다음 로그인 때 resync로 그 학교에 재등록).
 *  로그아웃한 기기로 그 학교 접수가 계속 푸시되던 문제 방지. signOut 전에 호출해야 한다(JWT 필요). */
export async function detachRemotePush(): Promise<void> {
  if (!remotePushSupported()) return
  try {
    const sub = await currentSub()
    if (!sub) return
    const jwt = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
    if (!jwt) return
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
    })
  } catch {
    /* ignore */
  }
}

/** 이 기기의 접수 푸시 구독 해제. */
export async function unsubscribeRemotePush(): Promise<void> {
  if (!remotePushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    const jwt = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
    if (jwt) {
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ action: 'unsubscribe', endpoint }),
      }).catch(() => {})
    }
  } catch {
    /* ignore */
  }
}
