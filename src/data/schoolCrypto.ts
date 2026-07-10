// 학교 E2E 키·라우팅 토큰 — 서버 발급(/api/keys) 우선, 미설정/네트워크/데모면 로컬 파생 폴백.
//  · Phase 1(현재): 서버 설정 시 서버 발급, 아니면 로컬(번들 VITE_SCHOOL_LINK_SECRET)로 폴백 → 무중단.
//  · Phase 2: Vercel에 SCHOOL_MASTER_SECRET 설정 + 클라이언트 VITE_SCHOOL_LINK_SECRET 제거 →
//    번들에서 비밀이 사라지고 서버 발급만 사용(실제 보안 수정 완료). 파생 알고리즘 동일이라 기존 암호문 그대로 복호.
//  · 스코프 키는 localStorage 캐시(오프라인 복호 유지, 노출은 자녀 키 1개 등 스코프 키뿐).
import { encryptJson, decryptJson, type Enc } from './e2e'
import { supabase, SUPABASE_ENABLED } from './supabaseClient'

const SCHOOL_ID = (import.meta.env.VITE_SCHOOL_ID as string | undefined) || 'demo'
// 폴백 전용(Phase 1). Phase 2에서 이 env를 지우면 서버 발급만 사용.
const SECRET = (import.meta.env.VITE_SCHOOL_LINK_SECRET as string | undefined) || `naum-school-${SCHOOL_ID}`

const te = new TextEncoder()
async function sha256bytes(str: string): Promise<Uint8Array> {
  const d = await crypto.subtle.digest('SHA-256', te.encode(str) as unknown as BufferSource)
  return new Uint8Array(d)
}
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

// 로컬 파생(폴백) — 기존 알고리즘과 바이트 동일.
const localKeyB64 = async (ns: string) => toB64(await sha256bytes(`${SECRET}:${ns}`))
const localTokenHex = async (input: string) => toHex(await sha256bytes(`${SECRET}:token:${input}`)).slice(0, 32)

// ── 리소스(키+토큰) 조회: 서버 발급 우선, 폴백 로컬 ──
type Res = { key?: string; token?: string }
const LS_CACHE = 'naum.keycache'
const LS_TOKENAUTH = 'naum.tokenauth' // 교사·학부모 서명 로그인 토큰(권한 증명)

function loadCache(): Record<string, Res> { try { return JSON.parse(localStorage.getItem(LS_CACHE) || '{}') } catch { return {} } }
function saveCache(c: Record<string, Res>) { try { localStorage.setItem(LS_CACHE, JSON.stringify(c)) } catch { /* ignore */ } }

const memKey = new Map<string, Promise<CryptoKey>>()
const inflight = new Map<string, Promise<Res>>()

async function localRes(ns: string): Promise<Res> {
  return { key: await localKeyB64(ns), token: ns === 'links' ? undefined : await localTokenHex(ns) }
}

async function authForKeys(): Promise<{ headers: Record<string, string>; token?: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  try {
    if (supabase) {
      // getSession이 만료 토큰 갱신으로 지연될 수 있어 짧은 타임아웃(크립토가 멈추지 않게).
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2500))
      const data = await Promise.race([supabase.auth.getSession().then((x) => x.data), timeout])
      const jwt = data?.session?.access_token
      if (jwt) { headers.Authorization = `Bearer ${jwt}`; return { headers } }
    }
  } catch { /* ignore */ }
  let token: string | undefined
  try { token = localStorage.getItem(LS_TOKENAUTH) || undefined } catch { /* ignore */ }
  return { headers, token }
}

