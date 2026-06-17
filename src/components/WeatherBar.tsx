import { useEffect, useState } from 'react'
import {
  humidityBand,
  pmGrade,
  pm25Grade,
  rainClass,
  tempBand,
  today,
  type Band,
} from '../data/weather'
import { fetchCurrent, type CurrentWeather } from '../data/weatherApi'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function Badge({ band }: { band: Band }) {
  return <span className={`wx-badge ${band.tone}`}>{band.label}</span>
}

const DEMO: CurrentWeather = {
  tempC: today.tempC,
  humidity: today.humidity,
  pm10: today.pm10,
  pm25: today.pm25,
  rainMm: today.rainMm,
}

export default function WeatherBar({
  lat,
  lon,
  label = '부산',
  onData,
}: {
  lat?: number
  lon?: number
  label?: string
  onData?: (w: CurrentWeather) => void
}) {
  const [cur, setCur] = useState<CurrentWeather>(DEMO)
  const [status, setStatus] = useState<'loading' | 'live' | 'demo'>('loading')

  useEffect(() => {
    let ok = true
    setStatus('loading')
    fetchCurrent(lat, lon)
      .then((c) => {
        if (ok) {
          setCur(c)
          setStatus('live')
          onData?.(c)
        }
      })
      .catch(() => ok && setStatus('demo'))
    return () => {
      ok = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon])

  const now = new Date()
  const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일`
  const dow = DOW[now.getDay()]

  const statusBadge =
    status === 'live'
      ? { cls: 'success', text: '실시간' }
      : status === 'loading'
        ? { cls: 'muted', text: '불러오는 중' }
        : { cls: 'muted', text: '데모' }

  return (
    <div className="weatherbar">
      <div className="wx-date">
        <i className="ti ti-calendar" aria-hidden="true" />
        <div>
          <div className="wx-date-main">{dateStr}</div>
          <div className="wx-date-sub">
            {dow}요일 · {label} <span className={`wx-badge ${statusBadge.cls}`}>{statusBadge.text}</span>
          </div>
        </div>
      </div>

      <div className="wx-items">
        <div className="wx-item">
          <span className="wx-label"><i className="ti ti-temperature" aria-hidden="true" /> 기온</span>
          <span className="wx-val">{cur.tempC}°C</span>
          <Badge band={tempBand(cur.tempC)} />
        </div>
        <div className="wx-item">
          <span className="wx-label"><i className="ti ti-droplet" aria-hidden="true" /> 습도</span>
          <span className="wx-val">{cur.humidity}%</span>
          <Badge band={humidityBand(cur.humidity)} />
        </div>
        <div className="wx-item">
          <span className="wx-label">
            <i className="ti ti-wind" aria-hidden="true" /> 미세먼지{cur.station ? ` · ${cur.station}` : ''}
          </span>
          <span className="wx-val">PM10 {cur.pm10}</span>
          <Badge band={pmGrade(cur.pm10)} />
        </div>
        <div className="wx-item">
          <span className="wx-label"><i className="ti ti-wind" aria-hidden="true" /> 초미세먼지</span>
          <span className="wx-val">PM2.5 {cur.pm25}</span>
          <Badge band={pm25Grade(cur.pm25)} />
        </div>
        <div className="wx-item">
          <span className="wx-label"><i className="ti ti-cloud-rain" aria-hidden="true" /> 강수</span>
          <span className="wx-val">{cur.rainMm}mm</span>
          <Badge band={rainClass(cur.rainMm)} />
        </div>
      </div>
    </div>
  )
}
