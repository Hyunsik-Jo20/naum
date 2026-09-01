import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { classLabel, tileById } from '../data/mock'
import { minutesSince, useVisits } from '../store/visits'
import { useNotices } from '../store/notices'
import TreatPanel from '../components/TreatPanel'
import AddVisitModal from '../components/AddVisitModal'
import LoginTokenModal from '../components/LoginTokenModal'
import ObserveResolveModal from '../components/ObserveResolveModal'
import ObservePickerModal from '../components/ObservePickerModal'
import { loadNotifyTargets, saveNotifyTargets } from '../data/notifyTargets'
import ParentNotifyModal from '../components/ParentNotifyModal'
import SymptomEditModal from '../components/SymptomEditModal'
import { flushDue, parentNotifySummary } from '../data/parentNotify'
import { loadRequests, subscribeRequests, removeRequest, type NurseInboxItem } from '../data/nurseRequest'
import { roster, saveRoster } from '../data/localRoster'
import { fetchCurrent, type CurrentWeather } from '../data/weatherApi'
import { deriveAlerts } from '../data/disasters'
import { useOfficialAlerts } from '../data/useOfficialAlerts'
import { SCHOOL } from '../data/location'
import { setBadge, clearBadge } from '../data/appBadge'
import { pushNotify, remotePushSupported, remotePushActive, subscribeRemotePush, unsubscribeRemotePush } from '../push'
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
  const { visits, addVisit, startTreating, completeVisit, updateVisit, deleteVisit, studentOf } = useVisits()
  const { nurseInbox, clearNurseInbox, thresholds } = useNotices()
  const [wx, setWx] = useState<CurrentWeather | null>(null)
  const notifiedAlerts = useRef<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [resolveId, setResolveId] = useState<string | null>(null) // 관찰 종료 결과 선택 대상
  const [extendId, setExtendId] = useState<string | null>(null) // 관찰 연장 대상
  const [requests, setRequests] = useState<NurseInboxItem[]>([]) // 교사 보건실 요청·전학 안내
  const [notifyT, setNotifyT] = useState(() => loadNotifyTargets())
  const [showParentNotify, setShowParentNotify] = useState(false)
  const [showSymptomEdit, setShowSymptomEdit] = useState(false)
  const [parentSummary, setParentSummary] = useState(() => parentNotifySummary())
  const [, setTick] = useState(0) // 관찰 남은시간 갱신·종료 감지용 주기 리렌더

  function toggleNotify(key: 'teacher' | 'parent') {
    setNotifyT((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveNotifyTargets(next)
      return next
    })
  }

  // 관찰 시간 카운트다운/종료 감지 — 20초마다 리렌더
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 20000)
    return () => window.clearInterval(t)
  }, [])

  // 학부모 알림 배치 스케줄러 — 마운트 시 catch-up + 30초마다 지정 시각 도래분 발송.
  //  (실시간 모드면 flushDue는 no-op.) 콘솔이 켜져 있는 동안 동작.
  useEffect(() => {
    flushDue()
    const t = window.setInterval(() => flushDue(), 30000)
    return () => window.clearInterval(t)
  }, [])

  // 교사 보건실 요청·전학 안내 수신(명부의 반들 키로 복호) + 실시간 구독.
  useEffect(() => {
    const classes = [...new Map(roster.map((s) => [`${s.grade}-${s.classNo}`, { grade: s.grade, classNo: s.classNo }])).values()]
    let ok = true
    const refresh = async () => { const r = await loadRequests(classes); if (ok) setRequests(r.filter((x) => x.req)) }
    void refresh()
    const off = subscribeRequests(() => void refresh())
    return () => { ok = false; off() }
  }, [])

  const findByNo = (g: number, c: number, n: number) => roster.find((s) => s.grade === g && s.classNo === c && s.number === n)
  async function acceptRequest(item: NurseInboxItem) {
    const req = item.req!
    const st = findByNo(req.grade, req.classNo, req.number)
    if (!st) { alert(`${req.grade}-${req.classNo} ${req.number}번 학생이 명부에 없습니다. 전학생이면 먼저 명부에 추가하세요.`); return }
    addVisit(st, req.symIds ?? [])
    await removeRequest(item.id).catch(() => {})
    setRequests((rs) => rs.filter((x) => x.id !== item.id))
  }
  async function addTransfer(item: NurseInboxItem) {
    const req = item.req!
    if (!findByNo(req.grade, req.classNo, req.number)) {
      const st = { id: `u_${req.grade}_${req.classNo}_${req.number}_t${Date.now()}`, name: req.name ?? `${req.number}번`, grade: req.grade, classNo: req.classNo, number: req.number, sex: req.sex ?? '남' as const }
      saveRoster([...roster, st])
    }
    await removeRequest(item.id).catch(() => {})
    setRequests((rs) => rs.filter((x) => x.id !== item.id))
    alert('명부에 추가했습니다. (새로고침 후 접수·복원에 반영됩니다)')
  }
  async function dismissRequest(item: NurseInboxItem) {
    await removeRequest(item.id).catch(() => {})
    setRequests((rs) => rs.filter((x) => x.id !== item.id))
  }

  // 날씨·미세먼지 → 재난·기상 경보(콘솔에도 표시). 10분마다 갱신.
  useEffect(() => {
    let ok = true
    const load = () => fetchCurrent(SCHOOL.lat, SCHOOL.lon).then((w) => ok && setWx(w)).catch(() => {})
    load()
    const t = window.setInterval(load, 10 * 60 * 1000)
    return () => { ok = false; window.clearInterval(t) }
  }, [])

  const official = useOfficialAlerts()
  const alerts = [...official, ...(wx ? deriveAlerts(wx, SCHOOL.name, thresholds) : [])]

  // 새 위험 경보가 뜨면 보건교사에게 로컬 푸시(하루 1회, 제목 기준 중복 방지).
  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10)
    alerts
      .filter((a) => a.severity === 'danger')
      .forEach((a) => {
        const k = `${a.title}|${day}`
        if (notifiedAlerts.current.has(k)) return
        notifiedAlerts.current.add(k)
        pushNotify(`[경보] ${a.title}`, a.detail)
      })
  }, [alerts])

  // 하루가 지나면 빈 화면 — 콘솔은 "오늘 접수" 건만 표시(어제 데이터는 자동으로 사라짐).
  //  기록 자체는 클라우드·교장 보고(월간)에 보존됨.
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todays = visits.filter((v) => v.createdAt >= todayStart.getTime())
  const waiting = todays.filter((v) => v.status === 'waiting')
  const treating = todays.filter((v) => v.status === 'treating')
  const done = todays.filter((v) => v.status === 'done')

  // 접수 도착 폰 푸시 — 이 기기(폰/PC)의 구독 상태와 토글.
  const [remotePush, setRemotePush] = useState(false)
  useEffect(() => {
    void remotePushActive().then(setRemotePush)
  }, [])
  async function toggleRemotePush() {
    if (remotePush) {
      await unsubscribeRemotePush()
      setRemotePush(false)
      return
    }
    const r = await subscribeRemotePush()
    if (r === 'ok') { setRemotePush(true); return }
    alert(
      r === 'denied'
        ? '알림 권한이 거부되어 있습니다. 브라우저 설정(주소창 자물쇠 → 알림)에서 허용 후 다시 시도하세요.'
        : r === 'unsupported'
          ? '이 브라우저는 푸시 알림을 지원하지 않습니다. (아이폰은 홈 화면에 추가한 앱에서만 가능)'
          : r === 'unconfigured'
            ? '서버에 푸시 키(VAPID)가 아직 설정되지 않았습니다. 관리 문서의 푸시 설정을 완료하세요.'
            : r === 'login_required'
              ? '보건교사 로그인 상태에서만 등록할 수 있습니다.'
              : '푸시 등록에 실패했습니다. 잠시 후 다시 시도하세요.',
    )
  }

  // 실행 아이콘 배지(설치형 PWA) — 대기 학생 수를 앱 아이콘에 숫자로 표시.
  //  보건교사가 자리를 비워 콘솔이 최소화/백그라운드여도, 키오스크 접수가 Realtime으로
  //  들어오는 즉시 작업표시줄·홈 화면 아이콘의 숫자가 갱신된다(개수만 노출 — 비식별).
  useEffect(() => {
    setBadge(waiting.length)
  }, [waiting.length])
  useEffect(() => () => clearBadge(), [])

  function removeVisit(id: string, name: string) {
    if (confirm(`${name} 학생 방문을 삭제할까요? (교실로 간 경우 등)`)) {
      if (activeId === id) setActiveId(null)
      deleteVisit(id)
    }
  }

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
              오늘 {todays.length}명 · 대기 {waiting.length} · 처치 {treating.length}
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
            <button className="btn ghost small" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowSymptomEdit(true)} title="키오스크·접수의 증상 버튼 목록 편집">
              <i className="ti ti-list-details" aria-hidden="true" /> 증상 목록 편집
            </button>
            <div className="notify-targets" title="접수·처치 알림을 누구에게 보낼지 선택">
              <span className="nt-label"><i className="ti ti-bell" aria-hidden="true" /> 알림 대상</span>
              <label className={`nt-chip ${notifyT.teacher ? 'on' : ''}`}>
                <input type="checkbox" checked={notifyT.teacher} onChange={() => toggleNotify('teacher')} /> 담임
              </label>
              <label className={`nt-chip ${notifyT.parent ? 'on' : ''}`}>
                <input type="checkbox" checked={notifyT.parent} onChange={() => toggleNotify('parent')} /> 학부모
              </label>
              {notifyT.parent && (
                <button
                  type="button"
                  className="nt-chip"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowParentNotify(true)}
                  title="학부모 알림을 실시간 대신 특정 시간에 모아 보낼 수 있습니다"
                >
                  <i className="ti ti-clock-hour-4" aria-hidden="true" /> 학부모 발송: {parentSummary}
                </button>
              )}
            </div>
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
            {remotePushSupported() && (
              <button
                className={`btn small ${remotePush ? '' : 'ghost'}`}
                style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
                onClick={() => void toggleRemotePush()}
                title="접수가 도착하면 이 기기로 푸시 알림을 보냅니다. 폰에서 쓰려면 폰에서 로그인 후 이 버튼을 누르세요(기기별 설정)."
              >
                <i className={`ti ${remotePush ? 'ti-bell-check' : 'ti-bell-plus'}`} aria-hidden="true" />
                {remotePush ? '이 기기 접수 알림 켜짐 — 누르면 끄기' : '이 기기에서 접수 푸시 알림 받기'}
              </button>
            )}
          </div>

          {/* 교사 보건실 요청 · 전학 안내 */}
          {requests.length > 0 && (
            <div className="recv-box">
              <span className="col-head warn-t" style={{ padding: 0 }}>
                <i className="ti ti-first-aid-kit" aria-hidden="true" /> 보건실 요청 · {requests.length}
              </span>
              <div className="recv-list" style={{ marginTop: 6 }}>
                {requests.map((item) => {
                  const req = item.req!
                  const st = findByNo(req.grade, req.classNo, req.number)
                  if (req.kind === '키오스크호출') {
                    const ksyms = (req.symIds ?? []).map((id) => tileById(id)?.label).filter(Boolean).join(' · ')
                    return (
                      <div key={item.id} className="recv-item alert">
                        <div className="recv-top">
                          <span className="recv-from"><i className="ti ti-bell-ringing" aria-hidden="true" /> 학생 호출 · 키오스크</span>
                          <span className="recv-time">{hhmm(item.ts)}</span>
                        </div>
                        <div className="recv-title">{req.grade}-{req.classNo} {req.number}번{st ? ` ${st.name}` : ''} — 키오스크 앞에서 기다려요</div>
                        {ksyms && <div className="recv-body">{ksyms}</div>}
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <button className="btn small primary" onClick={() => void dismissRequest(item)}>확인</button>
                        </div>
                      </div>
                    )
                  }
                  if (req.kind === '전학안내') {
                    return (
                      <div key={item.id} className="recv-item notice">
                        <div className="recv-top">
                          <span className="recv-from"><i className="ti ti-user-plus" aria-hidden="true" /> 전학생 안내</span>
                          <span className="recv-time">{hhmm(item.ts)}</span>
                        </div>
                        <div className="recv-title">{req.grade}-{req.classNo} {req.number}번 {req.name ?? ''} {req.sex ? `(${req.sex})` : ''}</div>
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <button className="btn small" onClick={() => void addTransfer(item)}>명부에 추가</button>
                          <button className="btn ghost small" onClick={() => void dismissRequest(item)}>무시</button>
                        </div>
                      </div>
                    )
                  }
                  const syms = (req.symIds ?? []).map((id) => tileById(id)?.label).filter(Boolean).join(' · ')
                  return (
                    <div key={item.id} className="recv-item alert">
                      <div className="recv-top">
                        <span className="recv-from"><i className="ti ti-first-aid-kit" aria-hidden="true" /> 보건실 요청</span>
                        <span className="recv-time">{hhmm(item.ts)}</span>
                      </div>
                      <div className="recv-title">{req.grade}-{req.classNo} {req.number}번{st ? ` ${st.name}` : ''}</div>
                      {syms && <div className="recv-body">{syms}</div>}
                      <div className="row" style={{ gap: 6, marginTop: 6 }}>
                        <button className="btn small primary" onClick={() => void acceptRequest(item)}>접수</button>
                        <button className="btn ghost small" onClick={() => void dismissRequest(item)}>무시</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 받은 공지·알림 — 담임·학부모 메시지 + 교육청 공지·경보 */}
          <div className="recv-box">
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="col-head info-t" style={{ padding: 0 }}>
                <i className="ti ti-inbox" aria-hidden="true" /> 받은 공지·알림 · {nurseInbox.length}
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
                  <div key={i} className={`recv-item ${m.kind ?? 'msg'}`}>
                    <div className="recv-top">
                      <span className="recv-from">
                        {m.kind === 'alert' ? (
                          <><i className="ti ti-alert-triangle" aria-hidden="true" /> 재난 경보</>
                        ) : m.kind === 'notice' ? (
                          <><i className="ti ti-speakerphone" aria-hidden="true" /> 교육청 공지</>
                        ) : (
                          m.sender ?? '발신자'
                        )}
                      </span>
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
                  <div key={v.id} className="visit-card warn has-del" onClick={() => selectWaiting(v)} title="지금 처치 시작">
                    <button
                      className="vc-del"
                      title="삭제 (교실로 간 경우 등)"
                      onClick={(e) => { e.stopPropagation(); removeVisit(v.id, nameOf(v)) }}
                    >
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                    <div className="vc-name">
                      {nameOf(v)} <span className="vc-class">{clsOf(v)}</span>
                    </div>
                    <div className="vc-sym">{symptomText(v)}</div>
                    <div className="vc-foot warning-t">{minutesSince(v.createdAt)}분 대기</div>
                  </div>
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
              done.map((v) => {
                const observing = v.outcome === '관찰' && !!v.observeUntil
                const remainMin = observing ? Math.ceil((v.observeUntil! - Date.now()) / 60000) : 0
                const ended = observing && remainMin <= 0
                return (
                  <div
                    key={v.id}
                    className={`visit-card done has-del ${ended ? 'observe-done' : ''} ${active?.id === v.id ? 'editing' : ''}`}
                    onClick={() => (ended ? setResolveId(v.id) : setActiveId(v.id))}
                    title={ended ? '관찰 종료 · 결과 선택 (복귀/귀가/병원/연장)' : observing ? '관찰 중' : '사후 처치 추가·수정'}
                  >
                    <button
                      className="vc-del"
                      title="기록 삭제 (잘못 접수한 경우 등)"
                      onClick={(e) => { e.stopPropagation(); removeVisit(v.id, nameOf(v)) }}
                    >
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                    <div className="vc-name">
                      {nameOf(v)} <span className="vc-class">{clsOf(v)}</span>
                    </div>
                    <div className="vc-sym">{symptomText(v)}</div>
                    {ended ? (
                      <div className="vc-foot danger-t">
                        <i className="ti ti-bell-ringing" aria-hidden="true" /> 관찰 종료 · 결과 선택 →
                      </div>
                    ) : observing ? (
                      <div className="vc-foot info-t">
                        <i className="ti ti-eye" aria-hidden="true" /> 관찰 중 · {remainMin}분 남음
                      </div>
                    ) : (
                      <div className="vc-foot success-t">
                        {v.outcome ?? '교실 복귀'} · 사후 보완 <i className="ti ti-pencil" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        <i className="ti ti-info-circle" style={{ verticalAlign: -2 }} aria-hidden="true" /> 가운데 처치 화면은 항상 열려 있고, 완료하면 다음 대기자가 자동으로 떠요. 완료 학생을 누르면 사후 보완.
      </p>

      {showAdd && <AddVisitModal onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
      {showToken && <LoginTokenModal onClose={() => setShowToken(false)} />}
      {showParentNotify && <ParentNotifyModal onClose={() => { setShowParentNotify(false); setParentSummary(parentNotifySummary()) }} />}
      {showSymptomEdit && <SymptomEditModal onClose={() => setShowSymptomEdit(false)} />}
      {resolveId && (
        <ObserveResolveModal
          name={nameOf(visits.find((v) => v.id === resolveId) ?? ({} as Visit))}
          onResolve={(outcome) => { completeVisit(resolveId, { outcome }); setResolveId(null) }}
          onExtend={() => { setExtendId(resolveId); setResolveId(null) }}
          onClose={() => setResolveId(null)}
        />
      )}
      {extendId && (
        <ObservePickerModal
          initialMin={30}
          onConfirm={(min) => { updateVisit(extendId, { observeUntil: Date.now() + min * 60000 }); setExtendId(null) }}
          onClose={() => setExtendId(null)}
        />
      )}
    </div>
  )
}
