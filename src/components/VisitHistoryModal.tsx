// 학생 전체 방문 기록 — 처치 화면에서 이름을 클릭하면 열린다.
//  각 방문의 날짜·시각, 증상, 병명, 처치, 결과, 활력징후를 모두 보여준다(실제 종료 방문만).
export interface VisitHistoryEntry {
  id: string
  when: number
  symptoms: string[]
  diseases: string[]
  treatments: string[]
  outcome?: string
  vitalsText?: string
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts)
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const wk = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${mm}/${dd}(${wk}) ${h}:${m}`
}

export default function VisitHistoryModal({
  name,
  entries,
  onClose,
}: {
  name: string
  entries: VisitHistoryEntry[]
  onClose: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-history" style={{ verticalAlign: -2 }} aria-hidden="true" /> {name} · 방문 기록
            <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 400 }}> {entries.length}건</span>
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        {entries.length === 0 ? (
          <p className="muted" style={{ margin: '12px 0', fontSize: 14 }}>
            이전 방문 기록이 없습니다.
          </p>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map((e) => (
              <div key={e.id} className="card" style={{ padding: 12, margin: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                  <i className="ti ti-calendar-event" style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" />
                  {fmtDateTime(e.when)}
                  {e.outcome && (
                    <span className="pill" style={{ marginLeft: 8, verticalAlign: 1, fontSize: 12 }}>{e.outcome}</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: '4px 10px', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-2)' }}>증상</span>
                  <span>{e.symptoms.length ? e.symptoms.join(', ') : '—'}</span>
                  {e.diseases.length > 0 && (<>
                    <span style={{ color: 'var(--text-2)' }}>병명</span>
                    <span>{e.diseases.join(', ')}</span>
                  </>)}
                  <span style={{ color: 'var(--text-2)' }}>처치</span>
                  <span>{e.treatments.length ? e.treatments.join(', ') : '—'}</span>
                  {e.vitalsText && (<>
                    <span style={{ color: 'var(--text-2)' }}>활력</span>
                    <span>{e.vitalsText}</span>
                  </>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
