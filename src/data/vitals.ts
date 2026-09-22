// 활력징후(Vital Signs) — 체온·혈압·맥박·호흡수·산소포화도. 요청 2026-09-22.
//  · 지금까지 체온만 처치 문자열로 남아 값을 다시 쓸 수 없었다. 구조화해 저장한다.
//  · 참고범위는 **학년·성별에 따라 자동으로 바뀐다**(요청 2026-09-22 2차). 키오스크에서
//    학생이 고른 학년·성별이 방문에 남으므로, 그 값으로 밴드를 골라 쓴다.
//    교직원 접수(grade=0)는 성인 밴드.
//  · 밴드가 없는 항목(체온·산소포화도)은 연령과 무관해 단일 범위를 쓴다.
//  · 학교가 항목·범위를 편집하면 이 기기(localStorage) + 클라우드(school_settings.vitals)에
//    저장되어 다른 기기에도 반영된다.
//  ⚠ 정상범위는 "확인이 필요한 값"을 짚어 주는 참고 표시일 뿐 진단 기준이 아니다.
//    최종 판단은 보건교사가 한다.
import type { Sex, VitalBand, VitalItem, Vitals } from '../types'

const LS = 'naum.vitals.items'

/** 학년 → 만 나이(대략). 초1 = 만 7세 … 초6 = 만 12세. 0 = 교직원(성인). */
export const AGE_OF_GRADE = (grade: number): number => (grade >= 1 ? grade + 6 : 0)

/** 참고범위를 고를 때 쓰는 대상 정보 — 방문(visit)에서 그대로 온다. */
export interface VitalCtx {
  /** 초1~6. 교직원은 0. */
  grade: number
  sex?: Sex
  isStaff?: boolean
}

/** 성인(교직원) 밴드를 가리키는 학년 값 */
export const ADULT_GRADE = 0

/** 혈압 밴드 — 미국소아과학회(AAP) 2017 소아 고혈압 지침의
 *  "추가 평가가 필요한 선별 혈압값"(연령·성별 90 백분위수)을 상한으로,
 *  PALS 저혈압 기준(1~10세 70+2×나이, 10세 이상 90)을 하한으로 삼았다.
 *  이완기 하한은 소아 표준이 없어 50(성인 60)을 확인용으로 둔다. */
const BP_BANDS: VitalBand[] = [
  { fromGrade: 1, toGrade: 1, sex: '남', low: 84, high: 106, low2: 50, high2: 68 },
  { fromGrade: 1, toGrade: 1, sex: '여', low: 84, high: 106, low2: 50, high2: 68 },
  { fromGrade: 2, toGrade: 2, sex: '남', low: 86, high: 107, low2: 50, high2: 69 },
  { fromGrade: 2, toGrade: 2, sex: '여', low: 86, high: 107, low2: 50, high2: 69 },
  { fromGrade: 3, toGrade: 3, sex: '남', low: 88, high: 107, low2: 50, high2: 70 },
  { fromGrade: 3, toGrade: 3, sex: '여', low: 88, high: 108, low2: 50, high2: 71 },
  { fromGrade: 4, toGrade: 4, sex: '남', low: 90, high: 108, low2: 50, high2: 72 },
  { fromGrade: 4, toGrade: 4, sex: '여', low: 90, high: 109, low2: 50, high2: 72 },
  { fromGrade: 5, toGrade: 5, sex: '남', low: 90, high: 110, low2: 50, high2: 74 },
  { fromGrade: 5, toGrade: 5, sex: '여', low: 90, high: 111, low2: 50, high2: 74 },
  { fromGrade: 6, toGrade: 6, sex: '남', low: 90, high: 113, low2: 50, high2: 75 },
  { fromGrade: 6, toGrade: 6, sex: '여', low: 90, high: 114, low2: 50, high2: 75 },
  { fromGrade: ADULT_GRADE, toGrade: ADULT_GRADE, low: 90, high: 129, low2: 60, high2: 84 },
]

/** 기본 항목 — 초등학교 기준. 학교에서 조정할 수 있다(활력징후 항목 편집). */
export const DEFAULT_VITAL_ITEMS: VitalItem[] = [
  {
    id: 'temp', label: '체온', unit: '℃', type: 'number', decimals: 1,
    low: 36.0, high: 37.4, hardMin: 30, hardMax: 43.9,
    source: '연령과 거의 무관 — 학년별 구분 없음',
  },
  {
    id: 'bp', label: '혈압', unit: 'mmHg', type: 'pair', decimals: 0,
    low: 90, high: 129, low2: 60, high2: 84, hardMin: 40, hardMax: 250,
    bands: BP_BANDS,
    source: '상한 = AAP 2017 연령·성별 선별 혈압값(90 백분위), 하한 = PALS 저혈압 기준',
  },
  {
    id: 'pulse', label: '맥박', unit: '회/분', type: 'number', decimals: 0,
    low: 60, high: 120, hardMin: 20, hardMax: 250,
    bands: [
      { fromGrade: 1, toGrade: 6, low: 75, high: 118 },
      { fromGrade: ADULT_GRADE, toGrade: ADULT_GRADE, low: 60, high: 100 },
    ],
    source: 'AHA PALS 안정 시 심박수 — 학령기(6~12세) 75~118, 성인 60~100',
  },
  {
    id: 'resp', label: '호흡수', unit: '회/분', type: 'number', decimals: 0,
    low: 14, high: 26, hardMin: 5, hardMax: 80,
    bands: [
      { fromGrade: 1, toGrade: 6, low: 16, high: 25 },
      { fromGrade: ADULT_GRADE, toGrade: ADULT_GRADE, low: 12, high: 20 },
    ],
    source: 'AHA PALS 학령기 18~25 기준 — 안정 시 오경보를 줄이려 하한만 16으로 완화',
  },
  {
    id: 'spo2', label: '산소포화도', unit: '%', type: 'number', decimals: 0,
    low: 95, high: 100, hardMin: 50, hardMax: 100,
    source: '연령과 무관 — 학년별 구분 없음',
  },
]

