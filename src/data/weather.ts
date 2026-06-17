// 날씨 데이터(데모) + 유목화(등급) 헬퍼.
// 교육청 대시보드에서 기온/미세먼지/강수를 등급으로 필터링하는 데 사용.

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

export interface Band {
  label: string
  tone: Tone
}

export interface WeatherDay {
  date: string // M/D
  dow: string
  tempC: number
  humidity: number
  pm10: number
  pm25: number
  rainMm: number
  cat: number[] // 그날 계통별 방문 수 (len 12)
  visits: number
}

/* ── 유목화(등급) ── */
export const TEMP_BANDS = ['한파', '추움', '선선', '적정', '더움', '폭염']
export const PM_GRADES = ['좋음', '보통', '나쁨', '매우나쁨']
export const RAIN_CLASSES = ['없음', '약한비', '비', '강한비']

export function tempBand(c: number): Band {
  if (c < 0) return { label: '한파', tone: 'danger' }
  if (c < 10) return { label: '추움', tone: 'info' }
  if (c < 18) return { label: '선선', tone: 'info' }
  if (c < 25) return { label: '적정', tone: 'success' }
  if (c < 33) return { label: '더움', tone: 'warning' }
  return { label: '폭염', tone: 'danger' }
}

export function pmGrade(pm10: number): Band {
  if (pm10 <= 30) return { label: '좋음', tone: 'success' }
  if (pm10 <= 80) return { label: '보통', tone: 'info' }
  if (pm10 <= 150) return { label: '나쁨', tone: 'warning' }
  return { label: '매우나쁨', tone: 'danger' }
}

// 초미세먼지(PM2.5) 등급 — 한국 기준 (좋음 0~15 / 보통 16~35 / 나쁨 36~75 / 매우나쁨 76~)
export function pm25Grade(pm25: number): Band {
  if (pm25 <= 15) return { label: '좋음', tone: 'success' }
  if (pm25 <= 35) return { label: '보통', tone: 'info' }
  if (pm25 <= 75) return { label: '나쁨', tone: 'warning' }
  return { label: '매우나쁨', tone: 'danger' }
}

export function rainClass(mm: number): Band {
  if (mm <= 0) return { label: '없음', tone: 'muted' }
  if (mm < 3) return { label: '약한비', tone: 'info' }
  if (mm < 15) return { label: '비', tone: 'info' }
  return { label: '강한비', tone: 'warning' }
}

export function humidityBand(h: number): Band {
  if (h < 40) return { label: '건조', tone: 'warning' }
  if (h <= 60) return { label: '쾌적', tone: 'success' }
  return { label: '높음', tone: 'info' }
}

/* ── 날씨 → 계통별 방문 수 모형 (날씨 연계 분석/데모용) ── */
export const DOW = ['일', '월', '화', '수', '목', '금', '토']

export function visitCat(tempC: number, pm10: number, rainMm: number): number[] {
  const cat = new Array(12).fill(0)
  cat[0] = 18 + (tempC < 10 ? 12 : 0) + (pm10 > 80 ? 12 : 0) // 호흡기계
  cat[1] = 14 // 소화기계
  cat[5] = 10 // 피부피하계
  cat[4] = 7 + (rainMm > 0 ? 8 : 0) // 근골격계(비오는 날↑)
  cat[3] = 6 // 정신신경계
  cat[9] = 5 + (pm10 > 80 ? 6 : 0) // 안과계(미세먼지↑)
  cat[8] = 4 + (pm10 > 80 ? 4 : 0) // 이비인후과계
  cat[11] = 6 // 기타
  return cat
}

export function makeDay(
  date: string,
  dow: string,
  tempC: number,
  humidity: number,
  pm10: number,
  pm25: number,
  rainMm: number,
): WeatherDay {
  const cat = visitCat(tempC, pm10, rainMm)
  return { date, dow, tempC, humidity, pm10, pm25, rainMm, cat, visits: cat.reduce((a, b) => a + b, 0) }
}

/* ── 14일 일별 시계열(폴백 데모): API 실패 시 사용 ── */
const TEMPS = [6, 8, 5, 12, 15, 18, 22, 9, 7, 14, 20, 25, 11, 16]
const PM10S = [35, 90, 120, 40, 28, 60, 75, 160, 140, 45, 30, 55, 95, 85]
const RAINS = [0, 0, 5, 0, 0, 12, 0, 0, 3, 0, 0, 20, 0, 0]

function buildSeries(): WeatherDay[] {
  const base = Date.now()
  return TEMPS.map((tempC, i) => {
    const d = new Date(base - (13 - i) * 86400000)
    const pm10 = PM10S[i]
    const rainMm = RAINS[i]
    const humidity = rainMm > 0 ? 82 : 48 + (i % 5) * 5
    return makeDay(`${d.getMonth() + 1}/${d.getDate()}`, DOW[d.getDay()], tempC, humidity, pm10, Math.round(pm10 * 0.6), rainMm)
  })
}

export const weatherSeries: WeatherDay[] = buildSeries()
export const today: WeatherDay = weatherSeries[weatherSeries.length - 1]
