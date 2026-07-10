// 재난·기상 경보. 실시간 기상으로 판정(미세먼지·호우·폭염·한파).
// 태풍·홍수·지진 등 공식 특보는 기상청 특보/지진·행안부 재난문자 연동 자리(fetchOfficialAlerts).
export type Severity = 'info' | 'warning' | 'danger'

export interface DisasterAlert {
  id: string
  type: string
  title: string
  detail: string
  severity: Severity
  icon: string
}

interface WxLike {
  tempC: number
  pm25: number
  pm10: number
  rainMm: number
}

export interface Thresholds {
  pm25_verybad: number
  pm25_bad: number
  rain_warning: number
  rain_advisory: number
  heat_warning: number
  heat_advisory: number
  cold_warning: number
  cold_advisory: number
  // 감염병 조기탐지 — 고정 합계가 아니라 평소(baseline) 대비 증가배수로 본다.
  inf_excess_alert: number // 평소 대비 증가배수 — 경보
  inf_excess_watch: number // 평소 대비 증가배수 — 주의
  inf_min: number // 학교 최소 건수(노이즈 차단)
  inf_region_min: number // 지역 최소 건수
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  pm25_verybad: 76,
  pm25_bad: 36,
  rain_warning: 30,
  rain_advisory: 15,
  heat_warning: 35,
  heat_advisory: 33,
  cold_warning: -12,
  cold_advisory: -9,
  inf_excess_alert: 2.5,
  inf_excess_watch: 1.6,
  inf_min: 4,
  inf_region_min: 10,
}

export function deriveAlerts(
  w: WxLike,
  area: string,
  th: Thresholds = DEFAULT_THRESHOLDS,
): DisasterAlert[] {
  const out: DisasterAlert[] = []

  if (w.pm25 >= th.pm25_verybad)
    out.push({ id: 'pm25', type: '미세먼지', title: '초미세먼지 매우나쁨', detail: `${area} PM2.5 ${w.pm25}㎍/㎥ · 실외활동 자제, 실내수업 권고`, severity: 'danger', icon: 'ti-wind' })
  else if (w.pm25 >= th.pm25_bad)
    out.push({ id: 'pm25', type: '미세먼지', title: '초미세먼지 나쁨', detail: `${area} PM2.5 ${w.pm25}㎍/㎥ · 민감군 실외활동 주의`, severity: 'warning', icon: 'ti-wind' })

  if (w.rainMm >= th.rain_warning)
    out.push({ id: 'rain', type: '호우', title: '호우경보', detail: `시간당 강수 ${w.rainMm}mm · 등하교 안전 유의`, severity: 'danger', icon: 'ti-cloud-rain' })
  else if (w.rainMm >= th.rain_advisory)
    out.push({ id: 'rain', type: '호우', title: '호우주의보', detail: `시간당 강수 ${w.rainMm}mm · 우산·안전 유의`, severity: 'warning', icon: 'ti-cloud-rain' })

  if (w.tempC >= th.heat_warning)
    out.push({ id: 'heat', type: '폭염', title: '폭염경보', detail: `기온 ${w.tempC}°C · 야외활동 자제, 수분 섭취`, severity: 'danger', icon: 'ti-temperature' })
  else if (w.tempC >= th.heat_advisory)
    out.push({ id: 'heat', type: '폭염', title: '폭염주의보', detail: `기온 ${w.tempC}°C · 야외활동 주의`, severity: 'warning', icon: 'ti-temperature' })

  if (w.tempC <= th.cold_warning)
    out.push({ id: 'cold', type: '한파', title: '한파경보', detail: `기온 ${w.tempC}°C · 동상·등교 유의`, severity: 'danger', icon: 'ti-snowflake' })
  else if (w.tempC <= th.cold_advisory)
    out.push({ id: 'cold', type: '한파', title: '한파주의보', detail: `기온 ${w.tempC}°C · 보온 유의`, severity: 'warning', icon: 'ti-snowflake' })

  return out
}

/* ───────────── 공식 특보·지진 (data.go.kr 기상청, 프록시 경유) ─────────────
 *  · 기상특보: /api/kmawrn/getWthrWrnList (부산 stnId=159). title 자유문에서 유형·동작 파싱.
 *  · 지진:     /api/kmaeqk/getEqkMsg (최대 3일). 규모·위치.
 *  실패(키 없음·미승인·네트워크)면 [] 반환 → 앱은 파생 경보만 표시(무중단). */

const KMA_WARN_STN = '159' // 부산지방기상청 관할
const ACTIONS = ['대치', '변경', '발표', '해제'] as const

function iconForWarn(type: string): string {
  if (type.includes('호우') || type.includes('대설')) return 'ti-cloud-rain'
  if (type.includes('폭염')) return 'ti-temperature'
  if (type.includes('한파')) return 'ti-snowflake'
  if (type.includes('태풍') || type.includes('강풍') || type.includes('황사') || type.includes('건조')) return 'ti-wind'
  if (type.includes('해일') || type.includes('풍랑')) return 'ti-ripple'
  return 'ti-alert-triangle'
}

