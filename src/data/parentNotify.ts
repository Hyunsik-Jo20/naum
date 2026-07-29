// 학부모 알림 "발송 시점" 설정 — 실시간 발신은 학부모가 학교에 즉시 민원 연락을 하게 만들어
//  처치를 방해할 수 있어, 특정 시간에 모아 보내는 배치 옵션을 제공.
//   · realtime : 지금처럼 접수/종료 즉시 발신
//   · daily1   : 하루 1회, 지정 시각에 모아 발신
//   · daily2   : 하루 2회, 지정 두 시각에 모아 발신
//   · hourly   : 매시 정각에 모아 발신
//  배치 모드에선 학부모 알림을 로컬 큐(naum.parentNotify.queue)에 쌓아두고, 보건교사 콘솔의
//  스케줄러(flushDue)가 지정 시각이 지나면 offline 아웃박스로 한꺼번에 넘겨 발신한다.
//  설정·큐는 이 기기(보건실 콘솔)에 저장. 담임 알림은 이 설정과 무관하게 항상 실시간.
import type { ClassPayload } from './station'
import * as offline from './offline'

export type ParentNotifyMode = 'realtime' | 'daily1' | 'daily2' | 'hourly'

export interface ParentNotifyConfig {
  mode: ParentNotifyMode
  times: string[] // 'HH:MM' — daily1은 1개, daily2는 2개 사용
}

const LS_CFG = 'naum.parentNotify'
const LS_QUEUE = 'naum.parentNotify.queue'
const LS_LAST = 'naum.parentNotify.lastFlush' // 마지막으로 발송 처리한 스케줄 시각(epoch)

const DEFAULT: ParentNotifyConfig = { mode: 'realtime', times: ['12:40', '15:00'] }

export function loadParentNotify(): ParentNotifyConfig {
  try {
    const o = JSON.parse(localStorage.getItem(LS_CFG) || 'null')
    if (o && typeof o === 'object' && typeof o.mode === 'string') {
      return { mode: o.mode as ParentNotifyMode, times: Array.isArray(o.times) && o.times.length ? o.times : DEFAULT.times }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT }
}

export function saveParentNotify(c: ParentNotifyConfig): void {
  try { localStorage.setItem(LS_CFG, JSON.stringify(c)) } catch { /* ignore */ }
}

/** 사람이 읽는 요약 — 콘솔 인라인 표시용. */
export function parentNotifySummary(c: ParentNotifyConfig = loadParentNotify()): string {
  switch (c.mode) {
    case 'realtime': return '실시간'
    case 'daily1': return `하루 1회 ${c.times[0] ?? '15:00'}`
    case 'daily2': return `하루 2회 ${c.times[0] ?? '12:40'}·${c.times[1] ?? '15:00'}`
    case 'hourly': return '매시 정각'
  }
}

interface PendingParent { studentId: string; payload: ClassPayload; ts: number }

function loadQueue(): PendingParent[] {
  try { const a = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function saveQueue(q: PendingParent[]): void {
  try { localStorage.setItem(LS_QUEUE, JSON.stringify(q)) } catch { /* ignore */ }
}

export function pendingCount(): number { return loadQueue().length }

/** 학부모 알림 1건 — 실시간이면 즉시 발신(offline), 배치면 큐에 적재(스케줄러가 발신). */
export function emitParent(studentId: string, payload: ClassPayload, ts: number): void {
  if (loadParentNotify().mode === 'realtime') {
    offline.run({ type: 'emitStudent', studentId, payload, ts })
    return
  }
  saveQueue([...loadQueue(), { studentId, payload, ts }])
}

/** 오늘 기준 스케줄 발송 시각(자정 이후 분). hourly는 매 정각. */
function scheduledMinutes(c: ParentNotifyConfig): number[] {
  const parse = (s: string) => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  if (c.mode === 'hourly') return Array.from({ length: 24 }, (_, h) => h * 60)
  if (c.mode === 'daily1') return [parse(c.times[0] || '15:00')]
  if (c.mode === 'daily2') return [parse(c.times[0] || '12:40'), parse(c.times[1] || '15:00')].sort((a, b) => a - b)
  return []
}

/**
 * 스케줄러 틱 — 지정 시각이 지났고 아직 그 시각분을 발송 안 했으면 큐를 비우고 발신.
 *  콘솔에서 주기적으로(+마운트 시 catch-up) 호출. 발신 건수를 반환.
 */
export function flushDue(now: number = Date.now()): number {
  const cfg = loadParentNotify()
  if (cfg.mode === 'realtime') return 0
  const mins = scheduledMinutes(cfg)
  if (!mins.length) return 0
  const d = new Date(now)
  const nowMin = d.getHours() * 60 + d.getMinutes()
  const passed = mins.filter((m) => m <= nowMin)
  if (!passed.length) return 0 // 오늘 첫 스케줄 전 — 대기
  const midnight = new Date(d); midnight.setHours(0, 0, 0, 0)
  const lastPassedEpoch = midnight.getTime() + Math.max(...passed) * 60000
  let lastFlush = 0
  try { lastFlush = Number(localStorage.getItem(LS_LAST) || '0') } catch { /* ignore */ }
  if (lastFlush >= lastPassedEpoch) return 0 // 이 스케줄 시각분은 이미 처리함

  const q = loadQueue()
  saveQueue([]) // 먼저 비우고(중복 발신 방지) 발신
  for (const it of q) offline.run({ type: 'emitStudent', studentId: it.studentId, payload: it.payload, ts: it.ts })
  try { localStorage.setItem(LS_LAST, String(lastPassedEpoch)) } catch { /* ignore */ }
  return q.length
}
