// 월간 방문 데이터(이번 달 / 전월 / 전년 동월) — 학교×일자×계통. 데모 합성.
// 운영일(평일·공휴일 아님)만 방문 발생, 미운영일은 0. 날짜별 변동은 결정적 노이즈.
import type { EduSchool } from './eduMock'
import { holidayName, isOperatingDay } from './holidays'

export interface DayMeta {
  operating: boolean
  holiday?: string
  weekend: boolean
}

export interface MonthAgg {
  labels: string[] // 일자(1..N)
  cur: number[][] // 이번 달: days × 12
  prev: number[][] // 전월
  lastYear: number[][] // 전년 동월
  meta: DayMeta[] // 이번 달 일자별 운영/공휴일 정보
  curFactors: number[] // 이번 달 일자별 변동계수(미운영일 0) — 학교/지역 일자 배분용
}

function hash(a: number, b: number, c: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return x - Math.floor(x) // 0..1
}

function buildAgg(
  schools: EduSchool[],
  year: number,
  month: number,
  days: number,
  scale: number,
): number[][] {
  const baseCat = new Array(12).fill(0)
  schools.forEach((s) => s.cat.forEach((n, c) => (baseCat[c] += n)))
  const perDay = baseCat.map((v) => v / 5) // 주중 1일 평균(주 5일)
  const out: number[][] = []
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d)
    const f = isOperatingDay(date) ? 0.8 + 0.4 * hash(year, month, d) : 0 // 미운영일 0
    out.push(perDay.map((v) => Math.round(v * f * scale)))
  }
  return out
}

export function buildMonthly(schools: EduSchool[], now: Date = new Date()): MonthAgg {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const today = now.getDate()
  const daysPrev = new Date(y, m, 0).getDate() // 전월 총일수
  const daysLy = new Date(y - 1, m + 1, 0).getDate() // 전년 동월 총일수

  const cur = buildAgg(schools, y, m, today, 1)
  const prev = buildAgg(schools, y, m - 1, Math.min(today, daysPrev), 0.93)
  const lastYear = buildAgg(schools, y - 1, m, Math.min(today, daysLy), 0.86)

  const meta: DayMeta[] = Array.from({ length: today }, (_, i) => {
    const date = new Date(y, m, i + 1)
    const w = date.getDay() === 0 || date.getDay() === 6
    return { operating: isOperatingDay(date), holiday: holidayName(date), weekend: w }
  })
  const curFactors = Array.from({ length: today }, (_, i) => {
    const d = i + 1
    return isOperatingDay(new Date(y, m, d)) ? 0.8 + 0.4 * hash(y, m, d) : 0
  })

  return {
    labels: Array.from({ length: today }, (_, i) => String(i + 1)),
    cur,
    prev,
    lastYear,
    meta,
    curFactors,
  }
}
