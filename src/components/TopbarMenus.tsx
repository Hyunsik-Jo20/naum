// 상단바 아이콘 메뉴(보건교사) — 🔔 받은 공지·알림 / ⚙ 설정 팝업.
//  콘솔 좌측 열에 늘어서 있던 설정류(토큰 발급·증상 편집·알림 대상·학부모 발송·푸시)와
//  받은 공지함을 상단 아이콘 팝업으로 이동해, 좌측 열은 현황·대기 학생에 집중(현장 피드백).
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNotices } from '../store/notices'
import { loadNotifyTargets, saveNotifyTargets } from '../data/notifyTargets'
import { deadCount, retryDead } from '../data/offline'
import { parentNotifySummary } from '../data/parentNotify'
import { remotePushSupported, remotePushActive, subscribeRemotePush, unsubscribeRemotePush } from '../push'
import { ACCENTS, SCALES, loadAccent, loadScale, setAccent, setScale } from '../data/uiPrefs'
import LoginTokenModal from './LoginTokenModal'
import SymptomEditModal from './SymptomEditModal'
import ParentNotifyModal from './ParentNotifyModal'

function hhmm(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 팝오버 바깥 클릭 시 닫기. */
function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, onClose])
  return ref
}

/** 🔔 받은 공지·알림 — 미확인 개수 뱃지 + 목록 팝업. */
export function NoticeBell() {
  const { nurseInbox, clearNurseInbox } = useNotices()
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))

  return (
    <div className="topbar-menu" ref={ref}>
      <button className="topbar-icon" onClick={() => setOpen((v) => !v)} title="받은 공지·알림" aria-label="받은 공지·알림">
        <i className="ti ti-bell" aria-hidden="true" />
        {nurseInbox.length > 0 && <span className="topbar-badge">{nurseInbox.length > 99 ? '99+' : nurseInbox.length}</span>}
      </button>
      {open && (
        <div className="topbar-pop">
          <div className="row between" style={{ marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}><i className="ti ti-inbox" aria-hidden="true" /> 받은 공지·알림 · {nurseInbox.length}</b>
            {nurseInbox.length > 0 && (
              <button className="btn ghost small" onClick={clearNurseInbox} title="모두 지우기">
                <i className="ti ti-trash" aria-hidden="true" />
              </button>
            )}
          </div>
          {nurseInbox.length === 0 ? (
            <div className="col-empty">받은 알림이 없습니다.</div>
          ) : (
            <div className="recv-list" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
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
      )}
    </div>
  )
}

/** ⚙ 설정 — 알림 대상·발송 시간·푸시·토큰·증상 편집·화면 설정·바로가기. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const [showToken, setShowToken] = useState(false)
  const [showSymptomEdit, setShowSymptomEdit] = useState(false)
  const [showParentNotify, setShowParentNotify] = useState(false)

  const [notifyT, setNotifyT] = useState(() => loadNotifyTargets())
  const [parentSummary, setParentSummary] = useState(() => parentNotifySummary())
  function toggleNotify(key: 'teacher' | 'parent') {
    setNotifyT((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveNotifyTargets(next)
      return next
    })
  }

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
            ? '서버에 푸시 키(VAPID)가 아직 설정되지 않았습니다.'
            : r === 'login_required'
              ? '보건교사 로그인 상태에서만 등록할 수 있습니다.'
              : '푸시 등록에 실패했습니다. 잠시 후 다시 시도하세요.',
    )
  }

  const [accent, setAccentState] = useState(() => loadAccent())
  const [scale, setScaleState] = useState(() => loadScale())

  return (
    <div className="topbar-menu" ref={ref}>
      <button className="topbar-icon" onClick={() => setOpen((v) => !v)} title="설정" aria-label="설정">
        <i className="ti ti-settings" aria-hidden="true" />
      </button>
      {open && (
        <div className="topbar-pop">
          <div className="tp-sec">알림</div>
          <div className="notify-targets" style={{ marginBottom: 6 }} title="접수·처치 알림을 누구에게 보낼지 선택">
            <span className="nt-label"><i className="ti ti-bell" aria-hidden="true" /> 알림 대상</span>
            <label className={`nt-chip ${notifyT.teacher ? 'on' : ''}`}>
              <input type="checkbox" checked={notifyT.teacher} onChange={() => toggleNotify('teacher')} /> 담임
            </label>
            <label className={`nt-chip ${notifyT.parent ? 'on' : ''}`}>
              <input type="checkbox" checked={notifyT.parent} onChange={() => toggleNotify('parent')} /> 학부모
            </label>
          </div>
          {notifyT.parent && (
            <button className="tp-row" onClick={() => setShowParentNotify(true)} title="학부모 알림을 실시간 대신 특정 시간에 모아 보낼 수 있습니다">
              <i className="ti ti-clock-hour-4" aria-hidden="true" /> 학부모 발송: {parentSummary}
            </button>
          )}
          {remotePushSupported() && (
            <button className="tp-row" onClick={() => void toggleRemotePush()} title="접수 도착 시 이 기기로 푸시 알림(기기별 설정)">
              <i className={`ti ${remotePush ? 'ti-bell-check' : 'ti-bell-plus'}`} aria-hidden="true" />
              {remotePush ? '이 기기 접수 알림 켜짐 — 끄기' : '이 기기에서 접수 푸시 알림 받기'}
            </button>
          )}

          <div className="tp-sec">관리</div>
          {deadCount() > 0 && (
            <button
              className="tp-row"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
              title="업로드가 계속 실패해 보관함에 격리된 접수·처치 기록을 다시 전송합니다"
              onClick={() => {
                const n = retryDead()
                alert(n ? `전송 실패 기록 ${n}건을 다시 전송합니다. 잠시 후 대기열에 나타납니다.` : '재시도할 기록이 없습니다.')
                setOpen(false)
              }}
            >
              <i className="ti ti-refresh-alert" aria-hidden="true" /> 전송 실패 기록 복구 · {deadCount()}건
            </button>
          )}
          <button className="tp-row" onClick={() => setShowToken(true)}>
            <i className="ti ti-key" aria-hidden="true" /> 로그인 토큰 발급
          </button>
          <button className="tp-row" onClick={() => setShowSymptomEdit(true)}>
            <i className="ti ti-list-details" aria-hidden="true" /> 증상 목록 편집
          </button>
          <div className="row" style={{ gap: 6 }}>
            <Link to="/principal" className="tp-row" style={{ flex: 1 }} onClick={() => setOpen(false)}>
              <i className="ti ti-clipboard-text" aria-hidden="true" /> 교장 보고
            </Link>
            <Link to="/roster" className="tp-row" style={{ flex: 1 }} onClick={() => setOpen(false)}>
              <i className="ti ti-users" aria-hidden="true" /> 명부 관리
            </Link>
          </div>

          <div className="tp-sec">화면</div>
          <div className="tp-inline">
            <span className="muted-inline">포인트 색상</span>
            <div className="row" style={{ gap: 6 }}>
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={`tp-swatch ${accent === a.id ? 'on' : ''}`}
                  style={{ background: a.info }}
                  title={a.label}
                  aria-label={a.label}
                  onClick={() => { setAccent(a.id); setAccentState(a.id) }}
                />
              ))}
            </div>
          </div>
          <div className="tp-inline">
            <span className="muted-inline">글자·화면 크기</span>
            <div className="row" style={{ gap: 4 }}>
              {SCALES.map((s) => (
                <button
                  key={s}
                  className={`chip ${scale === s ? 'on' : ''}`}
                  style={{ padding: '4px 9px', fontSize: 12 }}
                  onClick={() => { setScale(s); setScaleState(s) }}
                >
                  {Math.round(s * 100)}%
                </button>
              ))}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11, margin: '6px 2px 0', lineHeight: 1.5 }}>
            화면 설정은 이 기기에만 적용됩니다. 키오스크 크기는 키오스크 화면 상단에서 따로 조절해요.
          </p>
        </div>
      )}

      {showToken && <LoginTokenModal onClose={() => setShowToken(false)} />}
      {showSymptomEdit && <SymptomEditModal onClose={() => setShowSymptomEdit(false)} />}
      {showParentNotify && <ParentNotifyModal onClose={() => { setShowParentNotify(false); setParentSummary(parentNotifySummary()) }} />}
    </div>
  )
}
