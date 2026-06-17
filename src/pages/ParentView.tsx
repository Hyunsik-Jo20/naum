import { useEffect, useState } from 'react'
import { classLabel, findStudent } from '../data/mock'
import { useVisits } from '../store/visits'
import { useAuth } from '../store/auth'
import { getRoutingToken } from '../data/routingTokens'
import { stationEmitStudent, type ClassPayload } from '../data/station'
import { loadStudentInbox } from '../data/relay'
import { decryptJson, getStudentKey } from '../data/e2e'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import * as cloudRelay from '../api/supabaseRelay'

function clock(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Evt = { ts: number; payload: ClassPayload | null }

export default function ParentView() {
  const { session } = useAuth()
  const { visits, studentOf } = useVisits()
  const childId = session?.childId ?? ''
  const child = childId ? findStudent(childId) : undefined
  const [events, setEvents] = useState<Evt[]>([])

  // ── 클라우드 모드: 자녀 채널을 Supabase relay에서 수신·복호화(다기기) ──
  useEffect(() => {
    if (!SUPABASE_ENABLED || !childId) return
    let ok = true
    let unsub: (() => void) | null = null
    const refresh = async () => {
      const evs = await cloudRelay.loadStudentEvents(childId)
      if (ok) setEvents(evs)
    }
    ;(async () => {
      await refresh()
      unsub = await cloudRelay.subscribeStudent(childId, () => void refresh())
    })()
    return () => {
      ok = false
      unsub?.()
    }
  }, [childId])

  // ── 로컬/데모 모드: 동일-브라우저 시뮬 ──
  useEffect(() => {
    if (SUPABASE_ENABLED || !childId) return
    let ok = true
    const studentToken = getRoutingToken(childId)
    ;(async () => {
      await stationEmitStudent(childId, visits, studentOf)
      const raw = loadStudentInbox(studentToken)
      const key = await getStudentKey(childId)
      const dec = await Promise.all(
        raw.map(async (e) => ({ ts: e.ts, payload: await decryptJson<ClassPayload>(key, e.enc).catch(() => null) })),
      )
      if (ok) setEvents(dec)
    })()
    return () => {
      ok = false
    }
  }, [childId, visits, studentOf])

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 600 }}>
        <i className="ti ti-device-mobile" style={{ verticalAlign: -2, color: 'var(--info)' }} aria-hidden="true" /> 자녀 보건실 알림
      </h2>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        {child ? <><b>{child.name}</b> ({classLabel(child)}) 보호자</> : '보호자'} · 자녀 알림만 표시됩니다.
      </div>
      <div className="route-note" style={{ margin: '0 0 12px' }}>
        <i className="ti ti-shield-lock" aria-hidden="true" /> 보건실에 직접 접근하지 않습니다 — 중계 서버로 <b>토큰 + 암호문</b>만 오고,
        <b>자녀 키로 복호화</b>해 표시합니다. (서버는 누구인지도, 내용도 못 봄)
      </div>

      {events.length === 0 ? (
        <div className="card"><div className="col-empty">자녀의 보건실 방문 알림이 없습니다.</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map((e, i) => {
            const p = e.payload
            const done = p?.kind === '종료'
            return (
              <div key={i} className="parent-msg">
                <div className="pm-top">
                  <i className="ti ti-bell" aria-hidden="true" /> 보건실 {done ? '처치 종료' : '접수'}
                  <span className="pm-time">{clock(e.ts)}</span>
                </div>
                <div className="pm-body">
                  {!p
                    ? '(복호화 실패)'
                    : done
                      ? `처치가 끝났습니다. 결과: ${p.outcome}.`
                      : `보건실에 접수되었습니다. 증상: ${p.sym || '확인 중'}. 처치 후 다시 안내드립니다.`}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.7 }}>
        학부모는 <b>자기 자녀</b>의 알림만 받습니다. 서버는 토큰·암호문만 — 식별도 복호화도 보호자 기기에서만 됩니다.
      </p>
    </div>
  )
}
