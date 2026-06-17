// 공휴일/국경일 — 보건실 미운영일. (데모: 2025~2026 주요 공휴일)
export const HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날',
  '2026-02-17': '설날',
  '2026-02-18': '설날',
  '2026-03-01': '삼일절',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-06-03': '지방선거일',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-09-24': '추석',
  '2026-09-25': '추석',
  '2026-09-26': '추석',
  '2026-10-03': '개천절',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  '2025-05-05': '어린이날',
  '2025-05-06': '부처님오신날',
  '2025-06-03': '임시공휴일',
  '2025-06-06': '현충일',
}

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function holidayName(d: Date): string | undefined {
  return HOLIDAYS[key(d)]
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay()
  return w === 0 || w === 6
}

/** 보건실 운영일 = 평일 & 공휴일 아님 */
export function isOperatingDay(d: Date): boolean {
  return !isWeekend(d) && !holidayName(d)
}
