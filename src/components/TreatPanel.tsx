import { useMemo, useState } from 'react'
import {
  DISEASE_CATEGORIES,
  ESCORTS,
  classLabel,
  guardianPhone,
  recentVisitHint,
  suggestDiseases,
  tileById,
} from '../data/mock'
import { loadTreatments, saveTreatments } from '../data/treatments'
import { aiTriage, aiConfigured } from '../data/aiTriage'
import AiSettingsModal from './AiSettingsModal'
import { useVisits } from '../store/visits'
import type { Disease, Outcome, Visit } from '../types'

const OUTCOMES: Outcome[] = ['교실 복귀', '귀가', '병원 이송', '관찰']

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * 처치 폼. 통합 콘솔의 가운데와 단독 라우트에서 공용.
 * 완료/저장 후 onDone(visitId, wasFollowup)을 호출해 다음 대상 선택을 부모에 위임.
 */
export default function TreatPanel({
  visit,
  onDone,
}: {
  visit: Visit
  onDone: (visitId: string, wasFollowup: boolean) => void
}) {
  const { completeVisit, updateVisit, studentOf, visits } = useVisits()
  const student = studentOf(visit.id)
  const isDone = visit.status === 'done'

  // 최근 방문(이전 종료 방문 우선, 없으면 합성 힌트) + 학부모 연락처
  const recentVisit = useMemo(() => {
    if (!student) return null
    const mine = visits
      .filter((v) => v.id !== visit.id && v.status === 'done' && studentOf(v.id)?.id === student.id)
      .sort((a, b) => (b.treatedAt ?? b.createdAt) - (a.treatedAt ?? a.createdAt))
    const v0 = mine[0]
    if (v0) {
      const prim = v0.diseases.find((d) => d.isPrimary) ?? v0.diseases[0]
      const d = new Date(v0.treatedAt ?? v0.createdAt)
      return `${d.getMonth() + 1}/${d.getDate()} ${prim?.name ?? '방문'} · ${v0.outcome ?? '교실 복귀'}`
    }
    return recentVisitHint(student)
  }, [student, visits, visit.id, studentOf])
  const phone = student ? guardianPhone(student) : null

  const initial = visit.diseases.length
    ? visit.diseases
    : suggestDiseases(visit.symptomTileIds)

  const [diseases, setDiseases] = useState<Disease[]>(initial)
  const [treatments, setTreatments] = useState<string[]>(visit.treatments)
  const [treatOrder, setTreatOrder] = useState<string[]>(() => loadTreatments())
  const [addingTreat, setAddingTreat] = useState(false)
  const [newTreat, setNewTreat] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [memo, setMemo] = useState('')
  // AI 추천 상태
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')
  const [aiAlert, setAiAlert] = useState<string | null>(null)
  const [aiTreats, setAiTreats] = useState<string[]>([])
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(visit.outcome ?? '교실 복귀')
  const [escort, setEscort] = useState<string[]>(visit.escort ?? ['보건교사'])
  const [transport, setTransport] = useState<'자가' | '119'>(visit.transport ?? '119')
  const [handoff, setHandoff] = useState<boolean>(visit.guardianHandoff ?? false)

  function setPrimary(idx: number) {
    setDiseases((p) => p.map((d, i) => ({ ...d, isPrimary: i === idx })))
  }
  function patchDisease(idx: number, patch: Partial<Disease>) {
    setDiseases((p) => p.map((d, i) => (i === idx ? { ...d, ...patch } : d)))
  }
  function removeDisease(idx: number) {
    setDiseases((p) => {
      const next = p.filter((_, i) => i !== idx)
      if (next.length && !next.some((d) => d.isPrimary)) next[0].isPrimary = true
      return next
    })
  }
  function addDisease() {
    setDiseases((p) => [...p, { name: '', category: '기타', isPrimary: p.length === 0 }])
  }
  function toggleTreatment(t: string) {
    setTreatments((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
  }
  function confirmAddTreat() {
    const t = newTreat.trim()
    if (!t) return
    if (!treatOrder.includes(t)) {
      const next = [...treatOrder]
      const etcIdx = next.indexOf('기타')
      if (etcIdx >= 0) next.splice(etcIdx, 0, t)
      else next.push(t)
      setTreatOrder(next)
      saveTreatments(next)
    }
    if (!treatments.includes(t)) setTreatments((p) => [...p, t])
    setNewTreat('')
    setAddingTreat(false)
  }
  function moveTreat(to: number) {
    const from = dragIdx
    setDragIdx(null)
    if (from === null || from === to) return
    setTreatOrder((prev) => {
      const next = [...prev]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      saveTreatments(next)
      return next
    })
  }
  function toggleEscort(e: string) {
    setEscort((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]))
  }

  // AI: 증상 → 병명·감염병 경고·기본 처치 추천 (증상만 전송, PII 미포함)
  async function runAi() {
    if (!aiConfigured()) {
      setAiErr('')
      setAiSettingsOpen(true)
      return
    }
    setAiErr('')
    setAiBusy(true)
    try {
      const syms = visit.symptomTileIds.map((id) => tileById(id)?.label).filter(Boolean) as string[]
      const r = await aiTriage(syms, visit.grade, visit.sex, memo)
      if (r.diseases.length) {
        setDiseases(r.diseases.map((d, i) => ({ name: d.name, category: d.category, isPrimary: i === 0 })))
      }
      setAiAlert(r.infectionAlert)
      setAiTreats(r.treatments)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }
  // AI가 추천한 처치를 선택 → 반영
  function applyAiTreat(t: string) {
    if (!treatments.includes(t)) setTreatments((p) => [...p, t])
    setAiTreats((p) => p.filter((x) => x !== t))
    if (!treatOrder.includes(t)) {
      const next = [...treatOrder]
      const etc = next.indexOf('기타')
      if (etc >= 0) next.splice(etc, 0, t)
      else next.push(t)
      setTreatOrder(next)
      saveTreatments(next)
    }
  }
  // 기타란 Enter → 직접 입력 내용을 처치로 반영
  function addMemoAsTreat() {
    const t = memo.trim()
    if (!t) return
    if (!treatments.includes(t)) setTreatments((p) => [...p, t])
    setMemo('')
  }

  function buildPatch(): Partial<Visit> {
    const memoText = memo.trim()
    // 직접 입력(기타) 내용도 처치에 포함해 저장
    const allTreatments = memoText ? [...treatments.filter((t) => t !== memoText), memoText] : treatments
    return {
      diseases: diseases.filter((d) => d.name.trim()),
      treatments: allTreatments,
      outcome,
      escort: outcome === '병원 이송' ? escort : undefined,
      transport: outcome === '병원 이송' ? transport : undefined,
      guardianHandoff: outcome === '귀가' ? handoff : undefined,
    }
  }

  function complete() {
    completeVisit(visit.id, buildPatch())
    onDone(visit.id, false)
  }
  function saveFollowUp() {
    updateVisit(visit.id, buildPatch())
    onDone(visit.id, true)
  }

  const plainOutcome = outcome === '교실 복귀' || outcome === '관찰'

  return (
    <div className="card treat-panel">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="avatar">{student?.name[0] ?? '?'}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {student?.name ?? '학생'}{' '}
              <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 400 }}>
                · {student ? `${classLabel(student)} · ${student.sex}` : `${visit.grade}학년 · ${visit.sex}`}
              </span>
            </div>
            <div className="student-meta">
              <span className="sm-item">
                <i className="ti ti-history" aria-hidden="true" /> 최근 방문: {recentVisit ?? '없음'}
              </span>
              {phone && (
                <a className="sm-item sm-tel" href={`tel:${phone}`}>
                  <i className="ti ti-phone" aria-hidden="true" /> 학부모 {phone}
                </a>
              )}
            </div>
          </div>
        </div>
        {isDone ? (
          <span className="pill success">
            <i className="ti ti-check" aria-hidden="true" /> 종료됨
          </span>
        ) : (
          <span className="pill info">
            <i className="ti ti-clock" aria-hidden="true" /> 접수 {fmtTime(visit.createdAt)}
          </span>
        )}
      </div>

      {isDone && (
        <div className="followup-banner">
          <i className="ti ti-info-circle" aria-hidden="true" /> <strong>{visit.outcome ?? '교실 복귀'}</strong>로 종료됨 · 사후 처치를 추가·수정할 수 있어요.
        </div>
      )}

      <div className="chips" style={{ marginBottom: 12 }}>
        {visit.symptomTileIds.map((tid) => {
          const t = tileById(tid)
          if (!t) return null
          return (
            <span key={tid} className="chip plain">
              <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
            </span>
          )
        })}
      </div>

      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="sec-label">
          병명 확정 <span className="muted-inline">· 계통 자동 분류 · 추천(확인 필요)</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={runAi} disabled={aiBusy} title="증상으로 병명·처치 AI 추천">
            <i className={`ti ${aiBusy ? 'ti-loader-2' : 'ti-robot'}`} aria-hidden="true" /> {aiBusy ? '분석 중…' : 'AI 추천'}
          </button>
          <button className="btn ghost small" onClick={() => setAiSettingsOpen(true)} title="AI 설정(키)">
            <i className="ti ti-settings" aria-hidden="true" />
          </button>
          <button className="btn ghost small" onClick={addDisease}>
            <i className="ti ti-plus" aria-hidden="true" /> 병명 추가
          </button>
        </div>
      </div>
      {aiErr && <div className="ai-err" style={{ marginBottom: 10 }}>{aiErr}</div>}
      {aiAlert && (
        <div className="infection-alert" style={{ marginBottom: 10 }}>
          <i className="ti ti-virus" aria-hidden="true" /> <b>감염병 의심</b> · {aiAlert}
        </div>
      )}
      <div className="disease-list" style={{ marginBottom: 12 }}>
        {diseases.length === 0 && <div className="col-empty">병명을 추가하세요.</div>}
        {diseases.map((d, i) => (
          <div key={i} className="disease-row">
            <button
              className={`star ${d.isPrimary ? 'on' : ''}`}
              title="주증상"
              onClick={() => setPrimary(i)}
            >
              <i className="ti ti-star" aria-hidden="true" />
            </button>
            <input
              className="d-name"
              value={d.name}
              placeholder="병명"
              onChange={(e) => patchDisease(i, { name: e.target.value })}
            />
            <span className="arrow">→</span>
            <select
              className="d-cat"
              value={d.category}
              onChange={(e) =>
                patchDisease(i, { category: e.target.value as Disease['category'] })
              }
            >
              {DISEASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="x" onClick={() => removeDisease(i)} title="삭제">
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="sec-label" style={{ marginBottom: 10 }}>
        처치 <span className="muted-inline">· 여러 개 선택 · 드래그로 순서 변경</span>
      </div>
      <div className="treat-grid">
        {treatOrder.map((t, i) => {
          const on = treatments.includes(t)
          return (
            <button
              key={t}
              className={`chip drag ${on ? 'on' : ''} ${dragIdx === i ? 'dragging' : ''}`}
              onClick={() => toggleTreatment(t)}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => moveTreat(i)}
              onDragEnd={() => setDragIdx(null)}
              title="드래그해서 순서 변경"
            >
              <i className="ti ti-grip-vertical grip" aria-hidden="true" />
              {on && <i className="ti ti-check" aria-hidden="true" />} {t}
            </button>
          )
        })}
        <button className="chip add" onClick={() => setAddingTreat(true)}>
          <i className="ti ti-plus" aria-hidden="true" /> 추가
        </button>
      </div>
      {addingTreat && (
        <div className="treat-add-row">
          <input
            autoFocus
            value={newTreat}
            placeholder="자주 쓰는 처치 이름 (예: 얼음팩, 흡입기)"
            onChange={(e) => setNewTreat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmAddTreat()}
          />
          <button className="btn small" onClick={confirmAddTreat}>추가</button>
          <button className="btn ghost small" onClick={() => { setAddingTreat(false); setNewTreat('') }}>취소</button>
        </div>
      )}
      {aiTreats.length > 0 && (
        <div className="ai-treats" style={{ marginBottom: 8 }}>
          <span className="muted-inline"><i className="ti ti-robot" aria-hidden="true" /> AI 추천 처치 — 누르면 반영</span>
          <div className="chips" style={{ marginTop: 6 }}>
            {aiTreats.map((t) => (
              <button key={t} className="chip" onClick={() => applyAiTreat(t)}>
                <i className="ti ti-plus" aria-hidden="true" /> {t}
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        className="memo"
        value={memo}
        placeholder="기타 — 추가 처치·특이사항 직접 입력 후 Enter (예: 구토 없음, 아침 식사 함)"
        onChange={(e) => setMemo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addMemoAsTreat()}
        style={{ marginBottom: 12 }}
      />

      <div className="sec-label" style={{ marginBottom: 10 }}>
        결과 <span className="muted-inline">· 기본 교실 복귀 (안 누르면 자동)</span>
      </div>
      <div className="outcome-grid" style={{ marginBottom: plainOutcome ? 24 : 12 }}>
        {OUTCOMES.map((o) => (
          <button
            key={o}
            className={`outcome ${outcome === o ? 'on' : ''} ${
              o === '병원 이송' && outcome === o ? 'danger' : ''
            }`}
            onClick={() => setOutcome(o)}
          >
            {o}
          </button>
        ))}
      </div>

      {outcome === '귀가' && (
        <label className="handoff" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} />
          보호자 연락·인계 확인
        </label>
      )}

      {outcome === '병원 이송' && (
        <div className="escalate" style={{ marginBottom: 12 }}>
          <div className="esc-title">
            <i className="ti ti-ambulance" aria-hidden="true" /> 병원 이송 — 동행자와 방법을 확인하세요
          </div>
          <div className="esc-sub">동행자 (여러 명 선택)</div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {ESCORTS.map((e) => {
              const on = escort.includes(e)
              return (
                <button key={e} className={`chip danger ${on ? 'on' : ''}`} onClick={() => toggleEscort(e)}>
                  {on && <i className="ti ti-check" aria-hidden="true" />} {e}
                </button>
              )
            })}
          </div>
          <div className="esc-sub">이송 방법</div>
          <div className="chips">
            {(['자가', '119'] as const).map((m) => (
              <button key={m} className={`chip danger ${transport === m ? 'on' : ''}`} onClick={() => setTransport(m)}>
                {transport === m && <i className="ti ti-check" aria-hidden="true" />} {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row between" style={{ paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
        <span className="muted" style={{ fontSize: 13 }}>
          <i className="ti ti-clock" style={{ verticalAlign: -2 }} aria-hidden="true" />{' '}
          {isDone ? '종료 상태 유지 · 변경분만 저장' : '시각 자동 기록 · 완료 시 담임·학부모 알림'}
        </span>
        {isDone ? (
          <button className="btn complete" onClick={saveFollowUp}>
            <i className="ti ti-device-floppy" aria-hidden="true" /> 사후 보완 저장
          </button>
        ) : (
          <button className="btn complete" onClick={complete}>
            <i className="ti ti-check" aria-hidden="true" /> <span>처치 완료 →<br />다음 학생</span>
          </button>
        )}
      </div>
      {aiSettingsOpen && <AiSettingsModal onClose={() => setAiSettingsOpen(false)} />}
    </div>
  )
}
