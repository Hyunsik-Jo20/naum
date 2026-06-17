import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVisits } from '../store/visits'
import { useNotices } from '../store/notices'
import {
  dateKey,
  monthReports,
  reportFromVisits,
  type DailyReport,
} from '../data/dailyReport'
import { buildBogeonSheets } from '../data/bogeonLog'
import { downloadExcelX } from '../data/excel'
import { fetchCurrent, type CurrentWeather } from '../data/weatherApi'

const BUSINESS_END_HOUR = 17 // 업무 종료 = 17:00 → 일일 보고 자동 마감
const LS_DAILY = 'naum.dailyReports'
const WD = ['일', '월', '화', '수', '목', '금', '토']

function loadSaved(): Record<string, DailyReport> {
  try {
    return JSON.parse(localStorage.getItem(LS_DAILY) || '{}')
  } catch {
    return {}
  }
}
function persist(map: Record<string, DailyReport>) {
  try {
    localStorage.setItem(LS_DAILY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export default function Principal() {
  const { visits, studentOf } = useVisits()
  const { sent } = useNotices()
  const [saved, setSaved] = useState<Record<string, DailyReport>>(() => loadSaved())
  const [now] = useState(() => new Date())
  const [wx, setWx] = useState<CurrentWeather | null>(null)
  const todayKey = dateKey(now)

  useEffect(() => {
    let ok = true
    fetchCurrent().then((w) => ok && setWx(w)).catch(() => {})
    return () => { ok = false }
  }, [])

  const todayLive = useMemo(() => reportFromVisits(now, visits, 'auto'), [now, visits])
  const todayClosed = saved[todayKey]
  const todayReport = todayClosed ?? todayLive

  const reports = useMemo(() => monthReports(now, saved, todayLive), [now, saved, todayLive])
  const opDays = reports.filter((r) => r.operating)
  const monthTotal = opDays.reduce((a, r) => a + r.total, 0)

  const closeToday = (r: DailyReport, auto: boolean) => {
    setSaved((prev) => {
      const next = { ...prev, [todayKey]: { ...r, source: 'auto' as const } }
      persist(next)
      return next
    })
    void auto
  }
  // 마감 취소(재오픈) — 추가 학생 접수 가능. 취소 후엔 자동 마감 재실행 방지(수동 마감 전까지).
  const reopenedRef = useRef(false)
  const reopenToday = () => {
    reopenedRef.current = true
    setSaved((prev) => {
      const next = { ...prev }
      delete next[todayKey]
      persist(next)
      return next
    })
  }
  const closeRef = useRef(closeToday)
  closeRef.current = closeToday
  const liveRef = useRef(todayLive)
  liveRef.current = todayLive

  // 업무 종료(17:00) 시 오늘 일일 보고 자동 마감 — 매분 확인 (마감 취소했으면 건너뜀)
  useEffect(() => {
    const check = () => {
      const d = new Date()
      if (!reopenedRef.current && d.getHours() >= BUSINESS_END_HOUR && !loadSaved()[dateKey(d)]) {
        closeRef.current(liveRef.current, true)
      }
    }
    check()
    const t = window.setInterval(check, 60_000)
    return () => window.clearInterval(t)
  }, [])

  // 내보낼 달 선택(최근 12개월)
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - i, 1)),
    [now],
  )
  const [exportOpen, setExportOpen] = useState(false)
  const [exportYM, setExportYM] = useState(`${now.getFullYear()}-${now.getMonth()}`)

  const exportExcel = (monthDate: Date) => {
    const sheets = buildBogeonSheets(
      monthDate,
      visits,
      studentOf,
      sent.map((n) => ({ ts: n.ts, title: n.title })),
      wx ? { tempC: wx.tempC, humidity: wx.humidity, rainMm: wx.rainMm } : undefined,
    )
    const fname = `보건일지_${monthDate.getFullYear()}${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    downloadExcelX(fname, sheets)
    setExportOpen(false)
  }

  const o = todayReport.outcomes
  const autoClosed = !!todayClosed
  const pastEnd = now.getHours() >= BUSINESS_END_HOUR

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Link to="/nurse/queue" className="muted" style={{ fontSize: 12, textDecoration: 'none' }}>
            <i className="ti ti-arrow-left" style={{ verticalAlign: -2 }} aria-hidden="true" /> 보건실 현황
          </Link>
          <h2 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 600 }}>교장 보고 · 보건실</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            업무 종료(17:00) 시 일일 보고 자동 마감 · 월간은 주간 시트 엑셀로 내보내기
          </div>
        </div>
        <div className="export-wrap">
          <button className="btn" onClick={() => setExportOpen((v) => !v)}>
            <i className="ti ti-file-spreadsheet" aria-hidden="true" /> 보건일지 엑셀(주별 시트)
            <i className="ti ti-chevron-down" style={{ marginLeft: 4 }} aria-hidden="true" />
          </button>
          {exportOpen && (
            <>
              <div className="export-backdrop" onClick={() => setExportOpen(false)} />
              <div className="export-pop">
                <div className="export-pop-label">출력할 달 선택</div>
                <select value={exportYM} onChange={(e) => setExportYM(e.target.value)}>
                  {monthOptions.map((d) => (
                    <option key={`${d.getFullYear()}-${d.getMonth()}`} value={`${d.getFullYear()}-${d.getMonth()}`}>
                      {d.getFullYear()}년 {d.getMonth() + 1}월
                    </option>
                  ))}
                </select>
                <button
                  className="btn small"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                  onClick={() => {
                    const [yy, mm] = exportYM.split('-').map(Number)
                    exportExcel(new Date(yy, mm, 1))
                  }}
                >
                  <i className="ti ti-download" aria-hidden="true" /> 엑셀 내려받기
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 오늘 일일 보고 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div className="sec-label">
            <i className="ti ti-clipboard-text" style={{ verticalAlign: -2 }} aria-hidden="true" /> 오늘 일일 보고{' '}
            <span className="muted-inline">· {now.getMonth() + 1}/{now.getDate()} ({WD[now.getDay()]})</span>
          </div>
          {autoClosed ? (
            <div className="row" style={{ gap: 8 }}>
              <span className="report-badge done"><i className="ti ti-lock" aria-hidden="true" /> 마감됨</span>
              <button className="btn ghost small" onClick={reopenToday}>
                <i className="ti ti-lock-open" aria-hidden="true" /> 마감 취소
              </button>
            </div>
          ) : (
            <button className="btn small" onClick={() => closeToday(todayLive, false)}>
              <i className="ti ti-checkbox" aria-hidden="true" /> 지금 마감
            </button>
          )}
        </div>

        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="kpi-label">총 방문</div><div className="kpi-val">{todayReport.total}</div></div>
          <div className="kpi"><div className="kpi-label">교실 복귀</div><div className="kpi-val">{o['교실 복귀']}</div></div>
          <div className="kpi"><div className="kpi-label">귀가</div><div className="kpi-val">{o['귀가']}</div></div>
          <div className={`kpi ${o['병원 이송'] ? 'warn' : ''}`}><div className="kpi-label">병원 이송</div><div className="kpi-val">{o['병원 이송']}</div></div>
        </div>

        <div className="report-line">
          <b>최다 계통</b> {todayReport.topCat} · <b>관찰</b> {o['관찰']}건
        </div>
        {todayReport.notable.length > 0 ? (
          <div className="alert-box" style={{ marginTop: 10 }}>
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <div>
              <div className="alert-title">특이사항</div>
              <div className="alert-sub">{todayReport.notable.join(' · ')}</div>
            </div>
          </div>
        ) : (
          <div className="dz-item ok" style={{ marginTop: 10 }}>
            <i className="ti ti-circle-check" aria-hidden="true" /> <span>특이사항 없음</span>
          </div>
        )}
        {!autoClosed && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            {pastEnd ? '업무 종료 시각이 지나 곧 자동 마감됩니다.' : `업무 종료(${BUSINESS_END_HOUR}:00) 시 현재 내용으로 자동 마감됩니다.`}
            {' '}수동 마감도 가능합니다.
          </p>
        )}
      </div>

      {/* 월간 일일 보고 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="sec-label">
            <i className="ti ti-calendar-month" style={{ verticalAlign: -2 }} aria-hidden="true" /> {now.getMonth() + 1}월 일일 보고{' '}
            <span className="muted-inline">· 운영 {opDays.length}일 · 총 {monthTotal.toLocaleString()}건</span>
          </div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>날짜</th><th>요일</th><th>총방문</th><th>교실복귀</th><th>귀가</th><th>병원</th><th>관찰</th><th>최다계통</th><th>특이사항</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const [, mm, dd] = r.date.split('-')
                if (!r.operating) {
                  return (
                    <tr key={r.date} className="off">
                      <td>{mm}/{dd}</td><td>{WD[r.weekdayIdx]}</td>
                      <td colSpan={7} className="off-cell">{r.holiday ?? '주말'} · 미운영</td>
                    </tr>
                  )
                }
                return (
                  <tr key={r.date} className={r.date === todayKey ? 'today' : ''}>
                    <td>{mm}/{dd}{r.date === todayKey ? ' ●' : ''}</td>
                    <td>{WD[r.weekdayIdx]}</td>
                    <td>{r.total}</td>
                    <td>{r.outcomes['교실 복귀']}</td>
                    <td>{r.outcomes['귀가']}</td>
                    <td className={r.outcomes['병원 이송'] ? 'hl' : ''}>{r.outcomes['병원 이송']}</td>
                    <td>{r.outcomes['관찰']}</td>
                    <td>{r.topCat}</td>
                    <td className="notable-cell">{r.notable.join('; ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          엑셀은 업로드한 <b>보건일지 양식</b>(주별 시트 · 일자별 응급처치 표 + 통계)으로 생성됩니다.
          병명을 여러 개 적으면 병명칸엔 모두 표시되고 <b>통계는 첫 번째 병명</b>으로 집계됩니다.
        </p>
      </div>
    </div>
  )
}
