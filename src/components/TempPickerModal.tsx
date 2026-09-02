// 체온 입력 — 두 방식 지원(현장 요청): ① 터치 선택(± 점프 + 0.1 미세) ② 직접 입력(키보드 수기).
//  방식은 상단 토글로 전환하며 기기별로 저장되어 다음부터 선택한 방식이 기본으로 열린다.
import { useState } from 'react'

const MIN = 35.0
const MAX = 42.0
// 직접 입력은 실측 예외(저체온·고열계 오류 확인 등)를 허용해 범위를 넓게 받는다.
const TYPE_MIN = 30.0
const TYPE_MAX = 43.9
const r1 = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, r1(n)))

function band(t: number): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (t >= 38.0) return { label: t >= 39.0 ? '고열' : '발열', tone: 'danger' }
  if (t >= 37.5) return { label: '미열', tone: 'warning' }
  return { label: '정상', tone: 'success' }
}

type InputMode = 'touch' | 'type'
const LS_MODE = 'naum.temp.inputMode'
function loadMode(): InputMode {
  try {
    return localStorage.getItem(LS_MODE) === 'type' ? 'type' : 'touch'
  } catch {
    return 'touch'
  }
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
  const [mode, setMode] = useState<InputMode>(loadMode)
  const [t, setT] = useState<number>(clamp(initial))
  const [typed, setTyped] = useState('')

  function switchMode(m: InputMode) {
    setMode(m)
    try { localStorage.setItem(LS_MODE, m) } catch { /* ignore */ }
  }

  // 직접 입력 해석 — 쉼표 허용("37,2"), 0.1 반올림, 실측 범위 검사
  const typedNum = typed.trim() ? Number(typed.trim().replace(',', '.')) : NaN
  const typedVal = Number.isFinite(typedNum) ? r1(typedNum) : null
  const typedOk = typedVal != null && typedVal >= TYPE_MIN && typedVal <= TYPE_MAX

  const cur = mode === 'type' ? (typedOk ? typedVal! : null) : t
  const b = cur != null ? band(cur) : null
  const lo = r1(t - 0.1)
  const hi = r1(t + 0.1)

  function confirm() {
    if (mode === 'type') {
      if (typedOk) onConfirm(typedVal!)
    } else {
      onConfirm(t)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-temperature" style={{ verticalAlign: -2 }} aria-hidden="true" /> 체온 측정
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        {/* 입력 방식 설정 — 선택이 기기에 저장되어 다음부터 기본으로 열림 */}
        <div className="chips" style={{ marginBottom: 12 }}>
          <button className={`chip ${mode === 'touch' ? 'on' : ''}`} onClick={() => switchMode('touch')}>
            {mode === 'touch' && <i className="ti ti-check" aria-hidden="true" />} 터치 선택
          </button>
          <button className={`chip ${mode === 'type' ? 'on' : ''}`} onClick={() => switchMode('type')}>
            {mode === 'type' && <i className="ti ti-check" aria-hidden="true" />} 직접 입력(키보드)
          </button>
        </div>

        {/* 큰 값 표시 */}
        <div className={`temp-readout ${b?.tone ?? ''}`}>
          {cur != null ? cur.toFixed(1) : '—'}<span className="temp-unit">℃</span>
          {b && (
            <span className={`wx-badge ${b.tone}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{b.label}</span>
          )}
        </div>

        {mode === 'type' ? (
          <>
            <input
              className="memo"
              autoFocus
              inputMode="decimal"
              value={typed}
              placeholder="체온을 입력하세요 (예: 37.2)"
              style={{ textAlign: 'center', fontSize: 22, fontWeight: 600, marginBottom: 6 }}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
            />
            <p className="muted" style={{ fontSize: 11, textAlign: 'center', margin: '0 0 14px' }}>
              {typed.trim() && !typedOk
                ? `숫자(${TYPE_MIN}~${TYPE_MAX})로 입력해 주세요`
                : 'Enter 또는 아래 버튼으로 입력 · 0.1 단위로 기록됩니다'}
            </p>
          </>
        ) : (
          <>
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
          </>
        )}

        {b?.tone === 'danger' && (
          <div className="infection-alert" style={{ marginBottom: 12 }}>
            <i className="ti ti-alert-triangle" aria-hidden="true" /> 발열 — 감염병 의심·격리·귀가/병원 이송을 고려하세요.
          </div>
        )}

        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={mode === 'type' && !typedOk}
          onClick={confirm}
        >
          <i className="ti ti-check" aria-hidden="true" /> {cur != null ? `${cur.toFixed(1)}℃ 입력` : '체온 입력'}
        </button>
      </div>
    </div>
  )
}
