// 오프라인 아웃박스 — 인터넷이 없거나 전송이 실패할 때 쓰기(접수·처치·알림)를 큐에 쌓고,
// 재연결/재시도 시 순서대로 업로드. 유실 없이(실패해도 큐 보존), 지수 백오프로 재시도.
//  · 온라인+큐 비어있으면 즉시 시도, 실패하면 큐에 넣어 재시도 → 유실 방지.
//  · 오프라인이거나 앞에 밀린 게 있으면 큐에 적재(순서 보존).
//  · 재시도 트리거: 'online' 이벤트 + 탭 활성화(visibilitychange) + 주기 타이머 + 지수 백오프.
//  · MAX_TRIES 초과 op는 dead-letter로 격리(포이즌 op가 큐를 막지 않도록, 유실은 콘솔+보관).
//  · supabase 모드 전용(클라우드 대상). 캐시(visits/links)는 visits.tsx 가 별도 보관.
import type { Visit } from '../types'
import type { ClassPayload } from './station'
import * as sb from '../api/supabaseBackend'
import * as relay from '../api/supabaseRelay'

export type OutboxOp =
  | { type: 'createVisit'; visit: Visit; studentId: string }
  | { type: 'patchVisit'; id: string; patch: Partial<Visit> }
  | { type: 'deleteVisit'; id: string }
  | { type: 'emitClass'; grade: number; classNo: number; studentId: string; payload: ClassPayload; ts: number }
  | { type: 'emitStudent'; studentId: string; payload: ClassPayload; ts: number }

type Entry = { id: string; op: OutboxOp; tries: number }

const LS = 'naum.outbox'
const DEAD = 'naum.outbox.dead'
const MAX_TRIES = 8 // 초과 시 dead-letter 격리
const BACKOFF_MAX = 30000 // 재시도 상한 30초
const POLL_MS = 20000 // 주기 재시도(이벤트 누락 대비)

const listeners = new Set<() => void>()
let seq = 0
const newId = () => `${Date.now()}.${seq++}`
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function readArr(key: string): unknown[] {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

/** 큐 로드 + 정규화(구버전 bare op / 누락 id 보정, 손상 항목 제거). 형태가 바뀌면 1회 저장. */
function load(): Entry[] {
  const raw = readArr(LS)
  let changed = false
  const norm: Entry[] = []
  for (const e of raw) {
    if (e && typeof e === 'object' && 'op' in e && (e as Entry).op && typeof (e as Entry).op.type === 'string') {
      const en = e as Partial<Entry> & { op: OutboxOp }
      if (typeof en.id === 'string') norm.push({ id: en.id, op: en.op, tries: en.tries ?? 0 })
      else { norm.push({ id: newId(), op: en.op, tries: en.tries ?? 0 }); changed = true }
    } else if (e && typeof e === 'object' && typeof (e as OutboxOp).type === 'string') {
      norm.push({ id: newId(), op: e as OutboxOp, tries: 0 }) // 구버전(맨 op) 마이그레이션
      changed = true
    } else {
      changed = true // 손상 항목 폐기
    }
  }
  if (changed) {
    try { localStorage.setItem(LS, JSON.stringify(norm)) } catch { /* ignore */ }
  }
  return norm
}

function save(q: Entry[]) {
  try { localStorage.setItem(LS, JSON.stringify(q)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

function enqueue(op: OutboxOp) {
  save([...load(), { id: newId(), op, tries: 0 }])
}

function deadLetter(op: OutboxOp, reason: string) {
  try {
    const arr = readArr(DEAD) as unknown[]
    arr.push({ op, reason, at: Date.now() })
    localStorage.setItem(DEAD, JSON.stringify(arr.slice(-50))) // 최근 50건만 보관
  } catch { /* ignore */ }
  console.warn('[naum:outbox] 재시도 한도 초과로 격리:', reason, op)
}

export const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
export const pendingCount = () => load().length
export const deadCount = () => readArr(DEAD).length
/** 큐에 재시도(실패 이력) 중인 항목이 있는지 — 상단바 표시용. */
export const hasFailures = () => load().some((e) => e.tries > 0)

export function onChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

async function exec(op: OutboxOp): Promise<void> {
  switch (op.type) {
    case 'createVisit':
      return sb.createVisit(op.visit, op.studentId)
    case 'patchVisit':
      return sb.patchVisit(op.id, op.patch)
    case 'deleteVisit':
      return sb.deleteVisit(op.id)
    case 'emitClass':
      return relay.emitClass(op.grade, op.classNo, op.studentId, op.payload, op.ts)
    case 'emitStudent':
      return relay.emitStudent(op.studentId, op.payload, op.ts)
  }
}

/** 쓰기 1건. 온라인+큐 비어있으면 즉시 시도(빠른 경로), 실패하면 큐로. 아니면 큐에 적재(순서 보존). */
export function run(op: OutboxOp): void {
  if (isOnline() && pendingCount() === 0) {
    void exec(op).catch(() => {
      enqueue(op) // 유실 방지: 실패분은 큐로 → 재시도
      void flush()
    })
  } else {
    enqueue(op)
    void flush()
  }
}

let flushing = false
let retryTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRetry(delay: number) {
  if (typeof window === 'undefined' || retryTimer != null) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flush()
  }, delay)
}

/** 큐를 순서대로 업로드. 실패한 op는 버리지 않고 백오프 재시도(뒤 op는 순서 보존 위해 대기). */
export async function flush(): Promise<void> {
  if (flushing || !isOnline()) return
  flushing = true
  try {
    while (isOnline()) {
      const q = load()
      if (q.length === 0) return
      const head = q[0]
      try {
        await exec(head.op)
        save(load().filter((e) => e.id !== head.id)) // 성공 제거(동시 append 보존 위해 재로드)
      } catch (e) {
        const tries = head.tries + 1
        if (tries >= MAX_TRIES) {
          deadLetter(head.op, msg(e))
          save(load().filter((e2) => e2.id !== head.id))
          continue // 포이즌 제거 후 다음 op
        }
        save(load().map((e2) => (e2.id === head.id ? { ...e2, tries } : e2)))
        scheduleRetry(Math.min(BACKOFF_MAX, 1000 * 2 ** (tries - 1))) // 1s,2s,4s…30s
        return // 순서 보존: 실패 op 뒤는 다음 재시도 때
      }
    }
  } finally {
    flushing = false
  }
}

/** 재연결·재시도 자동화 등록(앱 부팅 시 1회). */
let started = false
export function initAutoFlush(): void {
  if (typeof window === 'undefined' || started) return
  started = true
  window.addEventListener('online', () => void flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })
  window.setInterval(() => {
    if (pendingCount() > 0) void flush()
  }, POLL_MS)
  if (isOnline()) void flush() // 부팅 시 밀린 것 처리
}
