// 학교 공유 비밀에서 "결정적으로" 파생하는 대칭키 — 같은 학교의 모든 기기가 동일 키를 만든다.
//  · e2e.ts의 키는 기기마다 랜덤이라 다기기 공유 불가 → 클라우드(다기기)용은 이 모듈을 쓴다.
//  · 키 = AES-GCM(SHA-256( SCHOOL_SECRET + ':' + namespace )). Supabase(서버)에는 비밀이 없어 복호화 불가.
//  · 비밀은 배포 시 VITE_SCHOOL_LINK_SECRET(전 학교 기기 공통)로 주입. 미설정 시 학교 id 기반 약식값.
//
//  보안 메모(프로토타입): 비밀이 클라이언트 번들에 포함되므로 "DB 유출 시 식별 불가"는 보장하나,
//  앱+계정 접근자에겐 복호화 가능. 진짜 사용자별 키 교환은 후속 과제.
import { encryptJson, decryptJson, type Enc } from './e2e'

const SCHOOL_ID = (import.meta.env.VITE_SCHOOL_ID as string | undefined) || 'demo'
const SECRET =
  (import.meta.env.VITE_SCHOOL_LINK_SECRET as string | undefined) || `naum-school-${SCHOOL_ID}`

const cache = new Map<string, Promise<CryptoKey>>()

async function deriveKey(namespace: string): Promise<CryptoKey> {
  const cached = cache.get(namespace)
  if (cached) return cached
  const p = (async () => {
    const material = new TextEncoder().encode(`${SECRET}:${namespace}`)
    const digest = await crypto.subtle.digest('SHA-256', material as unknown as BufferSource)
    return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
  })()
  cache.set(namespace, p)
  return p
}

/** visit↔student 링크 암호화용 학교 키(전 기기 공통). */
export const schoolLinkKey = () => deriveKey('links')
/** 반 채널 키(담임) — 결정적 파생(다기기 공유). */
export const schoolClassKey = (grade: number, classNo: number) => deriveKey(`class:${grade}-${classNo}`)
/** 학생(보호자) 채널 키 — 결정적 파생. */
export const schoolStudentKey = (studentId: string) => deriveKey(`student:${studentId}`)

// ── 결정적 라우팅 토큰(다기기 공유) — 서버는 토큰만 보고, 역매핑은 학교 비밀+명부 있는 기기만 가능 ──
async function deriveTokenHex(input: string): Promise<string> {
  const mat = new TextEncoder().encode(`${SECRET}:token:${input}`)
  const d = await crypto.subtle.digest('SHA-256', mat as unknown as BufferSource)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
export const schoolStudentToken = (studentId: string) => deriveTokenHex(`student:${studentId}`)
export const schoolClassToken = (grade: number, classNo: number) => deriveTokenHex(`class:${grade}-${classNo}`)

// ── 로그인 토큰(보건교사 발급 → 교사/학부모 배부) — 자체완결 암호문. 학교 키로만 복호(서버·외부 불가) ──
const schoolLoginKey = () => deriveKey('login')

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

/** payload(역할·학반/학생)를 암호화한 배부용 토큰 문자열. */
export async function issueLoginToken(payload: unknown): Promise<string> {
  const enc = await encryptJson(await schoolLoginKey(), payload)
  return b64url(JSON.stringify(enc))
}

/** 토큰 복호 → payload(잘못된 토큰이면 null). */
export async function decodeLoginToken<T = unknown>(token: string): Promise<T | null> {
  try {
    const enc = JSON.parse(unb64url(token.trim())) as Enc
    return await decryptJson<T>(await schoolLoginKey(), enc)
  } catch {
    return null
  }
}

export { encryptJson, decryptJson, type Enc }
