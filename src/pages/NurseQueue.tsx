import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { classLabel, tileById } from '../data/mock'
import { minutesSince, useVisits } from '../store/visits'
import { useNotices } from '../store/notices'
import TreatPanel from '../components/TreatPanel'
import AddVisitModal from '../components/AddVisitModal'
import LoginTokenModal from '../components/LoginTokenModal'
import type { Student, Visit } from '../types'

function hhmm(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function symptomText(v: Visit): string {
  return v.symptomTileIds
    .map((id) => tileById(id)?.label)
    .filter(Boolean)
    .join(' · ')
}

export default function NurseQueue() {
  const { visits, addVisit, startTreating, studentOf } = useVisits()
  const { nurseInbox, clearNurseInbox } = useNotices()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const waiting = visits.filter((v) => v.status === 'waiting')
  const treating = visits.filter((v) => v.status === 'treating')
  const done = visits.filter((v) => v.status === 'done')

  useEffect(() => {
    if (activeId && visits.some((v) => v.id === activeId)) return
    const t = visits.find((v) => v.status === 'treating')
    if (t) {
      setActiveId(t.id)
      return
    }
    const w = visits.find((v) => v.status === 'waiting')
    if (w) {
      startTreating(w.id)
      setActiveId(w.id)
      return
    }
    setActiveId(null)
  }, [visits, activeId, startTreating])

  const active = activeId ? visits.find((v) => v.id === activeId) ?? null : null

  function pickNext(excludeId: string | null): string | null {
    const t = visits.find((v) => v.status === 'treating' && v.id !== excludeId)
    if (t) return t.id
    const w = visits.find((v) => v.status === 'waiting')
    if (w) {
      startTreating(w.id)
      return w.id
    }
    return null
  }

  function handleDone(id: string, wasFollowup: boolean) {
    setActiveId(pickNext(wasFollowup ? null : id))
  }

  function selectWaiting(v: Visit) {
    startTreating(v.id)
    setActiveId(v.id)
  }

  function handleAdd(student: Student, tileIds: string[], mode: 'wait' | 'treat') {
    const v = addVisit(student, tileIds)
    if (mode === 'treat') {
      startTreating(v.id)
      setActiveId(v.id) // 응급: 바로 가운데 처치 화면으로
    }
    setShowAdd(false)
  }

  function nameOf(v: Visit): string {
    return studentOf(v.id)?.name ?? '학생'
  }
  function clsOf(v: Visit): string {
    const s = studentOf(v.id)
    return s ? classLabel(s) : ''
  }

  return (
    <div>
      <div className="queue-3">
        {/* 좌측 1/4 — 현황 요약 + 대기자 */}
        <div>
          <div className="nq-summary">
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>보건실 현황</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              오늘 {visits.length}명 · 대기 {waiting.length} · 처치 {treating.length}
            </span>
            <div className="row" style={{ gap: 6, width: '100%' }}>
              <Link to="/principal" className="btn small" style={{ flex: 1, justifyContent: 'center' }}>
                <i className="ti ti-clipboard-text" aria-hidden="true" /> 교장 보고
              </Link>
              <Link to="/roster" className="btn ghost small" style={{ flex: 1, justifyContent: 'center' }} title="학생 명부 관리">
                <i className="ti ti-users" aria-hidden="true" /> 명부
              </Link>
            </div>
            <button className="btn ghost small" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowToken(true)} title="교사·학부모 로그인 토큰 발급">
              <i className="ti ti-key" aria-hidden="true" /> 로그인 토큰 발급
            </button>
            {/* 앵커 + target=_blank — window.open(크기지정)은 팝업 차단 대상이라 링크로 새 탭/창을 연다 */}
            <a
              href="/kiosk"
              target="_blank"
              rel="noopener"
              className="btn primary small"
              style={{ width: '100%', justifyContent: 'center' }}
              title="학생용 접수 키오스크를 새 탭으로 — 두 번째 모니터/태블릿으로 옮기세요"
            >
              <i className="ti ti-device-tablet" aria-hidden="true" /> 학생 키오스크 새 탭으로 열기
            </a>
          </div>

          {/* 받은 알림 — 담임·학부모 → 보건실 */}
          <div className="recv-box">
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="col-head info-t" style={{ padding: 0 }}>
                <i className="ti ti-inbox" aria-hidden="true" /> 받은 알림 · {nurseInbox.length}
              </span>
              {nurseInbox.length > 0 && (
                <button className="btn ghost small" onClick={clearNurseInbox} title="모두 지우기">
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              )}
            </div>
            {nurseInbox.length === 0 ? (
              <div className="col-empty">받은 알림이 없습니다.</div>
            ) : (
              <div className="recv-list">
                {nurseInbox.map((m, i) => (
                  <div key={i} className="recv-item">
                    <div className="recv-top">
                      <span className="recv-from">{m.sender ?? '발신자'}</span>
                      <span className="recv-time">{hhmm(m.ts)}</span>
                    </div>
                    <div className="recv-title">{m.title}</div>
                    {m.body && <div className="recv-body">{m.body}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="queue-panel waiting">
            <div className="col-head warning-t">
              <i className="ti ti-hourglass" aria-hidden="true" /> 대기 중 · {waiting.length}
            </div>
            <div className="col-body">
              {waiting.length === 0 ? (
                <div className="col-empty">대기 학생 없음</div>
              ) : (
                waiting.map((v) => (
                  <button
                    key={v.id}
                    className="visit-card warn"
                    onClick={() => selectWaiting(v)}
                    title="지금 처치 시작"
                  >
                    <div className="vc-name">
                      {nameOf(v)} <span className="vc-class">{clsOf(v)}</span>
                    </div>
                    <div className="vc-sym">{symptomText(v)}</div>
                    <div className="vc-foot warning-t">{minutesSince(v.createdAt)}분 대기</div>
                  </button>
                ))
              )}
              <button className="add-visit-btn" onClick={() => setShowAdd(true)}>
                <i className="ti ti-plus" aria-hidden="true" /> 직접 접수
              </button>
            </div>
          </div>
        </div>

        {/* 가운데 1/2 — 처치 화면 (항상 열림) */}
        <div>
          <div className="col-head big info-t">
            <i className="ti ti-stethoscope" aria-hidden="true" /> 처치 화면
          </div>

          {treating.length > 0 && (
            <div className="switcher">
              {treating.map((v) => (
                <button
                  key={v.id}
                  className={`sw-chip ${active?.id === v.id ? 'on' : ''}`}
                  onClick={() => setActiveId(v.id)}
                >
                  {nameOf(v)}
                </button>
              ))}
            </div>
          )}

          {active ? (
            <TreatPanel key={active.id} visit={active} onDone={handleDone} />
          ) : (
            <div className="card">
              <div className="stub">
                <i className="ti ti-coffee" aria-hidden="true" />
                <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
                  대기 중인 학생이 없어요
                </p>
                <p>학생이 접수하면 이 자리에 처치 화면이 자동으로 열립니다.</p>
              </div>
            </div>
          )}
        </div>

        {/* 우측 1/4 — 종료자 (사후 보완) */}
        <div className="queue-panel done">
          <div className="col-head success-t">
            <i className="ti ti-check" aria-hidden="true" /> 완료 · {done.length}
          </div>
          <div className="col-body">
            {done.length === 0 ? (
              <div className="col-empty">완료 학생 없음</div>
            ) : (
              done.map((v) => (
                <button
                  key={v.id}
                  className={`visit-card done ${active?.id === v.id ? 'editing' : ''}`}
                  onClick={() => setActiveId(v.id)}
                  title="사후 처치 추가·수정"
                >
                  <div className="vc-name">
                    {nameOf(v)} <span className="vc-class">{clsOf(v)}</span>
                  </div>
                  <div className="vc-sym">{symptomText(v)}</div>
                  <div className="vc-foot success-t">
                    {v.outcome ?? '교실 복귀'} · 사후 보완 <i className="ti ti-pencil" aria-hidden="true" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        <i className="ti ti-info-circle" style={{ verticalAlign: -2 }} aria-hidden="true" /> 가운데 처치 화면은 항상 열려 있고, 완료하면 다음 대기자가 자동으로 떠요. 완료 학생을 누르면 사후 보완.
      </p>

      {showAdd && <AddVisitModal onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
      {showToken && <LoginTokenModal onClose={() => setShowToken(false)} />}
    </div>
  )
}
