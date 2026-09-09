// 로컬 PII 저장 시 암호화(at-rest) — 명부·일일업무기록·재식별 링크·방문 캐시를
//  서버 발급 학교 키(AES-GCM, /api/keys)로 암호화해 localStorage에 보관한다.
//
//  · 무엇을 막나: 기기 저장소를 그대로 열람·복사(백업 파일, 자리 비운 PC에서 localStorage 확인 등)
//    해도 평문 개인정보가 보이지 않는다. 키는 로그인(인증)한 이 학교 직원에게만 서버가 발급.
//  · 한계(정직하게): 같은 브라우저에 키 캐시가 남아 있으면(오프라인 복호용) 기기를 완전히
//    장악한 공격자는 복호 가능 — 기기 잠금·OS 계정 보안이 여전히 1차 방어선이다.
//  · 부팅 절차: 명부 등은 모듈 초기화 시 "동기"로 읽히므로, main.tsx가 앱 모듈을 로드하기 전에
//    initSecureStore()로 복호해 메모리 미러에 올려 둔다(이후 읽기는 전부 동기).
//
//  ── 데이터 유실 방지(2026-09 현장 이슈: 아침마다 명부·일일업무기록 초기화) ──
//  ① 보호 대상 키 누락: 교직원 명부·일일업무기록·방학은 SECURE_KEYS에 없어 부팅 때 복호되지
//     않았고(미러에 없음 → 항상 빈 값), 새로고침할 때마다 초기화된 것처럼 보였다.
//  ② 키 뒤바뀜: 서버 키 발급이 실패하면 로컬 파생 키로 폴백되어, 저장 시점에 따라 두 키가
//     섞였다. 한쪽 키로만 복호하면 전량 실패 → 빈 명부. 이제 후보 키를 모두 시도하고,
//     대체 키로 열린 데이터는 대표 키로 재저장(자가 치유)한다.
//  ③ 복호 실패(잠김) 상태에서는 원본 암호문을 절대 조용히 버리지 않는다 — 덮어쓰기 전에
//     .bak으로 보존하고, 부팅 후 키를 다시 받아 복구를 재시도한다(성공 시 앱에 알림).
import { encryptJson, decryptJson, schoolLinkKeyCandidates, type Enc } from './schoolCrypto'

/** 암호화 보관 대상(보건교사 기기 PII·업무기록). 여기에 없으면 부팅 시 복호되지 않는다. */
export const SECURE_KEYS = [
  'naum.roster', // 학생 명부
  'naum.teacherRoster', // 담임 명부
  'naum.staff', // 담임 외 교직원 명부
  'naum.dailyLog', // 보건 일일업무 기록
  'naum.schoolOff', // 방학·휴업일 지정
  'naum.station.links', // 재식별 링크
  'naum.cache.visits', // 방문 오프라인 캐시
] as const

/** 잠긴 데이터가 복구됐을 때 발생 — 앱은 모듈 초기화를 다시 하려면 새로고침해야 한다. */
export const SECURE_UNLOCK_EVENT = 'naum:secure-unlocked'

interface SecEnvelope extends Enc {
  __sec: 1
}

const mirror = new Map<string, string | null>()
const locked = new Set<string>() // 저장된 암호문이 있으나 이번 부팅에 복호하지 못한 키
let activeKeys: CryptoKey[] = [] // [0]=대표(저장용), 나머지는 복호 후보
let keysPromise: Promise<CryptoKey[]> | null = null
let unlockNotified = false

function getKeys(): Promise<CryptoKey[]> {
  if (!keysPromise) {
    // 키 서버 지연이 부팅을 막지 않도록 타임아웃(오프라인은 keycache로 즉시 해결됨).
    //  타임아웃돼도 유실되지 않는다 — 잠김으로 표시하고 부팅 후 재시도한다.
    keysPromise = Promise.race([
      schoolLinkKeyCandidates().catch(() => [] as CryptoKey[]),
      new Promise<CryptoKey[]>((r) => setTimeout(() => r([]), 5000)),
    ]).then((ks) => {
      if (ks.length) activeKeys = ks
      return ks
    })
  }
  return keysPromise
}

/** 덮어쓰기 전 원본 암호문 보존 — 잠긴 데이터를 되돌릴 수 있게 한다(1회만 보관). */
function backupRaw(k: string): void {
  try {
    const raw = localStorage.getItem(k)
    if (raw && !localStorage.getItem(`${k}.bak`)) localStorage.setItem(`${k}.bak`, raw)
  } catch {
    /* ignore */
  }
}

