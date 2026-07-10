// 문자·알림톡 발송 클라이언트 — /api/sms(서버 키) 호출. 보건교사 세션 JWT를 실어 보낸다.
//  · 서버 미설정(501)·미인증·오프라인이면 실패 코드만 반환(앱은 계속 동작).
//  · 수신번호·본문은 발송 시점에만 전송(서버 미저장, 클라우드 DB 미기록).
//  ※ 승인·발신번호 준비 후 처치완료 흐름에 연결. 지금은 준비된 배관(수동 호출용).
import { supabase, SUPABASE_ENABLED } from './supabaseClient'

export type SmsResult = { ok: boolean; error?: string }

async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/** 문자(SMS/LMS) 발송. 알림톡은 templateId·variables 추가(서버 SOLAPI_PF_ID 설정 시). */
export async function sendSms(
  to: string,
  text: string,
  opts?: { templateId?: string; variables?: Record<string, string> },
): Promise<SmsResult> {
  if (!SUPABASE_ENABLED) return { ok: false, error: 'not_configured' }
  const jwt = await accessToken()
  if (!jwt) return { ok: false, error: 'auth' }
  try {
    const r = await fetch('/api/sms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ to, text, ...(opts ?? {}) }),
    })
    if (r.ok) return { ok: true }
    const j = await r.json().catch(() => ({}))
    return { ok: false, error: j.error || `send_failed_${r.status}` }
  } catch {
    return { ok: false, error: 'network' }
  }
}
