import { useEffect, useState } from 'react'
import { fetchCurrent, type CurrentWeather } from '../data/weatherApi'
import { deriveAlerts } from '../data/disasters'
import { useOfficialAlerts } from '../data/useOfficialAlerts'
import { SCHOOL } from '../data/location'
import { useNotices } from '../store/notices'
import { pmGrade, pm25Grade } from '../data/weather'

/** 상단바 제목줄에 들어가는 컴팩트 날씨·경보. 경보 발령 시 붉게 깜빡이고 공지 알람이 깜빡인다. */
export default function HeaderWeather() {
  const { thresholds, openCompose } = useNotices()
  const official = useOfficialAlerts()
  const [wx, setWx] = useState<CurrentWeather | null>(null)

  useEffect(() => {
    let ok = true
    const load = () => fetchCurrent().then((w) => ok && setWx(w)).catch(() => {})
    load()
    const t = window.setInterval(load, 10 * 60 * 1000)
    return () => {
      ok = false
      window.clearInterval(t)
    }
  }, [])

  if (!wx) return <span className="spacer" />

  const alerts = [...official, ...deriveAlerts(wx, SCHOOL.name, thresholds)]
  const sev = alerts.some((a) => a.severity === 'danger') ? 'danger' : alerts.length ? 'warn' : ''
  const pm10g = pmGrade(wx.pm10)
  const pm25g = pm25Grade(wx.pm25)

  return (
    <div className={`hdr-wx no-print ${sev}`}>
      <span className="hwx"><i className="ti ti-temperature" aria-hidden="true" /> {wx.tempC}°</span>
      <span className="hwx"><i className="ti ti-droplet" aria-hidden="true" /> {wx.humidity}%</span>
      <span className="hwx">
        <i className="ti ti-wind" aria-hidden="true" /> PM10 {wx.pm10}
        <span className={`wx-badge ${pm10g.tone}`}>{pm10g.label}</span>
        · PM2.5 {wx.pm25}
        <span className={`wx-badge ${pm25g.tone}`}>{pm25g.label}</span>
      </span>
      <span className="hwx"><i className="ti ti-cloud-rain" aria-hidden="true" /> {wx.rainMm}mm</span>
      {alerts.length > 0 && (
        <button
          className="hdr-alarm"
          onClick={() => openCompose({ title: `[긴급] ${alerts[0].title}`, body: alerts[0].detail, to: '교육청' })}
          title="경보 공지 발송"
        >
          <i className="ti ti-alert-triangle" aria-hidden="true" /> {alerts[0].title}
          {alerts.length > 1 ? ` 외 ${alerts.length - 1}` : ''} · 공지
        </button>
      )}
    </div>
  )
}