async function encryptTo(k: string, plainJson: string): Promise<void> {
  try {
    const keys = activeKeys.length ? activeKeys : await getKeys()
    const key = keys[0]
    if (!key) throw new Error('no key')
    const env: SecEnvelope = { __sec: 1, ...(await encryptJson(key, plainJson)) }
    localStorage.setItem(k, JSON.stringify(env))
  } catch {
    // 가용성 우선 — 평문 저장(다음 부팅에서 암호화 재시도). 조용한 유실보다 낫다.
    try { localStorage.setItem(k, plainJson) } catch { /* ignore */ }
    console.warn(`[naum:secure] ${k} 암호화 저장 실패 — 평문 폴백(다음 부팅에서 재시도)`)
  }
}

/** 저장된 봉투를 후보 키로 차례로 복호. 대체 키로 열리면 대표 키로 재저장(자가 치유). */
async function decryptInto(k: string, env: SecEnvelope, keys: CryptoKey[]): Promise<boolean> {
  for (let i = 0; i < keys.length; i++) {
    try {
      const plain = await decryptJson<string>(keys[i], env)
      mirror.set(k, plain)
      locked.delete(k)
      if (i > 0) void encryptTo(k, plain)
      return true
    } catch {
      /* 다음 후보 키로 */
    }
  }
  return false
}

function readEnvelope(k: string): SecEnvelope | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(k) } catch { return null }
  if (raw == null) return null
  try {
    const p = JSON.parse(raw)
    if (p && p.__sec === 1 && p.iv && p.ct) return p as SecEnvelope
  } catch {
    /* 평문 */
  }
  return null
}

/** 부팅 후 백그라운드 재시도 — 세션 갱신·네트워크 지연으로 잠겼던 데이터를 되살린다. */
async function retryUnlock(): Promise<void> {
  for (const delay of [1500, 5000, 15000, 30000]) {
    await new Promise((r) => setTimeout(r, delay))
    if (locked.size === 0) return
    let keys: CryptoKey[] = []
    try { keys = await schoolLinkKeyCandidates() } catch { continue }
    if (keys.length === 0) continue
    activeKeys = keys
    let recovered = 0
    for (const k of [...locked]) {
      const env = readEnvelope(k)
      if (!env) { locked.delete(k); continue }
      if (await decryptInto(k, env, keys)) recovered++
    }
    if (recovered > 0 && !unlockNotified) {
      unlockNotified = true
      console.warn('[naum:secure] 잠겨 있던 로컬 데이터를 복구했습니다 — 새로고침이 필요합니다.')
      try { window.dispatchEvent(new CustomEvent(SECURE_UNLOCK_EVENT, { detail: { recovered } })) } catch { /* ignore */ }
      return
    }
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
    const env = readEnvelope(k)
    if (env) { pending.push({ k, env }); continue }
    mirror.set(k, raw) // 평문 레거시 — 이번 부팅은 그대로 사용
    migrate.push({ k, plain: raw })
  }
  if (pending.length === 0 && migrate.length === 0) return // 보호 대상 없음(교사·학부모·교육청 기기) — 빠른 부팅

  const keys = await getKeys()
  for (const { k, env } of pending) {
    if (keys.length === 0 || !(await decryptInto(k, env, keys))) {
      mirror.set(k, null) // 암호문은 보존 — 이번 부팅만 빈 값
      locked.add(k)
    }
  }
  if (keys.length) for (const { k, plain } of migrate) void encryptTo(k, plain) // 평문 → 암호문 승격
  if (locked.size > 0) void retryUnlock() // 키 준비 후 자동 복구 시도
}

/** 동기 읽기(부팅 시 복호된 미러). 값은 JSON 문자열 그대로. */
export function getSecureRaw(k: string): string | null {
  return mirror.get(k) ?? null
}

/** 동기 쓰기 — 미러 즉시 갱신 + 백그라운드 암호화 저장. */
export function setSecureRaw(k: string, plainJson: string): void {
  if (locked.has(k)) backupRaw(k) // 잠긴 원본을 덮어쓰기 전 보존
  mirror.set(k, plainJson)
  locked.delete(k)
  void encryptTo(k, plainJson)
}

export function removeSecure(k: string): void {
  if (locked.has(k)) backupRaw(k)
  mirror.set(k, null)
  locked.delete(k)
  try { localStorage.removeItem(k) } catch { /* ignore */ }
}

/** 저장 존재 여부(암호문/평문 무관) — "업로드됨" 뱃지 판정용. */
export function hasStored(k: string): boolean {
  try { return localStorage.getItem(k) != null } catch { return false }
}

/** 이번 부팅에 복호하지 못한(잠긴) 키 목록 — 화면 경고용. 빈 배열이면 정상. */
export function secureLockedKeys(): string[] {
  return [...locked]
}
