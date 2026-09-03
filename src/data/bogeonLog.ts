// 보건일지(업로드 양식과 동일 형식) 생성 — 주별 시트 · 일자별 응급처치 표 + 통계.
// 규칙: 병명 여러 개 → 병명칸엔 모두 표시, 통계엔 "첫 번째 병명"만 집계.
import type { Sex, Visit } from '../types'
import { tileById } from '../data/mock'
import { holidayName, isOperatingDay } from '../data/holidays'
import { dailyLogOf } from './dailyLog'
import type { XCell, XRow, XSheet } from './excel'

const WD = ['일', '월', '화', '수', '목', '금', '토']

// 통계 14개 병명 분류(업로드 양식 순서 그대로)
export const BOGEON_CATS = [
  '소화기질환', '생리[통]', '두통', '감기몸살', '외상', '타박상', '근육통',
  '골절염좌', '이비인후과', '안질환', '피부질환', '구강질환', '알레르기', '기타',
] as const

/** 병명·계통 → 통계 분류 인덱스(0~13). 이름 키워드 우선, 없으면 계통으로. */
export function bogeonCatIndex(name: string, category?: string): number {
  const n = name || ''
  if (/생리/.test(n)) return 1
  if (/두통|편두통/.test(n)) return 2
  if (/감기|몸살|발열|열감|미열|고열/.test(n)) return 3
  if (/타박/.test(n)) return 5
  if (/골절|염좌|삠|접질/.test(n)) return 7
  if (/외상|찰과|열상|자상|상처|베임|찢/.test(n)) return 4
  if (/근육|담|결림/.test(n)) return 6
  if (/비출혈|코피|이비인후|중이|귀|인후|편도/.test(n)) return 8
  if (/충혈|결막|안과|눈|눈병|다래끼/.test(n)) return 9
  if (/피부|두드러기|발진|수포|화상|벌레|아토피/.test(n)) return 10
  if (/치아|치통|구강|잇몸|입/.test(n)) return 11
  if (/알레르기|알러지|과민/.test(n)) return 12
  if (/어지러|현기|빈혈/.test(n)) return 13
  if (/복통|소화|구토|설사|장염|위|체함|메스/.test(n)) return 0
  switch (category) {
    case '소화기계': return 0
    case '호흡기계': return 3
    case '정신신경계': return 2
    case '근골격계': return 6
    case '피부피하계': return 10
    case '이비인후과계': return 8
    case '안과계': return 9
    case '구강치아계': return 11
    default: return 13
  }
}

export interface LogEntry {
  cls: string // 학년반
  name: string
  sex: Sex
  diagNames: string[] // 병명(여러 개 가능)
  firstCat: number // 통계 집계 기준 = 첫 병명
  treat: string
}

