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
