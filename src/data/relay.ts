// 익명 중계 서버(시뮬레이션). 토큰만 안다 — 이름·반·전화번호 없음.
// 별도 저장키로 보관해 "보건 데이터/PII와 분리된 시스템"을 표현.
import type { Enc } from './e2e'

const LS_REG = 'naum.relay.reg'
const LS_INBOX = 'naum.relay.inbox'
const LS_CLASS = 'naum.relay.classinbox'
const LS_STUDENT = 'naum.relay.studentinbox'

export interface Registration {
  token: string // 불투명 라우팅 토큰(누구인지 모름)
  channel: string // 등록된 보호자 기기 채널(예: 푸시 구독 식별자)
  ts: number
}

export interface RelayMsg {
  token: string
  kind: '접수' | '종료'
  body: string
  ts: number
}

function read<T>(key: string): T[] {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}
function write<T>(key: string, list: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export const loadReg = () => read<Registration>(LS_REG)
export const loadInbox = () => read<RelayMsg>(LS_INBOX)

/** 보호자 기기 등록 — 토큰 ↔ 채널. (이름 없음) */
export function relayRegister(token: string): Registration[] {
  const list = loadReg().filter((r) => r.token !== token)
  list.push({ token, channel: `push-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() })
  write(LS_REG, list)
  return list
}

export function isRegistered(token: string): boolean {
  return loadReg().some((r) => r.token === token)
}

/** 토큰으로 배달 — 서버는 토큰 엔드포인트로만 전달. */
export function relayDeliver(token: string, kind: RelayMsg['kind'], body: string): RelayMsg[] {
  const list = loadInbox()
  list.unshift({ token, kind, body, ts: Date.now() })
  write(LS_INBOX, list.slice(0, 50))
  return loadInbox()
}

// ── 반 채널 — 토큰 + 암호문만(이름·증상 평문 없음). 교사 기기가 반 키로 복호화 + 반 매핑으로 풀이. ──
export interface ClassEvent {
  classToken: string
  studentToken: string
  enc: Enc // {kind, sym, outcome}를 반 키로 암호화 — 서버는 못 읽음
  ts: number
}

/** 스테이션이 보낸 반 이벤트 스냅샷으로 교체(해당 반만). */
export function relaySetClassInbox(classToken: string, events: ClassEvent[]) {
  const others = read<ClassEvent>(LS_CLASS).filter((e) => e.classToken !== classToken)
  write(LS_CLASS, [...others, ...events])
}

export function loadClassInbox(classToken: string): ClassEvent[] {
  return read<ClassEvent>(LS_CLASS)
    .filter((e) => e.classToken === classToken)
    .sort((a, b) => b.ts - a.ts)
}

// ── 학생(보호자) 채널 — 토큰 + 암호문만. 학부모 기기가 학생 키로 복호화. ──
export interface StudentEvent {
  studentToken: string
  enc: Enc
  ts: number
}

export function relaySetStudentInbox(studentToken: string, events: StudentEvent[]) {
  const others = read<StudentEvent>(LS_STUDENT).filter((e) => e.studentToken !== studentToken)
  write(LS_STUDENT, [...others, ...events])
}

export function loadStudentInbox(studentToken: string): StudentEvent[] {
  return read<StudentEvent>(LS_STUDENT)
    .filter((e) => e.studentToken === studentToken)
    .sort((a, b) => b.ts - a.ts)
}

export function clearRelay() {
  try {
    localStorage.removeItem(LS_REG)
    localStorage.removeItem(LS_INBOX)
    localStorage.removeItem(LS_CLASS)
    localStorage.removeItem(LS_STUDENT)
  } catch {
    /* ignore */
  }
}
