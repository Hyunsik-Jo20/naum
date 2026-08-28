// 로컬 PII 저장 시 암호화(at-rest) — 업로드 명부·담임 명부·재식별 링크·방문 캐시를
//  서버 발급 학교 키(AES-GCM, /api/keys)로 암호화해 localStorage에 보관한다.
//
//  · 무엇을 막나: 기기 저장소를 그대로 열람·복사(백업 파일, 자리 비운 PC에서 localStorage 확인 등)
//    해도 평문 개인정보가 보이지 않는다. 키는 로그인(인증)한 이 학교 직원에게만 서버가 발급.
//  · 한계(정직하게): 같은 브라우저에 키 캐시가 남아 있으면(오프라인 복호용) 기기를 완전히
//    장악한 공격자는 복호 가능 — 기기 잠금·OS 계정 보안이 여전히 1차 방어선이다.
//  · 부팅 절차: 명부 등은 모듈 초기화 시 "동기"로 읽히므로, main.tsx가 앱 모듈을 로드하기 전에
//    initSecureStore()로 복호해 메모리 미러에 올려 둔다(이후 읽기는 전부 동기).
//  · 마이그레이션: 기존 평문 값은 그대로 읽어 쓰되, 키가 준비되면 암호문으로 재저장.
//  · 실패 시 가용성 우선: 복호 실패(키 없음)면 해당 데이터는 이번 부팅에서 빈 값(암호문은 보존),
//    암호화 실패면 평문 저장 + 콘솔 경고(다음 부팅에서 재시도) — 보건실 업무가 멈추면 안 된다.
import { encryptJson, decryptJson, schoolLinkKey, type Enc } from './schoolCrypto'

/** 암호화 보관 대상(보건교사 기기 PII). */
export const SECURE_KEYS = ['naum.roster', 'naum.teacherRoster', 'naum.station.links', 'naum.cache.visits'] as const

interface SecEnvelope extends Enc {
  __sec: 1
}

const mirror = new Map<string, string | null>()
let keyPromise: Promise<CryptoKey | null> | null = null

function getKey(): Promise<CryptoKey | null> {
  if (!keyPromise) {
    // 키 서버 지연이 부팅을 막지 않도록 타임아웃(오프라인은 keycache로 즉시 해결됨).
    keyPromise = Promise.race([
      schoolLinkKey().catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ])
  }
  return keyPromise
}

async function encryptTo(k: string, plainJson: string): Promise<void> {
  try {
    const key = await getKey()
    if (!key) throw new Error('no key')
    const env: SecEnvelope = { __sec: 1, ...(await encryptJson(key, plainJson)) }
    localStorage.setItem(k, JSON.stringify(env))
  } catch {
    // 가용성 우선 — 평문 저장(다음 부팅에서 암호화 재시도). 조용한 유실보다 낫다.
    try { localStorage.setItem(k, plainJson) } catch { /* ignore */ }
    console.warn(`[naum:secure] ${k} 암호화 저장 실패 — 평문 폴백(다음 부팅에서 재시도)`)
  }
}

/** 부팅 시 1회 — 보호 대상 키를 복호해 메모리 미러에 올린다(평문 레거시는 마이그레이션). */
export async function initSecureStore(): Promise<void> {
  const pending: Array<{ k: string; env: SecEnvelope }> = []
  const migrate: Array<{ k: string; plain: string }> = []
  for (const k of SECURE_KEYS) {
    let raw: string | null = null
    try { raw = localStorage.getItem(k) } catch { /* ignore */ }
    if (raw == null) { mirror.set(k, null); continue }
    try {
      const p = JSON.parse(raw)
      if (p && p.__sec === 1 && p.iv && p.ct) { pending.push({ k, env: p as SecEnvelope }); continue }
    } catch { /* 평문(JSON 아님)일 수도 — 아래에서 평문 취급 */ }
    mirror.set(k, raw) // 평문 레거시 — 이번 부팅은 그대로 사용
    migrate.push({ k, plain: raw })
  }
  if (pending.length === 0 && migrate.length === 0) return // 보호 대상 없음(교사·학부모·교육청 기기) — 빠른 부팅

  const key = await getKey()
  for (const { k, env } of pending) {
    if (!key) { mirror.set(k, null); continue } // 키 없음(미로그인 기기 등) — 암호문 보존, 이번 부팅은 빈 값
    try {
      mirror.set(k, await decryptJson<string>(key, env))
    } catch {
      mirror.set(k, null) // 타 학교 키로 저장된 데이터 등 — 복호 불가(격리상 올바른 동작)
    }
  }
  if (key) for (const { k, plain } of migrate) void encryptTo(k, plain) // 평문 → 암호문 승격
}

/** 동기 읽기(부팅 시 복호된 미러). 값은 JSON 문자열 그대로. */
export function getSecureRaw(k: string): string | null {
  return mirror.get(k) ?? null
}

/** 동기 쓰기 — 미러 즉시 갱신 + 백그라운드 암호화 저장. */
export function setSecureRaw(k: string, plainJson: string): void {
  mirror.set(k, plainJson)
  void encryptTo(k, plainJson)
}

export function removeSecure(k: string): void {
  mirror.set(k, null)
  try { localStorage.removeItem(k) } catch { /* ignore */ }
}

/** 저장 존재 여부(암호문/평문 무관) — "업로드됨" 뱃지 판정용. */
export function hasStored(k: string): boolean {
  try { return localStorage.getItem(k) != null } catch { return false }
}