/** 밴드 배열 정리 — 학년 범위가 말이 되는 것만 남긴다. 없으면 undefined. */
function saneBands(a: unknown): VitalBand[] | undefined {
  if (!Array.isArray(a)) return undefined
  const ok = a.filter(
    (b): b is VitalBand =>
      !!b && Number.isFinite(b.fromGrade) && Number.isFinite(b.toGrade) && b.fromGrade <= b.toGrade,
  )
  return ok.length ? ok : undefined
}

function sane(a: unknown): VitalItem[] | null {
  if (!Array.isArray(a) || a.length === 0) return null
  const ok = a.filter(
    (x): x is VitalItem =>
      !!x && typeof x.id === 'string' && x.id.trim() !== ''
      && typeof x.label === 'string' && x.label.trim() !== ''
      && (x.type === 'number' || x.type === 'pair'),
  )
  return ok.length ? ok.map((x) => ({
    ...x,
    unit: x.unit ?? '',
    decimals: Number.isFinite(x.decimals) ? x.decimals : 0,
    hardMin: Number.isFinite(x.hardMin) ? x.hardMin : 0,
    hardMax: Number.isFinite(x.hardMax) ? x.hardMax : 1000,
    bands: saneBands(x.bands),
  })) : null
}

function load(): VitalItem[] {
  try {
    return sane(JSON.parse(localStorage.getItem(LS) || 'null')) ?? DEFAULT_VITAL_ITEMS
  } catch {
    return DEFAULT_VITAL_ITEMS
  }
}

/** 앱 시작 시 1회 확정 — 명부·증상 목록과 같은 패턴(편집 적용은 새로고침). */
export const vitalItems: VitalItem[] = load()

export function vitalItemById(id: string): VitalItem | undefined {
  return vitalItems.find((v) => v.id === id)
}

export function saveVitalItems(list: VitalItem[]): void {
  try { localStorage.setItem(LS, JSON.stringify(list)) } catch { /* ignore */ }
}

/** 클라우드에서 받은 목록을 로컬에 반영. 바뀌었으면 true(호출측이 새로고침). */
export function applyVitalItems(list: VitalItem[] | null): boolean {
  const next = sane(list)
  if (!next) return false
  const cur = localStorage.getItem(LS)
  const s = JSON.stringify(next)
  if (cur === s) return false
  try { localStorage.setItem(LS, s) } catch { return false }
  return true
}

export function restoreDefaultVitalItems(): void {
  try { localStorage.removeItem(LS) } catch { /* ignore */ }
}

// ── 학년·성별 참고범위 ──

/** ctx가 가리키는 대상 학년 — 교직원은 성인(0)으로 본다. */
export function ctxGrade(ctx?: VitalCtx | null): number {
  if (!ctx) return -1
  if (ctx.isStaff) return ADULT_GRADE
  return Number.isFinite(ctx.grade) ? ctx.grade : -1
}

/** 이 학년·성별에 맞는 밴드. 성별 지정 밴드를 남녀 공통 밴드보다 먼저 고른다. */
export function bandFor(item: VitalItem, ctx?: VitalCtx | null): VitalBand | undefined {
  const bands = item.bands
  if (!bands || !bands.length) return undefined
  const g = ctxGrade(ctx)
  if (g < 0) return undefined
  const inRange = bands.filter((b) => g >= b.fromGrade && g <= b.toGrade)
  if (!inRange.length) return undefined
  return inRange.find((b) => b.sex && ctx?.sex && b.sex === ctx.sex) ?? inRange.find((b) => !b.sex)
}

/** 밴드를 적용한 항목 — 화면·판정은 전부 이걸 쓴다. 밴드가 없으면 항목 그대로. */
export function resolveVitalItem(item: VitalItem, ctx?: VitalCtx | null): VitalItem {
  const b = bandFor(item, ctx)
  if (!b) return item
  return {
    ...item,
    low: b.low ?? item.low,
    high: b.high ?? item.high,
    low2: b.low2 ?? item.low2,
    high2: b.high2 ?? item.high2,
  }
}

