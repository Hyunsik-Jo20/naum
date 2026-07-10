import { useEffect, useRef, useState } from 'react'
import { fetchCurrent, type CurrentWeather } from '../data/weatherApi'
import { deriveAlerts } from '../data/disasters'
import { useOfficialAlerts } from '../data/useOfficialAlerts'
import { SCHOOL } from '../data/location'
import { useNotices } from '../store/notices'
import { pmGrade, pm25Grade } from '../data/weather'
import DisasterStrip from './DisasterStrip'

/** 상단바 컴팩트 날씨 + 경보 요약. 심각도별 배경색(초록/주황/붉은 반투명, 깜빡임 없음),
 *  클릭하면 아래로 경보 상세 패널이 펼쳐진다. (재난 정보는 받는 쪽이라 여기서 발송 버튼은 없음.) */
export default function HeaderWeather() {
  const { thresholds } = useNotices()
  const official = useOfficialAlerts()
  const [wx, setWx] = useState<CurrentWeather | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ok = true
    const load = () => fetchCurrent().then((w) => ok && setWx(w)).catch(() => {})
    load()
    const t = window.setInterval(load, 10 * 60 * 1000)
    return () => { ok = false; window.clearInterval(t) }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!wx) return <span className="spacer" />

  const alerts = [...official, ...deriveAlerts(wx, SCHOOL.name, thresholds)]
  const sev = alerts.some((a) => a.severity === 'danger') ? 'danger' : alerts.length ? 'warn' : 'ok'
  const pm10g = pmGrade(wx.pm10)
  const pm25g = pm25Grade(wx.pm25)
  const label = alerts.length ? `${alerts[0].title}${alerts.length > 1 ? ` 외 ${alerts.length - 1}` : ''}` : '경보 없음'

  return (
    <div className={`hdr-wx no-print sev-${sev}`} ref={ref}>
      <span className="hwx"><i className="ti ti-temperature" aria-hidden="true" /> {wx.tempC}°</span>
      <span className="hwx"><i className="ti ti-droplet" aria-hidden="true" /> {wx.humidity}%</span>
      <span className="hwx">
        <i className="ti ti-wind" aria-hidden="true" /> PM10 {wx.pm10}
        <span className={`wx-badge ${pm10g.tone}`}>{pm10g.label}</span>
        · PM2.5 {wx.pm25}
        <span className={`wx-badge ${pm25g.tone}`}>{pm25g.label}</span>
      </span>
      <span className="hwx"><i className="ti ti-cloud-rain" aria-hidden="true" /> {wx.rainMm}mm</span>
      <button className={`hdr-alarm sev-${sev}`} onClick={() => setOpen((o) => !o)} title="재난·기상 경보 보기">
        <i className={`ti ${sev === 'ok' ? 'ti-circle-check' : 'ti-alert-triangle'}`} aria-hidden="true" /> {label}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="hdr-wx-panel">
          <DisasterStrip alerts={alerts} />
        </div>
      )}
    </div>
  )
}
