// 보건 일일업무 기록 — 학생 처치 외 보건교사 본연 업무(보건교육·보건업무·학교행사)와
//  비공개 메모. 날짜별로 이 기기(로컬, 암호화)에 저장되고, 보건교육/보건업무/학교행사는
//  보건일지 엑셀 출력 시 해당 날짜 상단 칸에 자동으로 들어간다. 기타(메모)는 출력되지 않는다.
import { getSecureRaw, setSecureRaw } from './secureStore'

export interface DailyLog {
  edu?: string // 보건교육 → 보건일지 '보건교육' 칸
  work?: string // 보건업무 → 보건일지 '보건업무' 칸
  event?: string // 학교행사 → 보건일지 '학교행사' 칸
  memo?: string // 기타 — 보건교사만 보는 메모(출력 안 됨)
}

const LS = 'naum.dailyLog'

export const dailyKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function loadAll(): Record<string, DailyLog> {
  try {
    const o = JSON.parse(getSecureRaw(LS) || 'null')
    return o && typeof o === 'object' ? (o as Record<string, DailyLog>) : {}
  } catch {
    return {}
  }
}

export function dailyLogOf(date: Date): DailyLog {
  return loadAll()[dailyKey(date)] ?? {}
}

/** 내용이 하나라도 있는 날짜 키 집합(캘린더 점 표시용). */
export function dailyLogDates(): Set<string> {
  const all = loadAll()
  return new Set(
    Object.keys(all).filter((k) => {
      const l = all[k]
      return (l.edu ?? '') + (l.work ?? '') + (l.event ?? '') + (l.memo ?? '') !== ''
    }),
  )
}

export function saveDailyLog(date: Date, log: DailyLog): void {
  const all = loadAll()
  const k = dailyKey(date)
  const empty = !((log.edu ?? '') + (log.work ?? '') + (log.event ?? '') + (log.memo ?? ''))
  if (empty) delete all[k]
  else all[k] = log
  setSecureRaw(LS, JSON.stringify(all))
}
