// 시간대별(07~21시) 방문 분포 — 실제 접수 시각(createdAt) 집계(eduLive.buildHourly).
import { HOURLY_HOURS } from '../data/eduLive'

const COLOR = '#ba7517'

export default function HourlyChart({
  values,
  categoryLabel,
}: {
  values: number[] // 07~21시 실측 방문 수 — eduLive.buildHourly(현재 범위 rows)
  categoryLabel: string
}) {
  const max = Math.max(1, ...values)
  const total = values.reduce((a, b) => a + b, 0)

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-label" style={{ marginBottom: 10 }}>
        시간대별 방문 추이 <span className="muted-inline">· 07~21시 · {categoryLabel}</span>
      </div>
      {total === 0 ? (
        <div className="col-empty">현재 범위에 접수 데이터가 없어요.</div>
      ) : (
        <div className="vbars-wrap">
          <div className="vbars" style={{ height: 130 }}>
            {values.map((v, i) => (
              <div key={i} className="vbar-col">
                <span className="vbar-val">{v}</span>
                <div className="vbar" style={{ height: `${(v / max) * 100}%`, background: COLOR }} />
              </div>
            ))}
          </div>
          <div className="vbar-labels">
            {HOURLY_HOURS.map((h, i) => (
              <span key={i}>{i % 2 === 0 ? h : ''}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
