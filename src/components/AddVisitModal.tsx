import { useState } from 'react'
import { classLabel, students, symptomTiles } from '../data/mock'
import type { Student } from '../types'

export default function AddVisitModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (student: Student, tileIds: string[], mode: 'wait' | 'treat') => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Student | null>(null)
  const [tiles, setTiles] = useState<string[]>([])

  const query = q.trim()
  const matches = query
    ? students
        .filter(
          (s) =>
            s.name.includes(query) ||
            classLabel(s).includes(query) ||
            String(s.number) === query,
        )
        .slice(0, 8)
    : []

  function toggle(id: string) {
    setTiles((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>직접 접수</h3>
          <button className="x" onClick={onClose} aria-label="닫기">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          학생이 직접 입력하기 어려울 때(저학년·응급 등) 보건교사가 대신 접수합니다.
        </p>

        {/* 학생 선택 */}
        <div className="sec-label" style={{ marginBottom: 8 }}>학생</div>
        {sel ? (
          <div className="picked-student">
            <span className="avatar">{sel.name[0]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{sel.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {classLabel(sel)} · {sel.number}번 · {sel.sex}
              </div>
            </div>
            <button className="btn ghost small" onClick={() => setSel(null)}>
              <i className="ti ti-refresh" aria-hidden="true" /> 변경
            </button>
          </div>
        ) : (
          <>
            <input
              className="memo"
              autoFocus
              value={q}
              placeholder="이름 / 학년-반 / 번호로 검색 (예: 김도현, 2-1, 15)"
              onChange={(e) => setQ(e.target.value)}
            />
            {matches.length > 0 && (
              <div className="search-list">
                {matches.map((s) => (
                  <button key={s.id} className="search-item" onClick={() => setSel(s)}>
                    <span className="si-name">{s.name}</span>
                    <span className="si-meta">{classLabel(s)} · {s.number}번 · {s.sex}</span>
                  </button>
                ))}
              </div>
            )}
            {query && matches.length === 0 && (
              <div className="col-empty" style={{ marginTop: 8 }}>검색 결과가 없어요.</div>
            )}
          </>
        )}

        {/* 증상 선택 (선택) */}
        <div className="sec-label" style={{ margin: '20px 0 8px' }}>
          증상 <span className="muted-inline">· 선택 (응급 시 비워도 됨)</span>
        </div>
        <div className="chips">
          {symptomTiles.map((t) => {
            const on = tiles.includes(t.id)
            return (
              <button
                key={t.id}
                className={`chip ${on ? 'on' : ''}`}
                onClick={() => toggle(t.id)}
              >
                {on && <i className="ti ti-check" aria-hidden="true" />}
                <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
              </button>
            )
          })}
        </div>

        {/* 진행 선택 */}
        <div className="row between" style={{ marginTop: 24, paddingTop: 18, borderTop: '0.5px solid var(--border)', gap: 10 }}>
          <button
            className="btn"
            disabled={!sel}
            onClick={() => sel && onSubmit(sel, tiles, 'wait')}
          >
            <i className="ti ti-hourglass" aria-hidden="true" /> 대기자로 추가
          </button>
          <button
            className="btn emergency"
            disabled={!sel}
            onClick={() => sel && onSubmit(sel, tiles, 'treat')}
          >
            <i className="ti ti-urgent" aria-hidden="true" /> 바로 처치 시작
          </button>
        </div>
      </div>
    </div>
  )
}
