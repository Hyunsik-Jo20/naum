// 증상 타일 편집(보건교사) — 키오스크·직접접수·교사 요청에 쓰이는 증상 목록을 학교에 맞게 조정.
//  이 브라우저(localStorage)에 저장, 적용 시 새로고침(명부와 동일 패턴). 계통은 통계 집계에 쓰인다.
import { useState } from 'react'
import { DEFAULT_SYMPTOM_TILES, DISEASE_CATEGORIES, symptomTiles } from '../data/mock'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import { saveCloudSymptoms } from '../api/supabaseBackend'
import type { DiseaseCategory, SymptomTile } from '../types'

const LS = 'naum.symptoms'

export default function SymptomEditModal({ onClose }: { onClose: () => void }) {
  const [tiles, setTiles] = useState<SymptomTile[]>(() => symptomTiles.map((t) => ({ ...t })))
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<DiseaseCategory>('기타')
  const [disease, setDisease] = useState('')

  function add() {
    const l = label.trim()
    if (!l) return
    if (tiles.some((t) => t.label === l)) { alert('같은 이름의 증상이 이미 있어요.'); return }
    setTiles((p) => {
      const next: SymptomTile = {
        id: `c_${Date.now().toString(36)}`,
        label: l,
        icon: 'ti-medical-cross',
        category,
        disease: disease.trim() || l,
      }
      // "잘 모르겠어요"(unknown)는 항상 마지막 유지
      const idx = p.findIndex((t) => t.id === 'unknown')
      return idx >= 0 ? [...p.slice(0, idx), next, ...p.slice(idx)] : [...p, next]
    })
    setLabel('')
    setDisease('')
  }

  function remove(id: string) {
    if (id === 'unknown') { alert('"잘 모르겠어요"는 학생 안전망이라 지울 수 없어요.'); return }
    setTiles((p) => p.filter((t) => t.id !== id))
  }

  function move(idx: number, dir: -1 | 1) {
    setTiles((p) => {
      const next = [...p]
      const to = idx + dir
      if (to < 0 || to >= next.length) return p
      ;[next[idx], next[to]] = [next[to], next[idx]]
      return next
    })
  }

  // 저장 = 이 기기 localStorage + 클라우드(school_settings) — 키오스크 등 다른 기기는
  //  부팅/대기화면 복귀 때 클라우드에서 받아 자동 반영된다.
  async function pushCloud(list: SymptomTile[]): Promise<boolean> {
    if (!SUPABASE_ENABLED) return true
    try {
      await saveCloudSymptoms(list)
      return true
    } catch {
      return false
    }
  }

  async function save() {
    if (tiles.length === 0) { alert('증상이 최소 1개는 필요해요.'); return }
    try { localStorage.setItem(LS, JSON.stringify(tiles)) } catch { /* ignore */ }
    const ok = await pushCloud(tiles)
    alert(
      ok
        ? '증상 목록을 적용했습니다. 키오스크 등 다른 기기도 자동으로 반영됩니다(대기 화면 복귀 시).'
        : '이 기기에는 적용됐지만 클라우드 동기화에 실패했습니다. 다른 기기 반영이 늦을 수 있어요(네트워크 확인 후 다시 저장).',
    )
    window.location.reload()
  }

  async function restoreDefault() {
    if (!confirm('기본 증상 9개로 되돌릴까요?')) return
    try { localStorage.removeItem(LS) } catch { /* ignore */ }
    await pushCloud(DEFAULT_SYMPTOM_TILES) // 다른 기기에도 기본값 전파
    window.location.reload()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-list-details" style={{ verticalAlign: -2 }} aria-hidden="true" /> 증상 목록 편집
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
          키오스크·직접 접수·교사 요청에 보이는 증상 버튼을 편집합니다. <b>계통</b>은 통계 집계 기준,
          <b>기본 병명</b>은 처치 화면의 추천 병명입니다. 이 기기(브라우저)에 저장됩니다.
        </p>

        <div style={{ maxHeight: '38vh', overflowY: 'auto', marginBottom: 12 }}>
          {tiles.map((t, i) => (
            <div key={t.id} className="row" style={{ gap: 6, alignItems: 'center', padding: '6px 4px', borderBottom: '1px dashed var(--border)' }}>
              <i className={`ti ${t.icon}`} aria-hidden="true" style={{ width: 20, textAlign: 'center' }} />
              <b style={{ flex: 1 }}>{t.label}</b>
              <span className="muted-inline" style={{ width: 96 }}>{t.category}</span>
              <span className="muted-inline" style={{ width: 80 }}>{t.disease || '—'}</span>
              <button className="x" onClick={() => move(i, -1)} disabled={i === 0} title="위로"><i className="ti ti-chevron-up" aria-hidden="true" /></button>
              <button className="x" onClick={() => move(i, 1)} disabled={i === tiles.length - 1} title="아래로"><i className="ti ti-chevron-down" aria-hidden="true" /></button>
              <button className="x" onClick={() => remove(t.id)} title="삭제"><i className="ti ti-trash" aria-hidden="true" /></button>
            </div>
          ))}
        </div>

        <div className="sec-label" style={{ marginBottom: 6 }}>증상 추가</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="login-field" style={{ flex: 2, minWidth: 130 }}>증상(학생에게 보이는 말)
            <input value={label} placeholder="예: 이가 아파요" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </label>
          <label className="login-field" style={{ flex: 1, minWidth: 110 }}>계통(통계)
            <select value={category} onChange={(e) => setCategory(e.target.value as DiseaseCategory)}>
              {DISEASE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="login-field" style={{ flex: 1, minWidth: 100 }}>기본 병명(선택)
            <input value={disease} placeholder="예: 치통" onChange={(e) => setDisease(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={add}><i className="ti ti-plus" aria-hidden="true" /> 추가</button>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
          <button className="btn ghost" onClick={restoreDefault} disabled={tiles === DEFAULT_SYMPTOM_TILES}>
            <i className="ti ti-rotate" aria-hidden="true" /> 기본값 복원
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>취소</button>
            <button className="btn primary" onClick={save}><i className="ti ti-device-floppy" aria-hidden="true" /> 적용(새로고침)</button>
          </div>
        </div>
      </div>
    </div>
  )
}
