// 날씨 유목화(등급) 헬퍼 + 일별 기상 타입.
// 교육청 대시보드에서 기온/미세먼지/강수를 등급으로 필터링하는 데 사용.
// (구 "날씨→방문수 합성 모형"은 제거 — 방문 수는 실데이터(eduLive)에서 일자 조인.)

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

export interface Band {
  label: string
  tone: Tone
}

/** 하루치 실측 기상 — 방문 수는 포함하지 않음(실데이터와 key(YYYY-MM-DD)로 조인). */
export interface WeatherDay {
  key: string // YYYY-MM-DD (방문 실데이터 조인 키)
  date: string // M/D
  dow: string
  tempC: number
  humidity: number
  pm10: number
  pm25: number
  rainMm: number
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

export const DOW = ['일', '월', '화', '수', '목', '금', '토']
