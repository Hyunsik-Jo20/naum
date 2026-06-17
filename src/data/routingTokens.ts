// 알림 라우팅 토큰 — 보건실 로컬(PII) 측. 학생당 안정적 난수 토큰을 발급/보관.
// 매핑(토큰 ↔ 학생)은 이 브라우저(로컬)에만 존재한다. 서버/중계는 토큰만 안다.
// (방문 비식별 토큰과는 별개 — 통계용 방문 토큰은 매번 새로 생성.)
const LS_KEY = 'naum.rtokens'

function load(): Record<string, string> {
  try {
    const m = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    return m && typeof m === 'object' ? m : {}
  } catch {
    return {}
  }
}

function save(m: Record<string, string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

function randomToken(): string {
  const c = (globalThis.crypto as Crypto | undefined)
  if (c?.randomUUID) return c.randomUUID()
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

/** 학생의 라우팅 토큰(없으면 발급). 암호학적 난수, 학생 정보에서 유도하지 않음. */
export function getRoutingToken(studentId: string): string {
  const m = load()
  if (m[studentId]) return m[studentId]
  m[studentId] = randomToken()
  save(m)
  return m[studentId]
}

export function allRoutingTokens(): Record<string, string> {
  return load()
}

/** 토큰 → 학생 id (로컬에서만 가능). 서버/중계는 이 역매핑이 없다. */
export function studentIdOfToken(token: string): string | undefined {
  const m = load()
  return Object.keys(m).find((sid) => m[sid] === token)
}

export function clearRoutingTokens() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

export function tokenShort(t: string): string {
  return t.replace(/-/g, '').slice(0, 10)
}

// ── 반(class) 채널 토큰 + 반 한정 식별 매핑(담임에게만 프로비저닝) ──
const LS_CTOK = 'naum.ctokens'

function loadC(): Record<string, string> {
  try {
    const m = JSON.parse(localStorage.getItem(LS_CTOK) || '{}')
    return m && typeof m === 'object' ? m : {}
  } catch {
    return {}
  }
}

/** 반 채널 토큰(없으면 발급). 교사 기기가 이 토큰의 채널만 수신한다. */
export function getClassToken(grade: number, classNo: number): string {
  const key = `${grade}-${classNo}`
  const m = loadC()
  if (m[key]) return m[key]
  m[key] = randomToken()
  try {
    localStorage.setItem(LS_CTOK, JSON.stringify(m))
  } catch {
    /* ignore */
  }
  return m[key]
}

export interface ClassMapEntry { token: string; name: string; number: number }
