// 실시간 날씨 API. 좌표(lat, lon)별 호출 → 학교 위치 기준 "가장 가까운" 기상.
//  - 기본: Open-Meteo (API 키 불필요)
//  - VITE_WEATHER_SOURCE=kma 이면 기상청 동네예보(좌표→5km 격자) + 에어코리아 미세먼지
//    (개발 프록시 /api/kma, /api/air 경유. 실패 시 Open-Meteo 폴백)
import { DOW, makeDay, type WeatherDay } from './weather'
import { dfsXyConv } from './kmaGrid'
import { wgs84ToTM } from './tm'
import { SCHOOL } from './location'

const TZ = 'Asia%2FSeoul'
const SOURCE = (import.meta.env.VITE_WEATHER_SOURCE as string) || 'open-meteo'

export interface CurrentWeather {
  tempC: number
  humidity: number
  pm10: number
  pm25: number
  rainMm: number
  station?: string // 미세먼지 측정소명(에어코리아 최근접)
}

const r1 = (n: unknown, f = 0) => (typeof n === 'number' && !Number.isNaN(n) ? Math.round(n) : f)
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const pad = (n: number) => String(n).padStart(2, '0')

/* ───────────── Open-Meteo (키 불필요) ───────────── */
async function fetchCurrentOpenMeteo(lat: number, lon: number): Promise<CurrentWeather> {
  const wx = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation&timezone=${TZ}`,
  ).then((r) => r.json())
  const air = await fetchAir(lat, lon)
  return {
    tempC: r1(wx?.current?.temperature_2m),
    humidity: r1(wx?.current?.relative_humidity_2m),
    rainMm: r1(wx?.current?.precipitation),
    pm10: air.pm10,
    pm25: air.pm25,
    station: air.station,
  }
}

async function fetchOpenMeteoAir(lat: number, lon: number): Promise<{ pm10: number; pm25: number }> {
  const aq = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=${TZ}`,
  ).then((r) => r.json())
  return { pm10: r1(aq?.current?.pm10), pm25: r1(aq?.current?.pm2_5) }
}

// 에어코리아: 좌표 → 최근접 측정소 → 실측 PM10/PM2.5
async function fetchNearestAirKorea(
  lat: number,
  lon: number,
): Promise<{ pm10: number; pm25: number; station: string }> {
  const { x, y } = wgs84ToTM(lat, lon)
  const near = await fetch(
    `/api/airstn/getNearbyMsrstnList?returnType=json&tmX=${x}&tmY=${y}&ver=1.1`,
  ).then((r) => r.json())
  const station: string | undefined = near?.response?.body?.items?.[0]?.stationName
  if (!station) throw new Error('no nearby station')
  const m = await fetch(
    `/api/air/getMsrstnAcctoRltmMesureDnsty?returnType=json&numOfRows=1&pageNo=1&dataTerm=DAILY&ver=1.3&stationName=${encodeURIComponent(station)}`,
  ).then((r) => r.json())
  const it = m?.response?.body?.items?.[0]
  const pm10 = Number(it?.pm10Value)
  const pm25 = Number(it?.pm25Value)
  if (Number.isNaN(pm10) && Number.isNaN(pm25)) throw new Error('no measure')
  return { pm10: r1(pm10), pm25: r1(pm25), station }
}

// 미세먼지: 최근접 측정소(에어코리아 실측) 우선, 실패 시 Open-Meteo(좌표) 폴백
async function fetchAir(
  lat: number,
  lon: number,
): Promise<{ pm10: number; pm25: number; station?: string }> {
  try {
    return await fetchNearestAirKorea(lat, lon)
  } catch {
    return fetchOpenMeteoAir(lat, lon)
  }
}

/* ───────────── 기상청 동네예보 + 에어코리아 (키 필요, 프록시 경유) ───────────── */
function ncstBase(): { baseDate: string; baseTime: string } {
  const d = new Date()
  d.setMinutes(d.getMinutes() - 40)
  return {
    baseDate: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
    baseTime: `${pad(d.getHours())}00`,
  }
}

async function fetchCurrentKMA(lat: number, lon: number): Promise<CurrentWeather> {
  const { nx, ny } = dfsXyConv(lat, lon) // 학교 좌표 → 가장 가까운 5km 격자
  const { baseDate, baseTime } = ncstBase()
  const url =
    `/api/kma/getUltraSrtNcst?dataType=JSON&numOfRows=100&pageNo=1` +
    `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`
  const j = await fetch(url).then((r) => r.json())
  const items: any[] = j?.response?.body?.items?.item ?? []
  if (items.length === 0) throw new Error('KMA empty')
  const get = (c: string) => {
    const it = items.find((x) => x.category === c)
    return it ? Number(it.obsrValue) : NaN
  }
  // 미세먼지: 최근접 측정소 실측(에어코리아) → Open-Meteo 폴백
  const air = await fetchAir(lat, lon).catch(() => ({ pm10: 0, pm25: 0, station: undefined }))
  return {
    tempC: r1(get('T1H')),
    humidity: r1(get('REH')),
    rainMm: r1(get('RN1')),
    pm10: air.pm10,
    pm25: air.pm25,
    station: air.station,
  }
}

/* ───────────── 공개 API (좌표별 + 소스 선택 + 폴백) ───────────── */
export async function fetchCurrent(
  lat: number = SCHOOL.lat,
  lon: number = SCHOOL.lon,
): Promise<CurrentWeather> {
  if (SOURCE === 'kma') {
    try {
      return await fetchCurrentKMA(lat, lon)
    } catch {
      return fetchCurrentOpenMeteo(lat, lon)
    }
  }
  return fetchCurrentOpenMeteo(lat, lon)
}

/** 최근 14일 일별 기상 + 미세먼지 → WeatherDay[] (방문 수는 모형 적용). 과거는 Open-Meteo. */
export async function fetchHistory(
  lat: number = SCHOOL.lat,
  lon: number = SCHOOL.lon,
): Promise<WeatherDay[]> {
  const wx = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_mean,precipitation_sum&past_days=14&forecast_days=1&timezone=${TZ}`,
  ).then((r) => r.json())
  const aq = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5&past_days=14&forecast_days=1&timezone=${TZ}`,
  ).then((r) => r.json())

  const p10: Record<string, number[]> = {}
  const p25: Record<string, number[]> = {}
  const times: string[] = aq?.hourly?.time ?? []
  times.forEach((t, i) => {
    const day = t.slice(0, 10)
    ;(p10[day] ??= []).push(aq.hourly.pm10[i])
    ;(p25[day] ??= []).push(aq.hourly.pm2_5[i])
  })

  const days: string[] = wx?.daily?.time ?? []
  return days.map((day, i) => {
    const tempC = r1(wx.daily.temperature_2m_mean[i])
    const rainMm = r1(wx.daily.precipitation_sum[i])
    const pm10 = r1(avg(p10[day] ?? []))
    const pm25 = r1(avg(p25[day] ?? []))
    const humidity = rainMm > 0 ? 82 : 52
    const d = new Date(day)
    return makeDay(`${d.getMonth() + 1}/${d.getDate()}`, DOW[d.getDay()], tempC, humidity, pm10, pm25, rainMm)
  })
}
