// 업데이트 안내 모달 — 새 버전 첫 진입(로그인/시작) 시 1회 표시. 확인하면 버전 저장.
import { useState } from 'react'
import { UPDATE_TITLE, UPDATE_VERSION, UPDATE_ITEMS, shouldShowUpdate, markUpdateSeen } from '../data/updates'

export default function UpdateNoticeModal() {
  const [open, setOpen] = useState(() => shouldShowUpdate())
  if (!open) return null
  const close = () => { markUpdateSeen(); setOpen(false) }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-sparkles" style={{ verticalAlign: -2, marginRight: 4, color: 'var(--accent, #2563eb)' }} aria-hidden="true" />
            {UPDATE_TITLE}
            <span className="muted-inline" style={{ fontSize: 13, fontWeight: 400 }}> · {UPDATE_VERSION}</span>
          </h3>
          <button className="x" onClick={close} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>이번에 새로 추가되거나 바뀐 기능이에요.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
          {UPDATE_ITEMS.map((u, i) => (
            <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <span style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: 8, background: 'rgba(37,99,235,.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${u.icon}`} style={{ color: 'var(--accent, #2563eb)' }} aria-hidden="true" />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{u.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{u.text}</div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={close}>
          <i className="ti ti-check" aria-hidden="true" /> 확인
        </button>
      </div>
    </div>
  )
}
