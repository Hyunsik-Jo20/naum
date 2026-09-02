// 교직원 접수(콘솔 수동 전용) — 교직원 명부(담임 외 행 + 담임)에서 선택해 접수.
//  학생과 분리 집계(isStaff), 담임·학부모 알림 없음. 명부에 성별이 없으면 여기서 선택.
import { useState } from 'react'
import { symptomTiles } from '../data/mock'
import { staffRoster, teacherRoster } from '../data/teacherRoster'
import type { Sex, Staff } from '../types'

export default function StaffVisitModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (staff: Staff, sex: Sex, tileIds: string[], mode: 'wait' | 'treat') => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Staff | null>(null)
  const [sex, setSex] = useState<Sex | null>(null)
  const [tiles, setTiles] = useState<string[]>([])

  // 접수 후보 = 담임 외 교직원 + 담임(담임도 방문할 수 있음 — Staff 형태로 변환)
  const candidates: Staff[] = [
    ...staffRoster,
    ...teacherRoster.map((t) => ({
      id: `tch_${t.grade}-${t.classNo}`,
      name: t.name,
      role: `${t.grade}-${t.classNo} 담임`,
      phone: t.phone,
    })),
  ]

  const query = q.trim()
  const matches = query
    ? candidates.filter((s) => s.name.includes(query) || (s.role ?? '').includes(query)).slice(0, 8)
    : candidates.slice(0, 8)

  function toggle(id: string) {
    setTiles((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function pick(s: Staff) {
    setSel(s)
    setSex(s.sex ?? null)
  }

  const ready = sel && (sel.sex || sex)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-user-star" style={{ verticalAlign: -2 }} aria-hidden="true" /> 교직원 접수
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          교직원 방문은 학생 통계(교장 보고·보건일지)와 분리해 별도 집계됩니다. 담임·학부모 알림은 나가지 않습니다.
        </p>

        {candidates.length === 0 ? (
          <div className="col-empty">
            교직원 명부가 없습니다. <b>명부 관리 → 교직원 명부</b>에서 업로드하세요.
            (학년·반이 빈 행이 담임 외 교직원으로 등록됩니다)
          </div>
        ) : sel ? (
          <div className="picked-student">
            <span className="avatar">{sel.name[0]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{sel.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{sel.role ?? '교직원'}</div>
            </div>
            <button className="btn ghost small" onClick={() => { setSel(null); setSex(null) }}>
              <i className="ti ti-refresh" aria-hidden="true" /> 변경
            </button>
          </div>
        ) : (
          <>
            <input
              className="memo"
              autoFocus
              value={q}
              placeholder="이름 / 구분으로 검색 (예: 박교장, 행정)"
              onChange={(e) => setQ(e.target.value)}
            />
            {matches.length > 0 && (
              <div className="search-list">
                {matches.map((s) => (
                  <button key={s.id} className="search-item" onClick={() => pick(s)}>
                    <span className="si-name">{s.name}</span>
                    <span className="si-meta">{s.role ?? '교직원'}{s.sex ? ` · ${s.sex}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {query && matches.length === 0 && (
              <div className="col-empty" style={{ marginTop: 8 }}>검색 결과가 없어요.</div>
            )}
          </>
        )}

        {sel && !sel.sex && (
          <>
            <div className="sec-label" style={{ margin: '16px 0 8px' }}>
              성별 <span className="muted-inline">· 기록 필수(비식별 통계용)</span>
            </div>
            <div className="chips">
              {(['남', '여'] as Sex[]).map((s) => (
                <button key={s} className={`chip ${sex === s ? 'on' : ''}`} onClick={() => setSex(s)}>
                  {sex === s && <i className="ti ti-check" aria-hidden="true" />} {s}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sec-label" style={{ margin: '20px 0 8px' }}>
          증상 <span className="muted-inline">· 선택</span>
        </div>
        <div className="chips">
          {symptomTiles.map((t) => {
            const on = tiles.includes(t.id)
            return (
              <button key={t.id} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(t.id)}>
                {on && <i className="ti ti-check" aria-hidden="true" />}
                <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
              </button>
            )
          })}
        </div>

        <div className="row between" style={{ marginTop: 24, paddingTop: 18, borderTop: '0.5px solid var(--border)', gap: 10 }}>
          <button
            className="btn"
            disabled={!ready}
            onClick={() => sel && onSubmit(sel, (sel.sex ?? sex)!, tiles, 'wait')}
          >
            <i className="ti ti-hourglass" aria-hidden="true" /> 대기자로 추가
          </button>
          <button
            className="btn emergency"
            disabled={!ready}
            onClick={() => sel && onSubmit(sel, (sel.sex ?? sex)!, tiles, 'treat')}
          >
            <i className="ti ti-urgent" aria-hidden="true" /> 바로 처치 시작
          </button>
        </div>
      </div>
    </div>
  )
}
