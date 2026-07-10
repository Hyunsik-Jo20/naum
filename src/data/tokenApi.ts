// 토큰 발급/검증/가입의 클라이언트 진입점 — 서버(HMAC 서명) 우선, 서버 미설정/오프라인이면 레거시 로컬 폴백.
//  · 서버 서명 토큰 형식: 'v1.<payload>.<hmac>'  (검증은 반드시 서버, 위조 불가)
//  · 레거시 토큰: 학교 키 암호문(schoolCrypto) — 서버 미설정 환경/데모에서만.
//  · 발급 권한 거부(403)는 조용히 로컬로 폴백하지 않고 에러 전파(위조 방지). 501/네트워크만 폴백.
import { supabase, SUPABASE_ENABLED } from './supabaseClient'
import { issueLoginToken as localIssue, decodeLoginToken as localDecode } from './schoolCrypto'

const ENDPOINT = '/api/token'

async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

const ISSUE_ERR: Record<string, string> = {
  nurse_required: '보건교사 계정으로 로그인한 뒤 발급할 수 있습니다.',
  edu_required: '교육청 인가가 필요합니다. 발급 비밀번호를 확인하세요.',
  bad_payload: '발급 정보가 올바르지 않습니다.',
  bad_role: '발급 정보가 올바르지 않습니다.',
}

/** 로그인/가입 토큰 발급. 서버 서명 우선, 서버 미설정/네트워크 오류면 로컬 폴백. */
export async function issueLoginToken(
  payload: Record<string, unknown>,
  opts?: { eduSecret?: string },
): Promise<string> {
  if (SUPABASE_ENABLED) {
    let r: Response | null = null
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      const jwt = await accessToken()
      if (jwt) headers.Authorization = `Bearer ${jwt}`
      if (opts?.eduSecret) headers['x-issue-secret'] = opts.eduSecret
      r = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ action: 'issue', payload }) })
    } catch {
      r = null // 네트워크 → 폴백
    }
    if (r) {
      if (r.ok) {
        const j = await r.json().catch(() => ({}))
        if (j.token) return j.token as string
      } else if (r.status === 403 || r.status === 400) {
        // 서버가 설정됐고 권한/입력 거부 → 로컬 위조 방지 위해 에러 전파(폴백 금지).
        const j = await r.json().catch(() => ({}))
        throw new Error(ISSUE_ERR[j.error] || '토큰 발급이 거부되었습니다.')
      }
      // 501(not_configured) 등 → 로컬 폴백
    }
  }
  return localIssue(payload)
}

/** 토큰 검증 → payload. 'v1.' 서명 토큰은 서버 검증 필수, 레거시는 로컬 복호. */
export async function verifyLoginToken<T = unknown>(token: string): Promise<T | null> {
  const t = (token || '').trim()
  if (t.startsWith('v1.')) {
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: t }),
      })
      if (r.ok) {
        const j = await r.json().catch(() => ({}))
        return (j.payload ?? null) as T | null
      }
    } catch {
      /* 서버 도달 불가 → 검증 불가(위조 방지 위해 통과시키지 않음) */
    }
    return null
  }
  return localDecode<T>(t)
}

export type ServerSignupResult = { ok: boolean; error?: string; fellBack?: boolean }

/** 보건교사 가입 — 서버 서명 토큰이면 서버(service-role)가 검증+계정 생성. 아니면 폴백 신호. */
export async function serverSignupNurse(
  token: string,
  email: string,
  password: string,
  name: string,
): Promise<ServerSignupResult> {
  const t = (token || '').trim()
  if (!(SUPABASE_ENABLED && t.startsWith('v1.'))) return { ok: false, error: 'not_configured', fellBack: true }
  let r: Response | null = null
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'signup', token: t, email, password, name }),
    })
  } catch {
    return { ok: false, error: 'network' }
  }
  if (r.ok) return { ok: true }
  if (r.status === 501) return { ok: false, error: 'not_configured', fellBack: true }
  const j = await r.json().catch(() => ({}))
  if (r.status === 409) return { ok: false, error: 'exists' }
  return { ok: false, error: j.error || 'signup_failed' }
}
