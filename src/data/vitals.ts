// 활력징후(Vital Signs) — 체온·혈압·맥박·호흡수·산소포화도. 요청 2026-09-22.
//  · 지금까지 체온만 처치 문자열로 남아 값을 다시 쓸 수 없었다. 구조화해 저장한다.
//  · 항목과 정상 참고범위는 학교가 편집한다(연령대·학교급마다 기준이 달라서).
//    편집값은 이 기기(localStorage) + 클라우드(school_settings.vitals)에 저장되어
//    증상 목록과 같은 방식으로 다른 기기에도 반영된다.
//  ⚠ 정상범위는 "확인이 필요한 값"을 짚어 주는 참고 표시일 뿐 진단 기준이 아니다.
//    최종 판단은 보건교사가 한다.
import type { VitalItem, Vitals } from '../types'

const LS = 'naum.vitals.items'

/** 기본 항목 — 학령기 참고범위. 학교에서 조정할 수 있다(활력징후 항목 편집). */
export const DEFAULT_VITAL_ITEMS: VitalItem[] = [
  { id: 'temp', label: '체온', unit: '℃', type: 'number', decimals: 1, low: 36.0, high: 37.4, hardMin: 30, hardMax: 43.9 },
  { id: 'bp', label: '혈압', unit: 'mmHg', type: 'pair', decimals: 0, low: 90, high: 129, low2: 50, high2: 84, hardMin: 40, hardMax: 250 },
  { id: 'pulse', label: '맥박', unit: '회/분', type: 'number', decimals: 0, low: 60, high: 120, hardMin: 20, hardMax: 250 },
  { id: 'resp', label: '호흡수', unit: '회/분', type: 'number', decimals: 0, low: 14, high: 26, hardMin: 5, hardMax: 80 },
  { id: 'spo2', label: '산소포화도', unit: '%', type: 'number', decimals: 0, low: 95, high: 100, hardMin: 50, hardMax: 100 },
]

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
export function judgeVital(item: VitalItem, vals: number[] | undefined): VitalFlag {
  if (!vals || !vals.length) return null
  const chk = (n: number, lo?: number, hi?: number): VitalFlag => {
    if (!Number.isFinite(n)) return null
    if (lo != null && n < lo) return 'low'
    if (hi != null && n > hi) return 'high'
    return null
  }
  const first = chk(vals[0], item.low, item.high)
  if (first) return first
  if (item.type === 'pair' && vals.length > 1) return chk(vals[1], item.low2, item.high2)
  return null
}

/** 범위를 벗어난 항목들의 안내 문구 — 없으면 빈 배열 */
export function vitalWarnings(v?: Vitals | null): string[] {
  if (!v) return []
  const out: string[] = []
  for (const item of vitalItems) {
    const flag = judgeVital(item, v[item.id])
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
