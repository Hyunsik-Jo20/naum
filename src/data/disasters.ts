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

/** 공식 특보·지진·재난문자 연동 자리 (기상청 특보/지진·행안부 긴급재난문자 서비스 승인 시 구현) */
export async function fetchOfficialAlerts(): Promise<DisasterAlert[]> {
  return []
}
