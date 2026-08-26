// 학교 상세 드릴다운 — 해당 학교의 실제 방문(rows)으로 월간 추이·계통 분포 계산.
import { useMemo, useState } from 'react'
import { DISEASE_CATEGORIES } from '../data/mock'
import { buildMonthlyReal, type EduSchoolStats, type EduVisitRow } from '../data/eduLive'
import TrendChart from './TrendChart'
import WeatherBar from './WeatherBar'

export default function SchoolDetail({
  school,
  rows,
  onClose,
}: {
  school: EduSchoolStats
  rows: EduVisitRow[] // 이 학교의 최근 90일 방문(비식별)
  onClose: () => void
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const monthly = useMemo(() => buildMonthlyReal(rows), [rows])

  // 이번 달 누계 계통 분포(실측)
  const monthCat = monthly.cur.reduce(
    (acc, day) => acc.map((v, i) => v + day[i]),
    new Array(12).fill(0) as number[],
  )
  const total = monthCat.reduce((a, b) => a + b, 0)
  const topCat = total > 0 ? DISEASE_CATEGORIES[monthCat.indexOf(Math.max(...monthCat))] : '-'
  const bars = DISEASE_CATEGORIES.map((c, i) => ({ c, n: monthCat[i] }))
    .filter((b) => b.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
  const barMax = Math.max(1, ...bars.map((b) => b.n))

  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const curLine = monthly.cur.map(sum)
  const prevLine = monthly.prev.map(sum)
  const lyLine = monthly.lastYear.map(sum)
  const hasPrev = sum(prevLine) > 0
  const hasLy = sum(lyLine) > 0
  const moM = hasPrev ? Math.round((sum(curLine) / sum(prevLine) - 1) * 100) : null
  const yoY = hasLy ? Math.round((sum(curLine) / sum(lyLine) - 1) * 100) : null

  const lines = [
    { name: '이번 달', color: '#185fa5', values: curLine },
    ...(hasPrev ? [{ name: '전월', color: '#888780', values: prevLine, dashed: true }] : []),
    ...(hasLy ? [{ name: '전년 동월', color: '#0f6e56', values: lyLine, dashed: true }] : []),
  ]

  return (
    <div className="card school-detail" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {school.name}{' '}
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 400 }}>
              · {school.region} · {school.level}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>학교 상세 (이번 달 · 실제 접수 기준)</div>
        </div>
        <button className="x" onClick={onClose} aria-label="닫기">
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>

      {school.anomaly && (
        <div className="alert-box" style={{ marginBottom: 14 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <div>
            <div className="alert-title">이상 신호</div>
            <div className="alert-sub">{school.anomaly} — 감염병 확인 권고</div>
          </div>
        </div>
      )}

      {/* 학교 날씨 (좌표 기준) */}
      <WeatherBar lat={school.lat} lon={school.lon} label={`${school.name} · ${school.region}`} />

      {/* 요약 */}
      <div className="kpi-grid" style={{ marginTop: 4, marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-label">이번 달 누계 방문</div>
          <div className="kpi-val">{total.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">최다 계통</div>
          <div className="kpi-val sm">{topCat}</div>
        </div>
        <div className={`kpi ${moM != null && moM >= 0 ? 'warn' : ''}`}>
          <div className="kpi-label">전월 대비</div>
          <div className="kpi-val">{moM == null ? '—' : `${moM >= 0 ? '+' : ''}${moM}%`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">전년 동월 대비</div>
          <div className="kpi-val">{yoY == null ? '—' : `${yoY >= 0 ? '+' : ''}${yoY}%`}</div>
        </div>
      </div>

      {/* 방문 추이 */}
      <div className="sec-label" style={{ marginBottom: 6 }}>
        방문 추이{' '}
        <span className="muted-inline">
          · 이번 달{hasPrev ? '/전월' : ''}{hasLy ? '/전년 동월' : ''}{!hasLy ? ' · 전년 데이터 없음' : ''}
        </span>
      </div>
      {total === 0 && !hasPrev ? (
        <div className="col-empty">접수 데이터가 없어요.</div>
      ) : (
        <TrendChart
          labels={monthly.labels}
          lines={lines}
          selected={selectedDay}
          onSelect={(i) => setSelectedDay((prev) => (prev === i ? null : i))}
        />
      )}

      {/* 계통 분포 */}
      <div className="sec-label" style={{ margin: '12px 0 10px' }}>병명 계통별 분포</div>
      {bars.length === 0 ? (
        <div className="col-empty">집계된 방문이 없어요.</div>
      ) : (
        <div className="bars">
          {bars.map((b) => (
            <div key={b.c} className="bar-row">
              <span className="bar-label">{b.c}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(b.n / barMax) * 100}%` }} />
              </span>
              <span className="bar-val">{b.n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
