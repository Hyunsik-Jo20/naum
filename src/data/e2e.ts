// 종단간 암호화(E2E) — 대칭키(AES-GCM)로 알림 내용을 암호화.
// 반 키(담임)·학생 키(학부모)는 스테이션과 해당 수신자에게만 프로비저닝, 중계 서버는 키가 없어 내용을 못 본다.
// Web Crypto는 보안 컨텍스트(https/localhost)에서 동작.
const LS_CLASS_KEYS = 'naum.classkeys'
const LS_STUDENT_KEYS = 'naum.studentkeys'

export interface Enc {
  iv: string
  ct: string
}

function abToB64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s)
}
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

function loadKeys(lsKey: string): Record<string, string> {
  try {
    const m = JSON.parse(localStorage.getItem(lsKey) || '{}')
    return m && typeof m === 'object' ? m : {}
  } catch {
    return {}
  }
}

/** 지정 네임스페이스의 키(없으면 발급). 스테이션·수신자에게만 있는 비밀키 — 중계 서버엔 없음. */
async function getOrCreateKey(lsKey: string, id: string): Promise<CryptoKey> {
  const m = loadKeys(lsKey)
  if (!m[id]) {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const raw = await crypto.subtle.exportKey('raw', k)
    m[id] = abToB64(raw)
    try {
      localStorage.setItem(lsKey, JSON.stringify(m))
    } catch {
      /* ignore */
    }
  }
  return crypto.subtle.importKey('raw', b64ToBytes(m[id]) as unknown as BufferSource, 'AES-GCM', true, ['encrypt', 'decrypt'])
}

/** 반 키 — 스테이션·담임에게만. */
export const getClassKey = (grade: number, classNo: number) => getOrCreateKey(LS_CLASS_KEYS, `${grade}-${classNo}`)
/** 학생 키 — 스테이션·해당 학부모에게만. */
export const getStudentKey = (studentId: string) => getOrCreateKey(LS_STUDENT_KEYS, studentId)

export async function encryptJson(key: CryptoKey, obj: unknown): Promise<Enc> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(obj))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, data as unknown as BufferSource)
  return { iv: abToB64(iv), ct: abToB64(ct) }
}

export async function decryptJson<T = unknown>(key: CryptoKey, enc: Enc): Promise<T> {
  const iv = b64ToBytes(enc.iv)
  const ct = b64ToBytes(enc.ct)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, ct as unknown as BufferSource)
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

export function clearKeys() {
  try {
    localStorage.removeItem(LS_CLASS_KEYS)
    localStorage.removeItem(LS_STUDENT_KEYS)
  } catch {
    /* ignore */
  }
}
