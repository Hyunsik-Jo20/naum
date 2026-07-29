// 학부모 알림 발송 시점 설정창 — 실시간 / 하루 1회 / 하루 2회 / 매시 정각.
//  실시간 발신은 학부모가 학교에 즉시 민원 연락을 유발할 수 있어, 특정 시간에 모아 보내는
//  옵션을 제공. 설정은 이 기기(보건실 콘솔)에 저장. 담임 알림은 항상 실시간(무관).
import { useState } from 'react'
import { loadParentNotify, saveParentNotify, pendingCount, type ParentNotifyConfig, type ParentNotifyMode } from '../data/parentNotify'

const MODES: { id: ParentNotifyMode; label: string; desc: string }[] = [
  { id: 'realtime', label: '실시간', desc: '접수·종료 즉시 발신 (기본)' },
  { id: 'daily1', label: '하루 1회', desc: '지정한 시각에 하루치 모아 발신' },
  { id: 'daily2', label: '하루 2회', desc: '지정한 두 시각에 모아 발신' },
  { id: 'hourly', label: '매시 정각', desc: '매시간 정각에 그동안 쌓인 것 발신' },
]

export default function ParentNotifyModal({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<ParentNotifyConfig>(() => loadParentNotify())
  const pending = pendingCount()

  const setTime = (i: number, v: string) =>
    setCfg((c) => { const times = [...c.times]; times[i] = v; return { ...c, times } })

  function save() {
    saveParentNotify(cfg)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-bell-cog" style={{ verticalAlign: -2 }} aria-hidden="true" /> 학부모 알림 시점
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6 }}>
          실시간 알림은 학부모가 학교에 즉시 연락하게 만들 수 있어, <b>특정 시간에 모아</b> 보낼 수
          있습니다. 담임 알림은 이 설정과 무관하게 항상 실시간입니다.
        </p>

        <div className="col" style={{ gap: 8 }}>
          {MODES.map((m) => (
            <label key={m.id} className={`nt-mode ${cfg.mode === m.id ? 'on' : ''}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer' }}>
              <input type="radio" name="pn-mode" checked={cfg.mode === m.id} onChange={() => setCfg((c) => ({ ...c, mode: m.id }))} style={{ marginTop: 3 }} />
              <span>
                <b>{m.label}</b>
                <span className="muted" style={{ display: 'block', fontSize: 12 }}>{m.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {(cfg.mode === 'daily1' || cfg.mode === 'daily2') && (
          <div className="row" style={{ gap: 10, marginTop: 12 }}>
            <label className="login-field" style={{ flex: 1 }}>{cfg.mode === 'daily2' ? '1차 발송' : '발송 시각'}
              <input type="time" value={cfg.times[0] ?? '15:00'} onChange={(e) => setTime(0, e.target.value)} />
            </label>
            {cfg.mode === 'daily2' && (
              <label className="login-field" style={{ flex: 1 }}>2차 발송
                <input type="time" value={cfg.times[1] ?? '15:00'} onChange={(e) => setTime(1, e.target.value)} />
              </label>
            )}
          </div>
        )}

        {cfg.mode !== 'realtime' && (
          <p className="route-note" style={{ marginTop: 12 }}>
            <i className="ti ti-info-circle" aria-hidden="true" /> 모아 보내기는 <b>보건실 콘솔</b>이 발송합니다.
            지정 시각에 콘솔이 켜져 있어야 하며, 시각이 지난 뒤 콘솔을 열면 밀린 알림을 이어서 보냅니다.
            {pending > 0 && <> 현재 대기 <b>{pending}건</b>.</>}
          </p>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={save}><i className="ti ti-device-floppy" aria-hidden="true" /> 저장</button>
        </div>
      </div>
    </div>
  )
}
