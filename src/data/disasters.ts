// 재난·기상 경보. 실시간 기상으로 판정(미세먼지·호우·폭염·한파) + 기상청 공식 특보·지진(fetchOfficialAlerts).
import { SCHOOL } from './location' // 지진 거리 판정 기준(학교 좌표)

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
 *  · 기상특보: 통보문(getWthrWrnMsg)의 **t6 "현재 발효중인 특보"** 를 그대로 읽는다.
 *      - getWthrWrnList는 "발표 이력 로그"라 접어서 현재 상태를 추정하면 틀린다(해제/변경이 지역별로
 *        쪼개져 있어 제목만으론 판별 불가 → 해제된 특보가 계속 남거나, 부분 해제를 전체 해제로 오판).
 *      - t6는 지역까지 명시하므로 **우리 지역(부산) 발효분만** 남기고, 해제되면 목록에서 사라져 자동 만료.
 *  · 지진: /api/kmaeqk/getEqkMsg (최대 3일). 국외·원거리 지진 제외(학교 안전과 무관).
 *  실패(키 없음·미승인·네트워크)면 [] 반환 → 앱은 파생 경보만 표시(무중단). */

const KMA_WARN_STN = '159' // 부산지방기상청 관할
const SCHOOL_REGION = '부산' // t6 지역 매칭 기준(해상 '부산앞바다' 등은 제외되도록 정확 매칭)
const EQK_MAX_KM = 600 // 학교에서 이보다 먼 지진은 제외

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

/** 두 좌표 간 거리(km) — 지진이 학교와 얼마나 가까운지 판단용. */
function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLon = rad(bLon - aLon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

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

/** 통보문 t6 한 줄 파싱: "o 폭염주의보 : 경상남도, 부산, 울산" → { name, areas } */
function parseActiveLine(line: string): { name: string; areas: string[] } | null {
  const m = /^\s*o\s*(.+?)\s*:\s*(.+)$/.exec(line)
  if (!m) return null
  return { name: m[1].trim(), areas: m[2].split(',').map((s) => s.trim()) }
}
/** 우리 지역(부산) 발효분인지 — '부산' 또는 '부산(세부지역)'만. '남해동부앞바다(부산앞바다)' 같은 해상은 제외. */
const inRegion = (areas: string[]) =>
  areas.some((a) => a === SCHOOL_REGION || a.startsWith(`${SCHOOL_REGION}(`))

/** 현재 발효중인 특보(우리 지역분만). 해제되면 t6에서 빠지므로 자동으로 사라진다. */
async function fetchWeatherWarnings(): Promise<DisasterAlert[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 5 * 864e5) // 목록 조회는 최대 6일 제한
  // 1) 최신 발표번호(tmFc) 찾기
  const lj = await fetch(
    `/api/kmawrn/getWthrWrnList?dataType=JSON&numOfRows=1&pageNo=1&stnId=${KMA_WARN_STN}` +
      `&fromTmFc=${ymd(from)}&toTmFc=${ymd(now)}`,
  ).then((r) => r.json())
  if (lj?.response?.header?.resultCode !== '00') return []
  const li = lj?.response?.body?.items?.item
  const latest = (Array.isArray(li) ? li[0] : li)?.tmFc
  if (!latest) return [] // 최근 특보 발표 자체가 없음 = 발효중 없음

  // 2) 그 통보문의 "현재 발효중인 특보"(t6)
  const mj = await fetch(
    `/api/kmawrn/getWthrWrnMsg?dataType=JSON&numOfRows=1&pageNo=1&stnId=${KMA_WARN_STN}&tmFc=${latest}`,
  ).then((r) => r.json())
  if (mj?.response?.header?.resultCode !== '00') return []
  const mi = mj?.response?.body?.items?.item
  const t6 = String((Array.isArray(mi) ? mi[0] : mi)?.t6 ?? '')
  const at = fmtTmFc(latest)

  const out: DisasterAlert[] = []
  for (const line of t6.split(/\r?\n/)) {
    const p = parseActiveLine(line)
    if (!p || !inRegion(p.areas)) continue
    const level = p.name.endsWith('경보') ? '경보' : p.name.endsWith('주의보') ? '주의보' : null
    if (!level) continue // "없음" 등
    const type = p.name.slice(0, p.name.length - level.length)
    out.push({
      id: `kma-wrn-${p.name}`,
      type: '기상특보',
      title: `${type} ${level}`,
      detail: `기상청 특보 · ${SCHOOL_REGION} 발효 중${at ? ` · ${at} 기준` : ''}`,
      severity: level === '경보' ? 'danger' : 'warning',
      icon: iconForWarn(type),
    })
  }
  return out
}

interface EqkItem {
  loc?: string
  mt?: string | number
  tmEqk?: string | number
  rem?: string
  lat?: string | number
  lon?: string | number
}

/** 최근 3일 지진 통보 중 **학교와 관련된 것만**: 기상청이 '국내영향없음'으로 판단한 국외 지진 제외 +
 *  학교에서 EQK_MAX_KM 밖 제외. 규모 2.0+ 노출(4.0+ 경보). */
async function fetchEarthquakes(): Promise<DisasterAlert[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 3 * 864e5) // 지진은 최대 3일 제한
  const j = await fetch(
    `/api/kmaeqk/getEqkMsg?dataType=JSON&numOfRows=10&pageNo=1&fromTmFc=${ymd(from)}&toTmFc=${ymd(now)}`,
  ).then((r) => r.json())
  if (j?.response?.header?.resultCode !== '00') return [] // 03 NO_DATA 등
  const raw = j?.response?.body?.items?.item
  const items: EqkItem[] = Array.isArray(raw) ? raw : raw ? [raw] : []

  const out: DisasterAlert[] = []
  items.forEach((it, i) => {
    if (/국내\s*영향\s*없음/.test(String(it.rem ?? ''))) return // 기상청이 국내 무영향으로 명시(국외 지진)
    const mag = Number(it.mt ?? NaN)
    if (Number.isNaN(mag) || mag < 2.0) return
    const lat = Number(it.lat)
    const lon = Number(it.lon)
    const km = Number.isFinite(lat) && Number.isFinite(lon) ? distKm(SCHOOL.lat, SCHOOL.lon, lat, lon) : NaN
    if (Number.isFinite(km) && km > EQK_MAX_KM) return // 학교와 무관한 원거리 지진
    const loc = String(it.loc ?? '위치 미상').trim()
    const t = fmtTmFc(String(it.tmEqk ?? '').slice(0, 12))
    out.push({
      id: `kma-eqk-${i}-${it.tmEqk ?? ''}`,
      type: '지진',
      title: `지진 규모 ${mag.toFixed(1)}`,
      detail: `${loc}${t ? ` · ${t}` : ''}${Number.isFinite(km) ? ` · 학교에서 약 ${Math.round(km)}km` : ''}`,
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
