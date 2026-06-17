import { useState } from 'react'
import { EDU_LEVELS, EDU_REGIONS } from '../data/eduMock'
import type { Thresholds } from '../data/disasters'
import { AUTO_TRIGGERS, useNotices } from '../store/notices'
import { ensurePushPermission, pushPermission } from '../push'

export default function AutoNoticeSettings({ onClose }: { onClose: () => void }) {
  const { rules, setRule, thresholds, setThreshold } = useNotices()
  const [perm, setPerm] = useState(pushPermission())

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>자동 공지 설정</h3>
          <button className="x" onClick={onClose} aria-label="닫기">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          켜둔 경보가 발생하면 해당 대상 학교로 <strong>자동으로 긴급 공지</strong>가 발송됩니다. (같은 경보는 하루 1회)
        </p>

        <div className="row between" style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--border-radius-md)' }}>
          <span style={{ fontSize: 13 }}>
            <i className="ti ti-bell" style={{ verticalAlign: -2 }} aria-hidden="true" /> 기기 앱 푸시:{' '}
            <strong style={{ color: perm === 'granted' ? 'var(--success)' : 'var(--text-2)' }}>
              {perm === 'granted' ? '허용됨' : perm === 'denied' ? '차단됨(브라우저 설정에서 허용)' : perm === 'unsupported' ? '미지원' : '미설정'}
            </strong>
          </span>
          {perm !== 'granted' && perm !== 'unsupported' && (
            <button className="btn small" onClick={async () => { await ensurePushPermission(); setPerm(pushPermission()) }}>
              알림 허용
            </button>
          )}
        </div>

        <div className="rule-list">
          {AUTO_TRIGGERS.map((t) => {
            const r = rules[t.title]
            return (
              <div key={t.title} className={`rule-row ${r.enabled ? 'on' : ''}`}>
                <label className="rule-toggle">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => setRule(t.title, { enabled: e.target.checked })}
                  />
                  <span className={`dz-dot ${t.sev}`} />
                  <span className="rule-title">{t.title}</span>
                </label>
                <div className="rule-th">
                  <span className="rule-th-lbl">기준</span>
                  <input
                    type="number"
                    className="th-input"
                    value={thresholds[t.thKey as keyof Thresholds]}
                    onChange={(e) => setThreshold(t.thKey as keyof Thresholds, Number(e.target.value))}
                  />
                  <span className="rule-th-unit">{t.unit} {t.cmp}</span>
                </div>
                <div className="rule-targets" style={{ opacity: r.enabled ? 1 : 0.4 }}>
                  <select
                    value={r.region}
                    disabled={!r.enabled}
                    onChange={(e) => setRule(t.title, { region: e.target.value })}
                  >
                    <option>전체</option>
                    {EDU_REGIONS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <select
                    value={r.level}
                    disabled={!r.enabled}
                    onChange={(e) => setRule(t.title, { level: e.target.value })}
                  >
                    <option>전체</option>
                    {EDU_LEVELS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
          <i className="ti ti-info-circle" style={{ verticalAlign: -2 }} aria-hidden="true" /> 태풍·지진·홍수 등 공식 특보는 연동 승인 후 이 목록에 자동 추가됩니다. 설정은 이 브라우저에 저장됩니다.
        </p>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn primary" style={{ fontSize: 15, padding: '10px 20px' }} onClick={onClose}>
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
