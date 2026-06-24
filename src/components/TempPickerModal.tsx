// 체온 선택 — 키보드 없이 터치만. 큰 ±는 0.3씩 점프(빠른 근접), 가운데 3개 연속값 칩으로 0.1 미세선택.
//  3칩(현재-0.1 / 현재 / 현재+0.1)이 항상 선택값을 중심으로 보이고, 양옆 칩 탭으로 0.1 조정.
import { useState } from 'react'

const MIN = 35.0
const MAX = 42.0
const r1 = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, r1(n)))

function band(t: number): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (t >= 38.0) return { label: t >= 39.0 ? '고열' : '발열', tone: 'danger' }
  if (t >= 37.5) return { label: '미열', tone: 'warning' }
  return { label: '정상', tone: 'success' }
}

export default function TempPickerModal({
  initial = 36.5,
  onConfirm,
  onClose,
}: {
  initial?: number
  onConfirm: (temp: number) => void
  onClose: () => void
}) {
  const [t, setT] = useState<number>(clamp(initial))
  const b = band(t)
  const lo = r1(t - 0.1)
  const hi = r1(t + 0.1)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-temperature" style={{ verticalAlign: -2 }} aria-hidden="true" /> 체온 측정
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        {/* 큰 값 표시 */}
        <div className={`temp-readout ${b.tone}`}>
          {t.toFixed(1)}<span className="temp-unit">℃</span>
          <span className={`wx-badge ${b.tone}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{b.label}</span>
        </div>

        {/* ±0.3 점프 + 3개 연속값(0.1) */}
        <div className="temp-row">
          <button className="temp-step" onClick={() => setT((v) => clamp(v - 0.3))} disabled={t <= MIN} aria-label="0.3 내림">−</button>
          <div className="temp-chips">
            <button className="temp-chip" onClick={() => setT(clamp(lo))} disabled={lo < MIN}>{lo.toFixed(1)}</button>
            <button className="temp-chip cur">{t.toFixed(1)}</button>
            <button className="temp-chip" onClick={() => setT(clamp(hi))} disabled={hi > MAX}>{hi.toFixed(1)}</button>
          </div>
          <button className="temp-step" onClick={() => setT((v) => clamp(v + 0.3))} disabled={t >= MAX} aria-label="0.3 올림">+</button>
        </div>
        <p className="muted" style={{ fontSize: 11, textAlign: 'center', margin: '8px 0 14px' }}>
          ± 는 0.3씩 이동 · 양옆 숫자를 누르면 0.1씩 미세조정
        </p>

        {b.tone === 'danger' && (
          <div className="infection-alert" style={{ marginBottom: 12 }}>
            <i className="ti ti-alert-triangle" aria-hidden="true" /> 발열 — 감염병 의심·격리·귀가/병원 이송을 고려하세요.
          </div>
        )}

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onConfirm(t)}>
          <i className="ti ti-check" aria-hidden="true" /> {t.toFixed(1)}℃ 입력
        </button>
      </div>
    </div>
  )
}
