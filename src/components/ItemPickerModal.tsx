// 범용 선택 팝업 — 처치 "투약"(의약품)·"위생용품·비품" 등에서 항목을 고른다. 목록도 이 창에서 편집.
//  선택 결과는 "투약 (타이레놀, 지사제)"처럼 "<처치> (항목…)" 형태로 저장(부위 처치와 동일 파싱).
//  목록은 load/save(각 항목의 localStorage 모듈)로 이 기기에 저장.
import { useState } from 'react'

export default function ItemPickerModal({
  title,
  icon,
  hint,
  addPlaceholder,
  removeLabel,
  initial,
  load,
  save,
  onConfirm,
  onRemove,
  onClose,
}: {
  title: string
  icon: string
  hint: string
  addPlaceholder: string
  removeLabel: string
  initial: string[]
  load: () => string[]
  save: (list: string[]) => void
  onConfirm: (items: string[]) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [items, setItems] = useState<string[]>(() => load())
  const [selected, setSelected] = useState<string[]>(initial)
  const [editing, setEditing] = useState(false)
  const [newItem, setNewItem] = useState('')

  const toggle = (m: string) =>
    setSelected((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))

  function addItem() {
    const m = newItem.trim()
    if (!m) return
    if (!items.includes(m)) {
      const next = [...items, m]
      setItems(next)
      save(next)
    }
    setNewItem('')
  }
  function removeItem(m: string) {
    const next = items.filter((x) => x !== m)
    setItems(next)
    save(next)
    setSelected((p) => p.filter((x) => x !== m))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className={`ti ${icon}`} style={{ verticalAlign: -2 }} aria-hidden="true" /> {title}
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6 }}>{hint}</p>

        <div className="chips" style={{ marginBottom: 12 }}>
          {items.length === 0 && <span className="col-empty">목록이 비어 있어요. 아래에서 추가하세요.</span>}
          {items.map((m) => {
            const on = selected.includes(m)
            return (
              <button key={m} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(m)}>
                {on && <i className="ti ti-check" aria-hidden="true" />} {m}
              </button>
            )
          })}
        </div>

        <button className="btn ghost small" style={{ marginBottom: editing ? 10 : 0 }} onClick={() => setEditing((v) => !v)}>
          <i className={`ti ${editing ? 'ti-chevron-up' : 'ti-settings'}`} aria-hidden="true" /> 목록 편집
        </button>

        {editing && (
          <div className="card" style={{ padding: 12, marginBottom: 4 }}>
            <div className="treat-add-row" style={{ marginBottom: 8 }}>
              <input
                autoFocus
                value={newItem}
                placeholder={addPlaceholder}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
              />
              <button className="btn small" onClick={addItem}>추가</button>
            </div>
            <div className="chips">
              {items.map((m) => (
                <span key={m} className="chip plain">
                  {m}
                  <button className="x" style={{ marginLeft: 6 }} onClick={() => removeItem(m)} title={`${m} 삭제`}>
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
          <button className="btn ghost" onClick={onRemove}><i className="ti ti-trash" aria-hidden="true" /> {removeLabel}</button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>취소</button>
            <button className="btn primary" onClick={() => onConfirm(selected)}>
              <i className="ti ti-check" aria-hidden="true" /> 확인{selected.length ? ` (${selected.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
