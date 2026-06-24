// 오프라인 아웃박스 — 인터넷이 없을 때 쓰기(접수·처치·알림)를 큐에 쌓고, 재연결되면 한꺼번에 업로드.
//  · 온라인이면 바로 전송(기존 동작), 오프라인이면 localStorage 큐에 적재.
//  · 'online' 이벤트 또는 수동 호출 시 flush 로 순서대로 업로드.
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

const LS = 'naum.outbox'
const listeners = new Set<() => void>()

function load(): OutboxOp[] {
  try {
    const a = JSON.parse(localStorage.getItem(LS) || '[]')
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}
function save(q: OutboxOp[]) {
  try {
    localStorage.setItem(LS, JSON.stringify(q))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
export const pendingCount = () => load().length
export function onChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function enqueue(op: OutboxOp) {
  save([...load(), op])
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

/** 쓰기 1건: 온라인이면 즉시 전송, 오프라인이면 큐에 적재. */
export function run(op: OutboxOp): void {
  if (isOnline()) {
    void exec(op)
  } else {
    enqueue(op)
  }
}

let flushing = false
/** 큐를 순서대로 업로드. 오프라인이거나 비어있으면 무시. */
export async function flush(): Promise<void> {
  if (flushing || !isOnline()) return
  const q = load()
  if (q.length === 0) return
  flushing = true
  try {
    const remaining = [...q]
    while (remaining.length && isOnline()) {
      const op = remaining[0]
      try {
        await exec(op)
      } catch {
        /* 전송 실패해도 다음 진행(프로토타입: 무한 재시도 방지) */
      }
      remaining.shift()
      save(remaining) // 진행 상황 영속(중간에 닫혀도 남은 것만 보존)
    }
  } finally {
    flushing = false
  }
}

/** 재연결 시 자동 업로드 등록(앱 부팅 시 1회). */
export function initAutoFlush(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => void flush())
  if (isOnline()) void flush() // 부팅 시 밀린 것 처리
}
