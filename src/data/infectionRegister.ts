// 학교 내 감염병 관리대장(라인리스트) — 보건교사 전용, 날짜를 넘어 이어지는 누적 기록.
//  보건 일일업무 기록 창의 '감염병 현황' 섹션에서 보고/입력한다. 로컬(암호화) 저장 — PII 로컬 격리 원칙.
import { getSecureRaw, setSecureRaw } from './secureStore'

export type InfStatus = '의심' | '확진' | '복귀'

export interface InfectionCase {
  id: string
  studentId?: string // 명부 학생 id(있으면 중복 방지·재식별)
  name: string
  cls: string // 학년반 라벨 (예: 3-1)
  sex?: string
  disease: string // 병명
  onset: string // 발병일 YYYY-MM-DD
  until?: string // 등교중지 복귀(예정)일 YYYY-MM-DD
  status: InfStatus
  source: '보건실' | '수기' | '담임'
  note?: string
  createdAt: number
}

const LS = 'naum.infectionReg'

// ── 등교중지 기준(기본값) ──────────────────────────────────────
//  질병관리청·교육부 「학생 감염병 예방·위기대응 매뉴얼」 요지를 근거로 한 '추정' 복귀일.
//  days = 발병일로부터의 등교중지 추정 일수, desc = 실제 해제 기준(보건교사 최종 판단용, 수정 가능).
export interface IsoRule { key: RegExp; label: string; days: number; desc: string }
export const ISO_RULES: IsoRule[] = [
  { key: /인플루|독감/, label: '인플루엔자', days: 5, desc: '해열 후 48시간 경과(발병 후 약 5일)' },
  { key: /코로나|covid/i, label: '코로나19', days: 5, desc: '증상 발생 후 5일(지침 변동 가능)' },
  { key: /수두/, label: '수두', days: 7, desc: '모든 수포가 가피(딱지)로 변할 때까지(약 7일)' },
  { key: /볼거리|이하선염/, label: '유행성이하선염', days: 5, desc: '이하선 종창 후 5일' },
  { key: /홍역/, label: '홍역', days: 5, desc: '발진 후 5일' },
  { key: /풍진/, label: '풍진', days: 7, desc: '발진 후 7일' },
  { key: /수족구/, label: '수족구병', days: 7, desc: '수포 소실·가피화(약 7일)' },
  { key: /각결막염|아폴로|유행성결막염/, label: '유행성각결막염', days: 14, desc: '증상 소실까지(약 2주)' },
  { key: /노로|장염|식중독|이질|장관감염/, label: '장관감염증', days: 3, desc: '설사·구토 소실 후(약 2~3일)' },
  { key: /백일해/, label: '백일해', days: 21, desc: '항생제 치료 5일 또는 기침 후 3주' },
  { key: /성홍열/, label: '성홍열', days: 1, desc: '적정 항생제 치료 24시간 후' },
]

export const DISEASE_PRESETS = [
  '인플루엔자', '코로나19', '수두', '유행성이하선염', '홍역', '풍진',
  '수족구병', '유행성각결막염', '장관감염증(노로 등)', '백일해', '성홍열', '기타',
]

