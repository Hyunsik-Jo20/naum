// 활력징후 항목 편집 — 항목 추가·삭제·순서와 정상 참고범위 조정 (요청 2026-09-22).
//  연령대·학교급마다 기준이 달라 학교가 직접 정할 수 있어야 한다.
//  저장은 이 기기 + 클라우드(school_settings.vitals) → 다른 기기도 다음 실행에 반영.
import { useState } from 'react'
import { DEFAULT_VITAL_ITEMS, restoreDefaultVitalItems, saveVitalItems, vitalItems } from '../data/vitals'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import { saveCloudVitalItems } from '../api/supabaseBackend'
import type { VitalItem } from '../types'

const numOr = (s: string, d?: number): number | undefined => {
  const t = s.trim()
  if (!t) return d
  const n = Number(t)
  return Number.isFinite(n) ? n : d
}

export default function VitalsEditModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<VitalItem[]>(() => vitalItems.map((v) => ({ ...v })))
  const [label, setLabel] = useState('')
  const [unit, setUnit] = useState('')

  function patch(i: number, p: Partial<VitalItem>) {
    setItems((prev) => prev.map((v, k) => (k === i ? { ...v, ...p } : v)))
  }
  function move(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const to = i + dir
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[to]] = [next[to], next[i]]
      return next
    })
  }
  function remove(i: number) {
    if (!confirm(`"${items[i].label}" 항목을 지울까요? (이미 기록된 값은 남습니다)`)) return
    setItems((prev) => prev.filter((_, k) => k !== i))
  }
  function add() {
    const l = label.trim()
    if (!l) return
    if (items.some((v) => v.label === l)) { alert('같은 이름의 항목이 이미 있어요.'); return }
    setItems((prev) => [...prev, {
      id: `v_${Date.now().toString(36)}`,
      label: l, unit: unit.trim(), type: 'number', decimals: 0,
      hardMin: 0, hardMax: 1000,
    }])
    setLabel(''); setUnit('')
  }

  async function save() {
    if (items.length === 0) { alert('항목이 최소 1개는 필요해요.'); return }
    saveVitalItems(items)
    let ok = true
    if (SUPABASE_ENABLED) {
      try { await saveCloudVitalItems(items) } catch { ok = false }
    }
    alert(ok
      ? '활력징후 항목을 저장했습니다. 다른 기기에도 곧 반영돼요. 화면을 새로고침합니다.'
      : '이 기기에는 저장됐지만 클라우드 동기화에 실패했어요. 네트워크 확인 후 다시 저장해 주세요.')
    window.location.reload()
  }

  async function restore() {
    if (!confirm('기본 5개 항목(체온·혈압·맥박·호흡수·산소포화도)으로 되돌릴까요?')) return
    restoreDefaultVitalItems()
    if (SUPABASE_ENABLED) { try { await saveCloudVitalItems(DEFAULT_VITAL_ITEMS) } catch { /* ignore */ } }
    window.location.reload()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-heartbeat" style={{ verticalAlign: -2 }} aria-hidden="true" /> 활력징후 항목 편집
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
          <b>정상범위</b>를 벗어난 값은 입력할 때 빨갛게 표시됩니다. 연령대·학교급에 따라 기준이 다르니
          우리 학교에 맞게 조정해 주세요. <span className="muted-inline">(확인용 표시일 뿐 진단 기준이 아닙니다)</span>
        </p>

        <div className="report-table-wrap" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>항목</th><th>단위</th><th>정상범위</th><th style={{ width: 96 }}>순서·삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v, i) => (
                <tr key={v.id}>
                  <td>
                    <input value={v.label} style={{ width: 92 }}
                      onChange={(e) => patch(i, { label: e.target.value })} />
                  </td>
                  <td>
                    <input value={v.unit} style={{ width: 62 }}
                      onChange={(e) => patch(i, { unit: e.target.value })} />
                  </td>
                  <td>
                    <span className="vit-range">
                      <input inputMode="decimal" value={v.low ?? ''} style={{ width: 56 }}
                        onChange={(e) => patch(i, { low: numOr(e.target.value) })} />
                      <span>~</span>
                      <input inputMode="decimal" value={v.high ?? ''} style={{ width: 56 }}
                        onChange={(e) => patch(i, { high: numOr(e.target.value) })} />
                      {v.type === 'pair' && (
                        <>
                          <span className="muted-inline">/</span>
                          <input inputMode="decimal" value={v.low2 ?? ''} style={{ width: 56 }}
                            onChange={(e) => patch(i, { low2: numOr(e.target.value) })} />
                          <span>~</span>
                          <input inputMode="decimal" value={v.high2 ?? ''} style={{ width: 56 }}
                            onChange={(e) => patch(i, { high2: numOr(e.target.value) })} />
                        </>
                      )}
                    </span>
                  </td>
                  <td>
                    <button className="x" onClick={() => move(i, -1)} disabled={i === 0} title="위로">
                      <i className="ti ti-chevron-up" aria-hidden="true" />
                    </button>
                    <button className="x" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="아래로">
                      <i className="ti ti-chevron-down" aria-hidden="true" />
                    </button>
                    <button className="x" onClick={() => remove(i)} title="삭제">
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sec-label" style={{ margin: '14px 0 6px' }}>항목 추가</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="login-field" style={{ flex: 2, minWidth: 130 }}>항목 이름
            <input value={label} placeholder="예: 혈당" onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()} />
          </label>
          <label className="login-field" style={{ flex: 1, minWidth: 90 }}>단위
            <input value={unit} placeholder="예: mg/dL" onChange={(e) => setUnit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()} />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={add}>
            <i className="ti ti-plus" aria-hidden="true" /> 추가
          </button>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
          <button className="btn ghost" onClick={() => void restore()}>
            <i className="ti ti-rotate" aria-hidden="true" /> 기본값 복원
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>취소</button>
            <button className="btn primary" onClick={() => void save()}>
              <i className="ti ti-device-floppy" aria-hidden="true" /> 저장(새로고침)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
