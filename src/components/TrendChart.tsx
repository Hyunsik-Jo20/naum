// 일별 방문 추이 멀티라인 차트 (인라인 SVG). 날짜 클릭 시 선택 → 상위에서 통계 연동.
export interface TrendLine {
  name: string
  color: string
  values: number[]
  dashed?: boolean
}

export default function TrendChart({
  labels,
  lines,
  selected,
  onSelect,
}: {
  labels: string[]
  lines: TrendLine[]
  selected: number | null
  onSelect: (i: number) => void
}) {
  const n = labels.length
  if (n === 0 || lines.length === 0) return <div className="col-empty">표시할 데이터가 없어요.</div>

  // 미운영일(값 0)은 전일·다음일 보간으로 선을 부드럽게 (실제값은 0 유지)
  const interp = (vals: number[]): number[] => {
    const out = [...vals]
    for (let i = 0; i < out.length; i++) {
      if (vals[i] !== 0) continue
      let j = i - 1
      while (j >= 0 && vals[j] === 0) j--
      let k = i + 1
      while (k < vals.length && vals[k] === 0) k++
      const pv = j >= 0 ? vals[j] : null
      const nv = k < vals.length ? vals[k] : null
      if (pv != null && nv != null) out[i] = Math.round(pv + (nv - pv) * ((i - j) / (k - j)))
      else if (pv != null) out[i] = pv
      else if (nv != null) out[i] = nv
    }
    return out
  }
  const display = lines.map((l) => interp(l.values))

  const max = Math.max(1, ...display.flat())
  const W = 680, H = 200, padL = 36, padR = 12, padT = 14, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const step = innerW / Math.max(1, n - 1)
  const tick = Math.max(1, Math.ceil(n / 8))
  const primary = lines[0]

  return (
    <div>
      <div className="trend-legend">
        {lines.map((l) => (
          <span key={l.name}>
            <span
              className="tl-swatch"
              style={{ background: l.color, ...(l.dashed ? { opacity: 0.6 } : {}) }}
            />
            {l.name}
          </span>
        ))}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="월간 방문 추이">
        <title>이번 달 / 전월 / 전년 동월 방문 추이</title>
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--border)" strokeWidth="1" />
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--border)" strokeWidth="1" />

        {lines.map((l, li) => (
          <polyline
            key={l.name}
            points={display[li].map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={l.color}
            strokeWidth={l.dashed ? 1.5 : 2}
            strokeDasharray={l.dashed ? '5 4' : undefined}
            opacity={l.dashed ? 0.85 : 1}
          />
        ))}

        {/* 선택/클릭 영역 (이번 달 기준) */}
        {primary.values.map((actual, i) => {
          const isOff = actual === 0 // 미운영일
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => onSelect(i)}>
              <rect x={x(i) - step / 2} y={padT} width={step} height={innerH} fill="transparent" />
              {selected === i && (
                <>
                  <rect x={x(i) - step / 2} y={padT} width={step} height={innerH} fill="rgba(24,95,165,0.10)" />
                  <circle cx={x(i)} cy={y(display[0][i])} r="4.5" fill={isOff ? 'var(--text-3)' : primary.color} />
                  <text x={x(i)} y={y(display[0][i]) - 8} fontSize="11" fill={isOff ? 'var(--text-3)' : primary.color} textAnchor="middle" fontWeight="600">
                    {isOff ? '미운영 0' : actual}
                  </text>
                </>
              )}
            </g>
          )
        })}

        <text x={padL - 6} y={padT + 4} fontSize="11" fill="var(--text-3)" textAnchor="end">{max}</text>
        <text x={padL - 6} y={padT + innerH} fontSize="11" fill="var(--text-3)" textAnchor="end">0</text>
        {labels.map((d, i) =>
          i % tick === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} fontSize="10" fill="var(--text-3)" textAnchor="middle">
              {d}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}