export function ruleFor(disease: string): IsoRule | undefined {
  return ISO_RULES.find((r) => r.key.test(disease || ''))
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** 발병일 + 병명 → 복귀 예정일(추정). 기준표에 없으면 +5일 기본. */
export function estReturn(disease: string, onset: string): string {
  const r = ruleFor(disease)
  return addDays(onset, r ? r.days : 5)
}

export function loadCases(): InfectionCase[] {
  try {
    const a = JSON.parse(getSecureRaw(LS) || 'null')
    return Array.isArray(a) ? (a as InfectionCase[]) : []
  } catch {
    return []
  }
}

function saveAll(list: InfectionCase[]) {
  setSecureRaw(LS, JSON.stringify(list))
}

export function addCase(c: Omit<InfectionCase, 'id' | 'createdAt'>): InfectionCase {
  const full: InfectionCase = {
    ...c,
    id: 'inf-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
  }
  saveAll([full, ...loadCases()])
  return full
}

export function updateCase(id: string, patch: Partial<InfectionCase>) {
  saveAll(loadCases().map((c) => (c.id === id ? { ...c, ...patch } : c)))
}

export function removeCase(id: string) {
  saveAll(loadCases().filter((c) => c.id !== id))
}

/** 해당 날짜(YYYY-MM-DD)에 '진행 중'(등교중지)인 사례인가. 복귀 예정일 당일은 '복귀'로 보아 제외. */
export function isActiveOn(c: InfectionCase, ymd: string): boolean {
  if (c.status === '복귀') return false
  if (c.until && ymd >= c.until) return false // 복귀일 당일부터는 등교, 하루 전까지만 진행
  return c.onset <= ymd
}

/** 같은 학생의 '진행 중' 사례가 이미 있는지(중복 등재 방지). */
export function hasActiveFor(studentId: string | undefined, ymd: string): boolean {
  if (!studentId) return false
  return loadCases().some((c) => c.studentId === studentId && isActiveOn(c, ymd))
}


// ── 분석 대시보드 엑셀(제목 + 현황 요약 패널 + 다각도 차트 2열 + 원본 시트) ──
import type { XSheet, XRow, XCell, StyleId, CellValue } from './excel'

function gradeOfCls(cls: string): number { const m = /^(\d+)/.exec(cls || ''); return m ? Number(m[1]) : 0 }
function parseY(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
function keyOf(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function monKey(s: string): string { const d = parseY(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return keyOf(d) }
function barCh(v: number, max: number): string { return v ? '█'.repeat(Math.max(1, Math.round((v / Math.max(max, 1)) * 10))) : '' }

/** 감염병 관리대장 엑셀 — 대시보드 시트(요약 패널 + 다각도 차트 2열) + 원본데이터 시트. */
export function infectionSheets(cases: InfectionCase[], todayYmd: string): XSheet[] {
  const COLS = 9
  const isDoneC = (c: InfectionCase) => c.status === '복귀' || (!!c.until && todayYmd >= c.until)
  const dayBefore = (s: string) => { const d = parseY(s); d.setDate(d.getDate() - 1); return keyOf(d) }

  const countBy = (keyFn: (c: InfectionCase) => string, order?: (a: [string, number], b: [string, number]) => number) => {
    const m = new Map<string, number>()
    for (const c of cases) { const k = keyFn(c); m.set(k, (m.get(k) || 0) + 1) }
    const arr = [...m.entries()]; arr.sort(order ?? ((a, b) => b[1] - a[1]))
    return arr.map(([label, value]) => ({ label, value }))
  }
  const weeks = (n: number) => {
    const out: { key: string; label: string; start: string; end: string }[] = []
    const mon = parseY(todayYmd); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
    for (let i = n - 1; i >= 0; i--) { const d = new Date(mon); d.setDate(d.getDate() - i * 7); const e = new Date(d); e.setDate(e.getDate() + 6); out.push({ key: keyOf(d), label: `${d.getMonth() + 1}/${d.getDate()}`, start: keyOf(d), end: keyOf(e) }) }
    return out
  }
  const months = (n: number) => {
    const out: { key: string; label: string }[] = []; const now = parseY(todayYmd)
    for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${d.getMonth() + 1}월` }) }
    return out
  }

  const wkNew = weeks(8).map((w) => ({ label: w.label, value: cases.filter((c) => monKey(c.onset) === w.key).length }))
  const wkAct = weeks(8).map((w) => ({ label: w.label, value: cases.filter((c) => { const aEnd = c.until ? dayBefore(c.until) : c.onset; return c.onset <= w.end && aEnd >= w.start }).length }))
  const moNew = months(6).map((mo) => ({ label: mo.label, value: cases.filter((c) => c.onset.slice(0, 7) === mo.key).length }))
  const byDisease = countBy((c) => c.disease || '기타')
  const byGrade = countBy((c) => `${gradeOfCls(c.cls)}학년`, (a, b) => a[0].localeCompare(b[0], 'ko'))
  const bySex = countBy((c) => (c.sex === '남' ? '남' : c.sex === '여' ? '여' : '미상'), (a, b) => a[0].localeCompare(b[0], 'ko'))
  const byClass = countBy((c) => c.cls || '미상').slice(0, 8)
  const byStatus = (() => { const order = ['의심', '확진', '복귀']; const m = new Map<string, number>(); for (const c of cases) m.set(c.status, (m.get(c.status) || 0) + 1); return order.map((s) => ({ label: s, value: m.get(s) || 0 })) })()

  const map = new Map<number, XCell[]>()
  const put = (row: number, col: number, value: CellValue | undefined, style: StyleId, across?: number) => { const a = map.get(row) ?? []; a.push({ col, value, style, across }); map.set(row, a) }

  // 제목 + 현황 요약 패널
  put(1, 1, '감염병 관리대장', 'title', COLS - 1)
  put(2, 1, `작성일 ${todayYmd} · 전체 현황 요약`, 'cellL', COLS - 1)
  const total = cases.length, active = cases.filter((c) => !isDoneC(c)).length, doneN = total - active
  const newWk = cases.filter((c) => monKey(c.onset) === monKey(todayYmd)).length
  const dzN = new Set(cases.map((c) => c.disease)).size
  const clsN = new Set(cases.map((c) => c.cls)).size
  put(4, 1, '누적 사례', 'hdr', 2); put(4, 4, '진행(등교중지)', 'hdr', 2); put(4, 7, '복귀 완료', 'hdr', 2)
  put(5, 1, total, 'num', 2); put(5, 4, active, 'num', 2); put(5, 7, doneN, 'num', 2)
  put(6, 1, '금주 신규', 'hdr', 2); put(6, 4, '감염병 종류', 'hdr', 2); put(6, 7, '영향 학급', 'hdr', 2)
  put(7, 1, newWk, 'num', 2); put(7, 4, dzN, 'num', 2); put(7, 7, clsN, 'num', 2)

  // 차트 블록(폭 4칸: 항목·건수·추이[2칸])
  const chart = (top: number, left: number, title: string, data: { label: string; value: number }[]) => {
    const max = Math.max(1, ...data.map((d) => d.value))
    put(top, left, title, 'sec', 3)
    put(top + 1, left, '항목', 'hdr'); put(top + 1, left + 1, '건수', 'hdr'); put(top + 1, left + 2, '추이', 'hdr', 1)
    data.forEach((d, i) => { const r = top + 2 + i; put(r, left, d.label, 'cellL'); put(r, left + 1, d.value, 'num'); put(r, left + 2, barCh(d.value, max), 'cellL', 1) })
    return 2 + data.length
  }
  const pairs: [string, { label: string; value: number }[]][][] = [
    [['감염병 종류별', byDisease], ['학년별', byGrade]],
    [['남녀별', bySex], ['상태별(의심·확진·복귀)', byStatus]],
    [['학급별 Top', byClass], ['월별 신규발생(최근 6개월)', moNew]],
    [['주별 신규발생(최근 8주)', wkNew], ['주별 진행·등교중지(최근 8주)', wkAct]],
  ]
  let top = 9
  for (const pair of pairs) {
    const hL = chart(top, 1, pair[0][0], pair[0][1])
    const hR = chart(top, 6, pair[1][0], pair[1][1])
    top += Math.max(hL, hR) + 1
  }

  const rows: XRow[] = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([row, cells]) => ({ row, cells: cells.sort((x, y) => x.col - y.col) }))
  const dash: XSheet = { name: '대시보드', rows, colWidth: 84, colCount: COLS, fitWide: 1 }

  // 원본 데이터 시트
  const raw: XRow[] = []; let li = 1
  const lp = (cells: XCell[], h?: number) => { raw.push({ row: li, cells, height: h }); li++ }
  const cl = (col: number, value: CellValue | undefined, style: StyleId, across?: number): XCell => ({ col, value, style, across })
  lp([cl(1, '감염병 관리대장 — 원본 데이터', 'title', 10)], 26)
  lp([cl(1, `작성일 ${todayYmd} · 총 ${total}건`, 'cellL', 10)])
  const H = ['번호', '학년반', '학년', '이름', '성별', '병명', '발병일', '등교중지 복귀(예정)일', '상태', '출처', '비고']
  lp(H.map((h, i) => cl(i + 1, h, 'hdr')))
  ;[...cases].sort((a, b) => (a.onset < b.onset ? 1 : -1)).forEach((c, i) => {
    lp([cl(1, i + 1, 'num'), cl(2, c.cls, 'cell'), cl(3, gradeOfCls(c.cls), 'num'), cl(4, c.name, 'cell'), cl(5, c.sex ?? '', 'cell'), cl(6, c.disease, 'cellL'), cl(7, c.onset, 'cell'), cl(8, c.until ?? '', 'cell'), cl(9, c.status, 'cell'), cl(10, c.source, 'cell'), cl(11, c.note ?? '', 'cellL')])
  })
  const rawSheet: XSheet = { name: '원본데이터', rows: raw, colWidth: 74, colCount: 11, fitWide: 1 }

  return [dash, rawSheet]
}
