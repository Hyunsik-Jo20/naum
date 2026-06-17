// 시간대 07~21시 방문 분포 가중치(보건실 운영 패턴 데모)
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
const WEIGHT = [0.2, 0.5, 1.0, 1.3, 1.2, 0.7, 1.1, 1.3, 1.0, 0.7, 0.4, 0.2, 0.15, 0.1, 0.05]
const COLOR = '#ba7517'

export default function HourlyChart({
  total,
  categoryLabel,
}: {
  total: number // 현재 범위(기간·선택일·계통) 총 방문 — 방문 추이와 동일 집계
  categoryLabel: string
}) {
  const sumW = WEIGHT.reduce((a, b) => a + b, 0)
  const vals = WEIGHT.map((w) => Math.round((total * w) / sumW))
  const max = Math.max(1, ...vals)

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-label" style={{ marginBottom: 10 }}>
        시간대별 방문 추이 <span className="muted-inline">· 07~21시 · {categoryLabel}</span>
      </div>
      <div className="vbars-wrap">
        <div className="vbars" style={{ height: 130 }}>
          {vals.map((v, i) => (
            <div key={i} className="vbar-col">
              <span className="vbar-val">{v}</span>
              <div className="vbar" style={{ height: `${(v / max) * 100}%`, background: COLOR }} />
            </div>
          ))}
        </div>
        <div className="vbar-labels">
          {HOURS.map((h, i) => (
            <span key={i}>{i % 2 === 0 ? h : ''}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
