// 교장 보고 — 일일 보건실 보고. 오늘은 로컬 방문(실데이터), 과거일은 결정적 합성.
// 월간 보고서는 주(週) 단위 시트로 나눠 엑셀로 내보낸다.
import type { Outcome, Visit } from '../types'
import { DISEASE_CATEGORIES } from './mock'
import { holidayName, isOperatingDay } from './holidays'
import type { SheetSpec } from './excel'

const WD = ['일', '월', '화', '수', '목', '금', '토']
const OUTCOME_KEYS: Outcome[] = ['교실 복귀', '귀가', '병원 이송', '관찰']

export interface DailyReport {
  date: string // YYYY-MM-DD
  weekdayIdx: number // 0=일
  operating: boolean
  holiday?: string
  total: number
  outcomes: Record<Outcome, number>
  byCat: number[] // 12 계통
  topCat: string
  notable: string[] // 특이사항
  source: 'auto' | 'synth' // 오늘 자동마감 vs 합성 이력
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyOutcomes(): Record<Outcome, number> {
  return { '교실 복귀': 0, 귀가: 0, '병원 이송': 0, 관찰: 0 }
}

function topCatOf(byCat: number[]): string {
  const max = Math.max(...byCat)
  return max > 0 ? DISEASE_CATEGORIES[byCat.indexOf(max)] : '-'
}

function notableOf(byCat: number[], outcomes: Record<Outcome, number>): string[] {
  const out: string[] = []
  if (outcomes['병원 이송'] > 0) out.push(`병원 이송 ${outcomes['병원 이송']}건`)
  if (byCat[10] > 0) out.push(`감염병 의심 ${byCat[10]}건`)
  if (outcomes['귀가'] >= 3) out.push(`조기 귀가 ${outcomes['귀가']}건`)
  return out
}

/** 오늘(또는 임의 날짜)의 실제 로컬 방문으로 일일 보고 작성. */
export function reportFromVisits(date: Date, visits: Visit[], source: 'auto' | 'synth' = 'auto'): DailyReport {
  const key = dateKey(date)
  const todays = visits.filter((v) => dateKey(new Date(v.createdAt)) === key)
  const byCat = new Array(12).fill(0)
  const outcomes = emptyOutcomes()
  todays.forEach((v) => {
    const primary = v.diseases.find((d) => d.isPrimary) ?? v.diseases[0]
    if (primary) {
      const ci = DISEASE_CATEGORIES.indexOf(primary.category)
      if (ci >= 0) byCat[ci] += 1
    }
    if (v.outcome && v.outcome in outcomes) outcomes[v.outcome] += 1
  })
  return {
    date: key,
    weekdayIdx: date.getDay(),
    operating: isOperatingDay(date),
    holiday: holidayName(date),
    total: todays.length,
    outcomes,
    byCat,
    topCat: topCatOf(byCat),
    notable: notableOf(byCat, outcomes),
    source,
  }
}

function hash(a: number, b: number): number {
  const x = Math.sin(a * 91.7 + b * 31.4) * 43758.5453
  return x - Math.floor(x)
}

/** 과거일의 합성 일일 보고(결정적). 미운영일은 0. */
export function synthDailyReport(date: Date): DailyReport {
  const key = dateKey(date)
  const operating = isOperatingDay(date)
  const holiday = holidayName(date)
  if (!operating) {
    return { date: key, weekdayIdx: date.getDay(), operating, holiday, total: 0, outcomes: emptyOutcomes(), byCat: new Array(12).fill(0), topCat: '-', notable: [], source: 'synth' }
  }
  const seed = date.getDate()
  const m = date.getMonth() + 1
  const base = 14 + Math.round(hash(seed, m) * 16) // 일 14~30건
  const byCat = new Array(12).fill(0)
  byCat[0] = Math.round(base * 0.32) // 호흡기계
  byCat[1] = Math.round(base * 0.2) // 소화기계
  byCat[5] = Math.round(base * 0.16) // 피부피하계
  byCat[4] = Math.round(base * 0.12) // 근골격계
  byCat[3] = Math.round(base * 0.08) // 정신신경계
  byCat[9] = Math.round(base * 0.05) // 안과계
  byCat[8] = Math.round(base * 0.04) // 이비인후과계
  byCat[10] = hash(seed, m + 7) > 0.78 ? 1 + Math.round(hash(seed, m) * 2) : 0 // 감염병 가끔
  byCat[11] = Math.max(0, base - byCat.reduce((a, b) => a + b, 0))
  const total = byCat.reduce((a, b) => a + b, 0)
  const hospital = hash(seed, m + 3) > 0.85 ? 1 : 0
  const home = Math.round(total * 0.12)
  const observe = Math.round(total * 0.08)
  const outcomes: Record<Outcome, number> = {
    '병원 이송': hospital,
    귀가: home,
    관찰: observe,
    '교실 복귀': Math.max(0, total - hospital - home - observe),
  }
  return {
    date: key,
    weekdayIdx: date.getDay(),
    operating,
    holiday,
    total,
    outcomes,
    byCat,
    topCat: topCatOf(byCat),
    notable: notableOf(byCat, outcomes),
    source: 'synth',
  }
}

/** 이번 달 1일~오늘까지 일일 보고 배열. saved(마감본)·todayLive 우선, 없으면 합성. */
export function monthReports(
  now: Date,
  saved: Record<string, DailyReport>,
  todayLive?: DailyReport,
): DailyReport[] {
  const y = now.getFullYear()
  const m = now.getMonth()
  const todayKey = dateKey(now)
  const out: DailyReport[] = []
  for (let d = 1; d <= now.getDate(); d++) {
    const date = new Date(y, m, d)
    const key = dateKey(date)
    if (saved[key]) out.push(saved[key])
    else if (key === todayKey && todayLive) out.push(todayLive)
    else out.push(synthDailyReport(date))
  }
  return out
}

/** 일일 보고 → 한 줄 요약 텍스트(교장 보고용). */
export function dailySummaryText(r: DailyReport): string {
  if (!r.operating) return `${r.holiday ?? '주말'} · 보건실 미운영`
  const o = r.outcomes
  const parts = [`총 ${r.total}건`, `최다 ${r.topCat}`, `교실복귀 ${o['교실 복귀']} · 귀가 ${o['귀가']} · 병원 ${o['병원 이송']} · 관찰 ${o['관찰']}`]
  if (r.notable.length) parts.push(`특이사항: ${r.notable.join(', ')}`)
  return parts.join(' / ')
}

// ── 월간 엑셀(주간 시트) ──
const HEADER = ['날짜', '요일', '총방문', '교실복귀', '귀가', '병원이송', '관찰', '최다계통', '특이사항']

function isoMonday(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 월=0
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

function rowOf(r: DailyReport): (string | number)[] {
  const [, mm, dd] = r.date.split('-')
  const o = r.outcomes
  if (!r.operating) return [`${mm}/${dd}`, WD[r.weekdayIdx], r.holiday ?? '주말', '', '', '', '', '미운영', '']
  return [`${mm}/${dd}`, WD[r.weekdayIdx], r.total, o['교실 복귀'], o['귀가'], o['병원 이송'], o['관찰'], r.topCat, r.notable.join('; ')]
}

/** 월간 일일 보고 → 주(週)별 시트 + 요약 시트. */
export function buildMonthlySheets(now: Date, reports: DailyReport[]): SheetSpec[] {
  // 주 단위 그룹(월요일 시작)
  const weeks = new Map<string, DailyReport[]>()
  reports.forEach((r) => {
    const mon = isoMonday(new Date(r.date))
    const k = dateKey(mon)
    if (!weeks.has(k)) weeks.set(k, [])
    weeks.get(k)!.push(r)
  })
  const weekKeys = [...weeks.keys()].sort()
  const ym = `${now.getFullYear()}년 ${now.getMonth() + 1}월`
  // 시트명용 날짜(M.D) — '/'는 시트명에 못 쓰므로 '.' 사용
  const dot = (dateK: string) => {
    const [, mm, dd] = dateK.split('-')
    return `${Number(mm)}.${Number(dd)}`
  }

  // 요약 시트
  const opDays = reports.filter((r) => r.operating)
  const totalVisits = opDays.reduce((a, r) => a + r.total, 0)
  const sumByCat = new Array(12).fill(0)
  const sumOut = { '교실 복귀': 0, 귀가: 0, '병원 이송': 0, 관찰: 0 } as Record<Outcome, number>
  opDays.forEach((r) => {
    r.byCat.forEach((n, i) => (sumByCat[i] += n))
    OUTCOME_KEYS.forEach((k) => (sumOut[k] += r.outcomes[k]))
  })
  const summaryRows: (string | number)[][] = [
    [`${ym} 학교보건 월간 보고서`],
    ['운영일수', opDays.length, '총 방문', totalVisits, '일평균', opDays.length ? Math.round(totalVisits / opDays.length) : 0],
    [],
    ['결과 분포', '교실복귀', sumOut['교실 복귀'], '귀가', sumOut['귀가'], '병원이송', sumOut['병원 이송'], '관찰', sumOut['관찰']],
    [],
    ['계통별 합계'],
    ...DISEASE_CATEGORIES.map((c, i) => [c, sumByCat[i]]).filter((r) => (r[1] as number) > 0),
    [],
    ['주차', '기간', '운영일', '방문합계'],
    ...weekKeys.map((k, i) => {
      const ws = weeks.get(k)!
      const op = ws.filter((r) => r.operating)
      const first = ws[0].date.split('-').slice(1).join('/')
      const last = ws[ws.length - 1].date.split('-').slice(1).join('/')
      return [`${i + 1}주차`, `${first}~${last}`, op.length, op.reduce((a, r) => a + r.total, 0)]
    }),
  ]

  const sheets: SheetSpec[] = [{ name: '월간 요약', rows: summaryRows }]
  weekKeys.forEach((k, i) => {
    const ws = weeks.get(k)!
    const op = ws.filter((r) => r.operating)
    const total = op.reduce((a, r) => a + r.total, 0)
    sheets.push({
      name: `${i + 1}주차(${dot(ws[0].date)}-${dot(ws[ws.length - 1].date)})`,
      rows: [HEADER, ...ws.map(rowOf), ['합계', '', total, '', '', '', '', '', '']],
    })
  })
  return sheets
}