function fmtTmFc(tmFc: number | string): string {
  const s = String(tmFc)
  return s.length >= 12 ? `${s.slice(4, 6)}.${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : ''
}

type ParsedWarn = { type: string; level: '경보' | '주의보'; action: string }

/** title 자유문에서 " / " 뒤 특보 내용 추출 후 유형·등급·동작으로 분해.
 *  예: "폭염경보 변경·폭염주의보·열대야주의보 발표" → 폭염경보 변경, 폭염주의보 발표, 열대야주의보 발표
 *  (동작 단어는 그룹 끝에 한 번만 나오고, 앞의 동작 없는 항목들에 함께 적용되는 기상청 표기 관행) */
function parseWarnTitle(title: string): ParsedWarn[] {
  const seg1 = title.split(' / ')[1]
  if (!seg1) return []
  const content = seg1.replace(/\(\*\)\s*$/, '').trim()
  const segs = content.split('·').map((s) => s.trim()).filter(Boolean)
  const out: ParsedWarn[] = []
  let buffer: { type: string; level: '경보' | '주의보' }[] = []
  for (const seg of segs) {
    const action = ACTIONS.find((a) => seg.endsWith(a))
    const bodyRaw = action ? seg.slice(0, seg.length - action.length).trim() : seg
    const level: '경보' | '주의보' | null = bodyRaw.endsWith('경보') ? '경보' : bodyRaw.endsWith('주의보') ? '주의보' : null
    if (level) {
      const type = bodyRaw.replace(/(경보|주의보)$/, '').trim()
      buffer.push({ type, level })
    }
    if (action) {
      buffer.forEach((b) => out.push({ ...b, action }))
      buffer = []
    }
  }
  buffer.forEach((b) => out.push({ ...b, action: '발표' })) // 그룹 끝 동작 없으면 발표로 간주
  return out
}

interface WarnItem { title?: string; tmFc?: number | string }

/** 최근 발표 이력을 시간순으로 접어 "현재 발효 중"(마지막 동작이 해제가 아닌) 특보만 남긴다. */
async function fetchWeatherWarnings(): Promise<DisasterAlert[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 3 * 864e5) // 최근 3일
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const url =
    `/api/kmawrn/getWthrWrnList?dataType=JSON&numOfRows=30&pageNo=1&stnId=${KMA_WARN_STN}` +
    `&fromTmFc=${ymd(from)}&toTmFc=${ymd(now)}`
  const j = await fetch(url).then((r) => r.json())
  if (j?.response?.header?.resultCode !== '00') return []
  const raw = j?.response?.body?.items?.item
  const items: WarnItem[] = Array.isArray(raw) ? raw : raw ? [raw] : []

  // 오래된 → 최신 순으로 접어 유형별 마지막 상태 판정
  const state = new Map<string, { level: '경보' | '주의보'; action: string; tmFc: number | string }>()
  items
    .slice()
    .sort((a, b) => Number(a.tmFc ?? 0) - Number(b.tmFc ?? 0))
    .forEach((it) => {
      parseWarnTitle(String(it.title ?? '')).forEach((w) => {
        state.set(`${w.type} ${w.level}`, { level: w.level, action: w.action, tmFc: it.tmFc ?? '' })
      })
    })

  const out: DisasterAlert[] = []
  for (const [key, s] of state) {
    if (s.action === '해제') continue // 해제된 특보 제외
    const t = fmtTmFc(s.tmFc)
    out.push({
      id: `kma-wrn-${key}`,
      type: '기상특보',
      title: key, // 예: "폭염 경보"
      detail: `기상청 특보 · 부산${t ? ` · ${t} 발효` : ''}`,
      severity: s.level === '경보' ? 'danger' : 'warning',
      icon: iconForWarn(key),
    })
  }
  return out
}

interface EqkItem { loc?: string; mt?: string | number; magMl?: string | number; tmEqk?: string | number; inT?: string }

/** 최근 3일 지진 통보. 규모 2.0+ 만 노출(2.0~ 주의, 4.0+ 경보). */
async function fetchEarthquakes(): Promise<DisasterAlert[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 3 * 864e5)
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const url = `/api/kmaeqk/getEqkMsg?dataType=JSON&numOfRows=10&pageNo=1&fromTmFc=${ymd(from)}&toTmFc=${ymd(now)}`
  const j = await fetch(url).then((r) => r.json())
  if (j?.response?.header?.resultCode !== '00') return [] // 03 NO_DATA 등
  const raw = j?.response?.body?.items?.item
  const items: EqkItem[] = Array.isArray(raw) ? raw : raw ? [raw] : []

  const out: DisasterAlert[] = []
  items.forEach((it, i) => {
    const mag = Number(it.mt ?? it.magMl ?? NaN)
    if (Number.isNaN(mag) || mag < 2.0) return
    const loc = String(it.loc ?? '위치 미상').trim()
    const t = fmtTmFc(String(it.tmEqk ?? '').slice(0, 12))
    out.push({
      id: `kma-eqk-${i}-${it.tmEqk ?? ''}`,
      type: '지진',
      title: `지진 규모 ${mag.toFixed(1)}`,
      detail: `${loc}${t ? ` · ${t}` : ''} · 기상청 지진통보`,
      severity: mag >= 4.0 ? 'danger' : 'warning',
      icon: 'ti-alert-triangle',
    })
  })
  return out
}

/** 공식 특보·지진 통합 조회. 부분 실패는 무시하고 성공분만 반환(앱 무중단). */
export async function fetchOfficialAlerts(): Promise<DisasterAlert[]> {
  const [wrn, eqk] = await Promise.all([
    fetchWeatherWarnings().catch(() => [] as DisasterAlert[]),
    fetchEarthquakes().catch(() => [] as DisasterAlert[]),
  ])
  return [...eqk, ...wrn] // 지진을 위에
}