/** 지금 적용 중인 기준을 사람이 읽는 말로 — "3학년 여 기준" · "교직원(성인) 기준" */
export function vitalCtxLabel(ctx?: VitalCtx | null): string | null {
  const g = ctxGrade(ctx)
  if (g < 0) return null
  if (g === ADULT_GRADE) return '교직원(성인) 기준'
  return `${g}학년${ctx?.sex ? ` ${ctx.sex}` : ''} 기준`
}

/** 이 항목이 학년·성별에 따라 달라지는지 */
export function hasBands(item: VitalItem): boolean {
  return !!item.bands && item.bands.length > 0
}

/** 참고범위를 "90~113 / 50~75"처럼 한 줄로 */
export function rangeText(item: VitalItem): string {
  const f = (n: number) => n.toFixed(item.decimals)
  const one = (lo?: number, hi?: number) =>
    lo != null && hi != null ? `${f(lo)}~${f(hi)}` : lo != null ? `${f(lo)} 이상` : hi != null ? `${f(hi)} 이하` : '—'
  return item.type === 'pair'
    ? `${one(item.low, item.high)} / ${one(item.low2, item.high2)}`
    : one(item.low, item.high)
}

/** 저장된(학교가 편집한) 항목에 기본 학년·성별 밴드를 입혀 준다.
 *  같은 id의 기본 항목에 밴드가 있고 저장본에는 없을 때만 — 학교가 고친 이름·단위·기본범위는 건드리지 않는다. */
export function withDefaultBands(list: VitalItem[]): VitalItem[] {
  return list.map((v) => {
    if (hasBands(v)) return v
    const d = DEFAULT_VITAL_ITEMS.find((x) => x.id === v.id)
    return d?.bands ? { ...v, bands: d.bands.map((b) => ({ ...b })), source: v.source ?? d.source } : v
  })
}

/** 기본 밴드를 아직 안 받은 항목이 있는지(편집 화면 안내용) */
export function missingDefaultBands(list: VitalItem[]): boolean {
  return list.some((v) => !hasBands(v) && !!DEFAULT_VITAL_ITEMS.find((x) => x.id === v.id)?.bands)
}

// ── 값 다루기 ──

/** 값이 하나라도 들어있는지 */
export function hasVitals(v?: Vitals | null): boolean {
  return !!v && Object.values(v).some((arr) => Array.isArray(arr) && arr.some((n) => Number.isFinite(n)))
}

/** "37.5℃" · "120/80mmHg" 처럼 한 항목을 사람이 읽는 문자열로 */
export function formatVital(item: VitalItem, vals: number[] | undefined): string | null {
  if (!vals || !vals.length || !vals.every((n) => Number.isFinite(n))) return null
  const f = (n: number) => n.toFixed(item.decimals)
  if (item.type === 'pair') {
    if (vals.length < 2) return null
    return `${f(vals[0])}/${f(vals[1])}${item.unit}`
  }
  return `${f(vals[0])}${item.unit}`
}

/** 보건일지·처치 목록에 넣는 한 줄 요약 — "활력징후 37.5℃ · 120/80mmHg · 88회/분" */
export const VITALS_LABEL = '활력징후'
export function vitalsSummary(v?: Vitals | null): string | null {
  if (!hasVitals(v)) return null
  const parts: string[] = []
  for (const item of vitalItems) {
    const t = formatVital(item, v![item.id])
    if (t) parts.push(`${item.label} ${t}`)
  }
  return parts.length ? `${VITALS_LABEL} ${parts.join(' · ')}` : null
}

/** 정상 참고범위를 벗어났는지 — 'low'(낮음) · 'high'(높음) · null(정상·미입력) */
export type VitalFlag = 'low' | 'high' | null
export function judgeVital(item: VitalItem, vals: number[] | undefined, ctx?: VitalCtx | null): VitalFlag {
  if (!vals || !vals.length) return null
  const it = resolveVitalItem(item, ctx)
  const chk = (n: number, lo?: number, hi?: number): VitalFlag => {
    if (!Number.isFinite(n)) return null
    if (lo != null && n < lo) return 'low'
    if (hi != null && n > hi) return 'high'
    return null
  }
  const first = chk(vals[0], it.low, it.high)
  if (first) return first
  if (it.type === 'pair' && vals.length > 1) return chk(vals[1], it.low2, it.high2)
  return null
}

/** 범위를 벗어난 항목들의 안내 문구 — 없으면 빈 배열 */
export function vitalWarnings(v?: Vitals | null, ctx?: VitalCtx | null): string[] {
  if (!v) return []
  const out: string[] = []
  for (const item of vitalItems) {
    const flag = judgeVital(item, v[item.id], ctx)
    if (!flag) continue
    const txt = formatVital(item, v[item.id])
    out.push(`${item.label} ${txt} — 참고범위보다 ${flag === 'low' ? '낮음' : '높음'}`)
  }
  return out
}

/** 옛 기록 호환 — "체온 측정 37.5℃" 처치 문자열에서 체온만 복원 */
export function vitalsFromLegacyTreatments(treatments: string[]): Vitals | null {
  const t = treatments.find((x) => x.startsWith('체온 측정'))
  const m = t?.match(/([\d.]+)℃/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? { temp: [n] } : null
}