function entryFromDiseases(cls: string, name: string, sex: Sex, names: string[], cats: string[], treat: string): LogEntry {
  return { cls, name, sex, diagNames: names, firstCat: bogeonCatIndex(names[0] ?? '', cats[0]), treat }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
function hhmm(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
/** "증상 → 처치 → 결과 (시간)" — 학생 입력 증상·처치·처치결과(교실복귀/귀가/병원이송/관찰)를 함께 기록. */
function treatText(symptom: string, treat: string, outcome: string, time: string): string {
  const chain = [symptom.trim(), treat.trim(), outcome.trim()].filter(Boolean).join(' → ')
  return chain ? `${chain} (${time})` : `(${time})`
}
/** 관찰 결과 표기 — "관찰 30분 (~13:30)"(지속시간 + 종료 예정시각). */
const observeLabel = (durMin: number, endHHMM: string) => `관찰 ${durMin}분 (~${endHHMM})`

/** 오늘: 로컬 실제 방문에서 응급처치 항목 작성(이름·반은 로컬에서만). */
export function realEntries(date: Date, visits: Visit[], studentOf: (id: string) => { name: string; grade: number; classNo: number } | undefined): LogEntry[] {
  const dk = dateKey(date)
  return visits
    .filter((v) => !v.isStaff) // 교직원 방문은 학생 보건일지에서 제외(별도 집계)
    .filter((v) => dateKey(new Date(v.createdAt)) === dk)
    .map((v) => {
      const st = studentOf(v.id)
      const cls = st ? `${st.grade}-${st.classNo}` : `${v.grade}-?`
      const name = st?.name ?? '학생'
      let names = v.diseases.map((d) => d.name)
      let cats = v.diseases.map((d) => d.category as string)
      if (names.length === 0) {
        // 병명 미확정: 증상 타일에서 추정
        v.symptomTileIds.forEach((id) => {
          const t = tileById(id)
          if (t?.disease) { names.push(t.disease); cats.push(t.category) }
        })
      }
      if (names.length === 0) { names = ['기타']; cats = ['기타'] }
      const startTs = v.treatedAt ?? v.calledAt ?? v.createdAt
      const time = hhmm(startTs)
      const symptom = v.symptomTileIds.map((id) => tileById(id)?.label).filter(Boolean).join(', ')
      let outcome = v.outcome ?? ''
      if (outcome === '관찰' && v.observeUntil) {
        outcome = observeLabel(Math.max(0, Math.round((v.observeUntil - startTs) / 60000)), hhmm(v.observeUntil))
      }
      return entryFromDiseases(cls, name, v.sex, names, cats, treatText(symptom, v.treatments.join(', '), outcome, time))
    })
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── 통계 누계 베이스라인 — 실제 누적만 집계(임의 baseline 금지). 이 달 실제 방문만 누계됨. ──
const BASE_M = new Array(14).fill(0)
const BASE_F = new Array(14).fill(0)

interface DayStat {
  ilgye: { 남: number[]; 여: number[] }
  wolgye: { 남: number[]; 여: number[] }
  nugye: { 남: number[]; 여: number[] }
}

function bySexCounts(entries: LogEntry[]): { 남: number[]; 여: number[] } {
  const m = new Array(14).fill(0)
  const f = new Array(14).fill(0)
  entries.forEach((e) => {
    const arr = e.sex === '남' ? m : f
    arr[e.firstCat] += 1 // 통계 = 첫 병명만
  })
  return { 남: m, 여: f }
}

// ── 양식 레이아웃(34열/일 블록, 1일치 상대 열 위치) ──
const BLOCK_W = 34
const GUTTER = 3 // 날짜 블록 사이 빈 열(겹침 방지)
const STRIDE = BLOCK_W + GUTTER
const F = { LBL: 0, NO: 1, CLS: 4, NAME: 7, SEX: 11, DIAG: 12, TREAT: 16 }
// 통계: 라벨(rel0) · 종류(rel1~2) · 성별(rel3~5) · 14개 분류는 rel6부터 2열씩 균일 배치
const CAT_RELS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]
const CAT_ACROSS = CAT_RELS.map(() => 1) // 모두 2열(균일)
const ENTRY_ROWS = 30 // 응급처치 표 행 수

function dayBlockCells(blockStart: number, date: Date, entries: LogEntry[], stat: DayStat, eduNotice: string, weatherStr: string): Map<number, XCell[]> {
  const map = new Map<number, XCell[]>()
  const put = (row: number, cell: XCell) => {
    if (!map.has(row)) map.set(row, [])
    map.get(row)!.push(cell)
  }
  const C = (rel: number) => blockStart + rel
  const op = isOperatingDay(date)
  const hol = holidayName(date)

  // 행2~3: 제목 + 결재란 (결재칸 폭 확대)
  put(2, { col: C(0), value: '보   건   일   지', across: 16, style: 'title' })
  put(2, { col: C(17), value: '결재', across: 1, down: 1, style: 'box' })
  put(2, { col: C(19), value: '계', across: 1, style: 'box' })
  put(2, { col: C(21), value: '전결', across: 2, style: 'box' })
  put(2, { col: C(24), value: '교감', across: 9, style: 'box' })
  put(3, { col: C(19), across: 1, style: 'boxStamp' })
  put(3, { col: C(21), across: 2, style: 'boxStamp' })
  put(3, { col: C(24), across: 9, style: 'boxStamp' })

  // 행4: 날짜·날씨
  const dLabel = `${date.getFullYear()} 년 ${date.getMonth() + 1} 월 ${date.getDate()} 일    ${WD[date.getDay()]}요일${hol ? ` (${hol})` : ''}    날씨 : ${weatherStr}`
  put(4, { col: C(0), value: dLabel, across: 33, style: 'date' })

  // 행5~6: 보건교육/보건업무/응급처치및상담/학교행사 — 일일업무 기록(dailyLog)에서 자동 채움
  const dlog = dailyLogOf(date)
  put(5, { col: C(0), value: '보건교육', across: 3, style: 'sec' })
  put(5, { col: C(4), value: dlog.edu ?? '', across: 11, style: 'secText' })
  put(5, { col: C(16), value: '보건업무', across: 5, style: 'sec' })
  put(5, { col: C(22), value: dlog.work ?? '', across: 11, style: 'secText' })
  put(6, { col: C(0), value: '교육청 공지', across: 3, style: 'sec' })
  put(6, { col: C(4), value: eduNotice, across: 11, style: 'secText' })
  put(6, { col: C(16), value: '학교행사', across: 5, style: 'sec' })
  put(6, { col: C(22), value: dlog.event ?? '', across: 11, style: 'secText' })

  // 행7: 응급처치 표 헤더 (응급처치 라벨은 7~37 세로 병합, 한 글자씩 세로 배치+가운데)
  put(7, { col: C(F.LBL), value: '응\n급\n처\n치', down: ENTRY_ROWS, style: 'vlabel' })
  put(7, { col: C(F.NO), value: '연번', across: 2, style: 'hdr' })
  put(7, { col: C(F.CLS), value: '학년반', across: 2, style: 'hdr' })
  put(7, { col: C(F.NAME), value: '이  름', across: 3, style: 'hdr' })
  put(7, { col: C(F.SEX), value: '성별', style: 'hdr' })
  put(7, { col: C(F.DIAG), value: '병명', across: 3, style: 'hdr' })
  put(7, { col: C(F.TREAT), value: '증상 · 처치 · 결과', across: 17, style: 'hdr' })

  // 행8~37: 응급처치 항목
  for (let i = 0; i < ENTRY_ROWS; i++) {
    const row = 8 + i
    const e = op ? entries[i] : undefined
    put(row, { col: C(F.NO), value: e ? i + 1 : i + 1, across: 2, style: 'num' })
    put(row, { col: C(F.CLS), value: e?.cls ?? '', across: 2, style: 'cell' })
    put(row, { col: C(F.NAME), value: e?.name ?? '', across: 3, style: 'cell' })
    put(row, { col: C(F.SEX), value: e?.sex ?? '', style: 'cell' })
    put(row, { col: C(F.DIAG), value: e ? e.diagNames.join(', ') : '', across: 3, style: 'cellShrink' })
    put(row, { col: C(F.TREAT), value: e ? e.treat : '', across: 17, style: 'cellLShrink' }) // 칸 폭에 맞춰 글자 축소
  }

  // 행38~44: 통계
  put(38, { col: C(0), value: '통\n계', down: 6, style: 'vlabel' })
  put(38, { col: C(1), value: '종류', across: 1, style: 'cat' })
  put(38, { col: C(3), value: '성별', across: 2, style: 'cat' })
  CAT_RELS.forEach((rel, k) => put(38, { col: C(rel), value: BOGEON_CATS[k], across: CAT_ACROSS[k], style: 'cat' }))

  const rowsDef: { label: string; data: DayStat[keyof DayStat]; r0: number }[] = [
    { label: '일계', data: stat.ilgye, r0: 39 },
    { label: '월계', data: stat.wolgye, r0: 41 },
    { label: '누계', data: stat.nugye, r0: 43 },
  ]
  rowsDef.forEach(({ label, data, r0 }) => {
    put(r0, { col: C(1), value: label, across: 1, down: 1, style: 'cell' })
    ;(['남', '여'] as Sex[]).forEach((sx, si) => {
      const row = r0 + si
      put(row, { col: C(3), value: sx, across: 2, style: 'cell' })
      CAT_RELS.forEach((rel, k) => put(row, { col: C(rel), value: data[sx][k], across: CAT_ACROSS[k], style: 'num' }))
    })
  })

  return map
}

export interface EduNotice { ts: number; title: string }
export interface WeatherInfo { tempC: number; humidity: number; rainMm: number }

function fmtWx(w: WeatherInfo): string {
  return `기온 ${w.tempC}℃ · 습도 ${w.humidity}% · 강수 ${w.rainMm}mm`
}
/** 해당 일자의 교육청 공지 — 실제 발송 공지만(합성 금지). */
function eduNoticeFor(date: Date, notices: EduNotice[]): string {
  const dk = dateKey(date)
  return notices.filter((n) => dateKey(new Date(n.ts)) === dk).map((n) => `· ${n.title}`).join('\n')
}

/** 선택한 달의 일자별 보건일지를 주(週)별 시트로 생성. 현재 달이면 1일~오늘, 과거 달이면 1일~말일. */
export function buildBogeonSheets(
  monthDate: Date,
  visits: Visit[],
  studentOf: (id: string) => { name: string; grade: number; classNo: number } | undefined,
  notices: EduNotice[] = [],
  todayWeather?: WeatherInfo,
): XSheet[] {
  const y = monthDate.getFullYear()
  const m = monthDate.getMonth()
  const realToday = new Date()
  const isCurrentMonth = y === realToday.getFullYear() && m === realToday.getMonth()
  const todayKey = dateKey(realToday)
  const lastDay = isCurrentMonth ? realToday.getDate() : new Date(y, m + 1, 0).getDate()

  // 일자별 entries + 누계 진행
  const runM = [...BASE_M]
  const runF = [...BASE_F]
  interface Day { date: Date; entries: LogEntry[]; stat: DayStat }
  const days: Day[] = []
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(y, m, d)
    // 실제 방문 기록만 사용(합성/임의 생성 금지 — 증빙 자료). 방문 없는 날은 빈 표.
    const entries = realEntries(date, visits, studentOf)
    const ilgye = bySexCounts(entries)
    for (let k = 0; k < 14; k++) { runM[k] += ilgye.남[k]; runF[k] += ilgye.여[k] }
    const wolM = ilgye.남.map((_, k) => runM[k] - BASE_M[k])
    const wolF = ilgye.여.map((_, k) => runF[k] - BASE_F[k])
    days.push({
      date,
      entries,
      stat: {
        ilgye,
        wolgye: { 남: wolM, 여: wolF },
        nugye: { 남: [...runM], 여: [...runF] },
      },
    })
  }

  // 주(월요일 시작)별 그룹 — 평일(월~금)만 블록 배치
  const weeks = new Map<string, Day[]>()
  days.forEach((day) => {
    const wd = day.date.getDay()
    if (wd === 0 || wd === 6) return // 주말 제외
    const mon = new Date(day.date)
    mon.setDate(mon.getDate() - ((wd + 6) % 7))
    const k = dateKey(mon)
    if (!weeks.has(k)) weeks.set(k, [])
    weeks.get(k)!.push(day)
  })

  const sheets: XSheet[] = []
  ;[...weeks.keys()].sort().forEach((wk, wi) => {
    const wdays = weeks.get(wk)!
    const rowMap = new Map<number, XCell[]>()
    wdays.forEach((day, di) => {
      const blockStart = 2 + di * STRIDE // 주 내 순서대로 연속 배치(부분 주에서도 정렬 유지)
      const isToday = dateKey(day.date) === todayKey
      // 날씨는 실제 값만(오늘=측정값). 과거일은 저장된 값이 없으면 비움(임의 생성 금지).
      const wx = isOperatingDay(day.date) && isToday && todayWeather ? fmtWx(todayWeather) : ''
      const cells = dayBlockCells(blockStart, day.date, day.entries, day.stat, eduNoticeFor(day.date, notices), wx)
      cells.forEach((arr, row) => {
        if (!rowMap.has(row)) rowMap.set(row, [])
        rowMap.get(row)!.push(...arr)
      })
    })
    const ROW_H: Record<number, number> = { 5: 45, 6: 45, 38: 42 } // 보건교육/업무·상담/행사 칸, 통계 헤더(분류명 줄바꿈)
    const rows: XRow[] = [...rowMap.keys()]
      .sort((a, b) => a - b)
      .map((row) => ({ row, cells: rowMap.get(row)!.sort((a, b) => a.col - b.col), height: ROW_H[row] }))
    const first = wdays[0].date
    const last = wdays[wdays.length - 1].date
    // 하루 = 한 페이지: 시트의 평일 수만큼 가로 페이지에 맞춤(FitToPage). 세로 1페이지.
    sheets.push({
      name: `${m + 1}월 ${first.getDate()}일~${last.getDate()}일`,
      rows,
      colWidth: 13,
      colCount: 2 + wdays.length * STRIDE,
      fitWide: wdays.length,
      fitTall: 1,
    })
    void wi
  })
  return sheets
}