async function fetchResource(ns: string, need: 'key' | 'token'): Promise<Res> {
  const cached = loadCache()[ns]
  if (cached && (need === 'key' ? cached.key !== undefined : cached.token !== undefined)) return cached
  const flightKey = `${ns}|${need}`
  if (inflight.has(flightKey)) return inflight.get(flightKey)!
  const p = (async (): Promise<Res> => {
    if (SUPABASE_ENABLED) {
      try {
        const { headers, token } = await authForKeys()
        const r = await fetch('/api/keys', { method: 'POST', headers, body: JSON.stringify({ action: 'key', ns, token }) })
        if (r.ok) {
          const j = await r.json()
          const res: Res = { key: j.key, token: j.token }
          const c = loadCache(); c[ns] = { ...c[ns], ...res }; saveCache(c)
          return res
        }
        // 403(권한없음)·501(미설정)·기타 → 폴백(Phase 1: 번들 비밀. Phase 2: 비밀 제거되어 폴백은 무효값).
      } catch { /* 네트워크 → 폴백 */ }
    }
    return localRes(ns)
  })()
  inflight.set(flightKey, p)
  try { return await p } finally { inflight.delete(flightKey) }
}

async function keyOf(ns: string): Promise<CryptoKey> {
  const memo = memKey.get(ns)
  if (memo) return memo
  const p = (async () => {
    const res = await fetchResource(ns, 'key')
    const raw = res.key ? fromB64(res.key) : await sha256bytes(`${SECRET}:${ns}`) // 방어적 폴백
    return crypto.subtle.importKey('raw', raw as unknown as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
  })()
  memKey.set(ns, p)
  return p
}
async function tokenOf(ns: string): Promise<string> {
  const res = await fetchResource(ns, 'token')
  return res.token ?? (await localTokenHex(ns))
}

export const schoolLinkKey = () => keyOf('links')
export const schoolClassKey = (grade: number, classNo: number) => keyOf(`class:${grade}-${classNo}`)
export const schoolStudentKey = (studentId: string) => keyOf(`student:${studentId}`)
export const schoolClassToken = (grade: number, classNo: number) => tokenOf(`class:${grade}-${classNo}`)
export const schoolStudentToken = (studentId: string) => tokenOf(`student:${studentId}`)

/** 교사/보건교사가 여러 학생 라우팅 토큰을 한 번에(buildClassTokenMap 최적화). 실패 시 개별 폴백. */
export async function primeStudentTokens(sids: string[]): Promise<void> {
  if (!SUPABASE_ENABLED || sids.length === 0) return
  try {
    const { headers, token } = await authForKeys()
    const r = await fetch('/api/keys', { method: 'POST', headers, body: JSON.stringify({ action: 'studentTokens', sids, token }) })
    if (!r.ok) return
    const j = await r.json()
    const c = loadCache()
    for (const sid of sids) {
      const t = j.tokens?.[sid]
      if (t) c[`student:${sid}`] = { ...c[`student:${sid}`], token: t }
    }
    saveCache(c)
  } catch { /* 개별 schoolStudentToken 폴백 */ }
}

/** 로그아웃 시 스코프 키·토큰 캐시 초기화. */
export function clearKeyCache() {
  try { localStorage.removeItem(LS_CACHE); localStorage.removeItem(LS_TOKENAUTH) } catch { /* ignore */ }
  memKey.clear()
}
/** 교사·학부모 서명 로그인 토큰 저장(권한 증명용, /api/keys 호출에 사용). */
export function setTokenAuth(token: string) {
  try { if (token && token.startsWith('v1.')) localStorage.setItem(LS_TOKENAUTH, token) } catch { /* ignore */ }
}

// ── 레거시 로그인 토큰(로컬 암호문) — tokenApi 폴백용. 서버 HMAC 토큰으로 대체 진행 중 ──
let loginKeyP: Promise<CryptoKey> | null = null
const schoolLoginKeyLocal = () =>
  (loginKeyP ??= (async () =>
    crypto.subtle.importKey('raw', (await sha256bytes(`${SECRET}:login`)) as unknown as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']))())
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))
export async function issueLoginToken(payload: unknown): Promise<string> {
  const e = await encryptJson(await schoolLoginKeyLocal(), payload)
  return b64url(JSON.stringify(e))
}
export async function decodeLoginToken<T = unknown>(token: string): Promise<T | null> {
  try { const e = JSON.parse(unb64url(token.trim())) as Enc; return await decryptJson<T>(await schoolLoginKeyLocal(), e) } catch { return null }
}

export { encryptJson, decryptJson, type Enc }
