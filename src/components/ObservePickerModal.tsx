// 관찰 시간 선택 — 키보드 없이 10분 단위 칩으로 보건실 관찰 시간을 고른다.
//  확인 시 분(min) 반환. 관찰 종료 예정 시각도 미리 보여준다.
import { useState } from 'react'

const OPTIONS = [10, 20, 30, 40, 50, 60]

function endLabel(min: number): string {
  const d = new Date(Date.now() + min * 60000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ObservePickerModal({
  initialMin = 30,
  onConfirm,
  onClose,
}: {
  initialMin?: number
  onConfirm: (min: number) => void
  onClose: () => void
}) {
  const [min, setMin] = useState(OPTIONS.includes(initialMin) ? initialMin : 30)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-eye" style={{ verticalAlign: -2 }} aria-hidden="true" /> 관찰 시간
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
          보건실에서 학생을 얼마나 관찰할지 선택하세요. 시간이 끝나면 완료 패널에서 알려드립니다.
        </p>

        <div className="obs-chips">
          {OPTIONS.map((m) => (
            <button key={m} className={`obs-chip ${min === m ? 'on' : ''}`} onClick={() => setMin(m)}>
              {m}분
            </button>
          ))}
        </div>

        <div className="obs-end">예상 종료 <b>{endLabel(min)}</b></div>

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => onConfirm(min)}>
          <i className="ti ti-check" aria-hidden="true" /> {min}분 관찰 시작
        </button>
      </div>
    </div>
  )
}
