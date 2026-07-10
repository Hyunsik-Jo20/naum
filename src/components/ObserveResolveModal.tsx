// 관찰 종료 — 결과 선택. 관찰은 "결과"가 아니라 임시 보류 상태이므로,
//  관찰이 끝나면 재평가해 실제 결과(교실 복귀 / 귀가 / 병원 이송)로 확정하거나 관찰을 연장한다.
//  선택한 결과로 completeVisit → 담임·학부모에 결과별 알림 발송(교실복귀/귀가/병원).
import type { Outcome } from '../types'

const CHOICES: { outcome: Outcome; icon: string; tone: string; label: string; desc: string }[] = [
  { outcome: '교실 복귀', icon: 'ti-school', tone: 'success', label: '교실 복귀', desc: '호전되어 교실로 돌아갑니다' },
  { outcome: '귀가', icon: 'ti-home', tone: 'warning', label: '귀가', desc: '집에서 쉬어야 합니다 (보호자 인계)' },
  { outcome: '병원 이송', icon: 'ti-ambulance', tone: 'danger', label: '병원 이송', desc: '병원 진료가 필요합니다' },
]

export default function ObserveResolveModal({
  name,
  onResolve,
  onExtend,
  onClose,
}: {
  name: string
  onResolve: (outcome: Outcome) => void
  onExtend: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-eye-check" style={{ verticalAlign: -2 }} aria-hidden="true" /> 관찰 종료 · 결과 선택
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6 }}>
          <b>{name}</b> 학생의 관찰이 끝났습니다. 상태를 재평가해 결과를 선택하세요. 선택한 결과로 담임·학부모에게 안내가 발송됩니다.
        </p>

        <div className="obs-resolve">
          {CHOICES.map((c) => (
            <button key={c.outcome} className={`obs-resolve-btn ${c.tone}`} onClick={() => onResolve(c.outcome)}>
              <i className={`ti ${c.icon}`} aria-hidden="true" />
              <span className="orb-label">{c.label}</span>
              <span className="orb-desc">{c.desc}</span>
            </button>
          ))}
          <button className="obs-resolve-btn neutral" onClick={onExtend}>
            <i className="ti ti-clock-plus" aria-hidden="true" />
            <span className="orb-label">관찰 연장</span>
            <span className="orb-desc">조금 더 지켜봅니다 (시간 재설정)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
