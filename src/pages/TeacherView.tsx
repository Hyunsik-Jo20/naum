import { useEffect, useMemo, useState } from 'react'
import { useVisits } from '../store/visits'
import { useAuth } from '../store/auth'
import { getClassToken } from '../data/routingTokens'
import { classStudentMap, stationEmitClass, type ClassPayload } from '../data/station'
import { loadClassInbox } from '../data/relay'
import { decryptJson, getClassKey } from '../data/e2e'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import { students as allStudents } from '../data/mock'
import * as cloudRelay from '../api/supabaseRelay'
import { buildTeacherLine } from '../data/notifyText'

function clock(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Evt = { studentToken: string; ts: number; payload: ClassPayload | null }
type TokenInfo = { name: string; number: number }

export default function TeacherView() {
  const { session } = useAuth()
  const { visits, studentOf } = useVisits()
  const grade = session?.grade ?? 0
  const classNo = session?.classNo ?? 0

  const [events, setEvents] = useState<Evt[]>([])
  const [tokenMap, setTokenMap] = useState<Record<string, TokenInfo>>({})

  // 우리 반 학생(명부 — 클라이언트 번들)
  const classStudents = useMemo(
    () => allStudents.filter((s) => s.grade === grade && s.classNo === classNo).sort((a, b) => a.number - b.number),
    [grade, classNo],
  )

  // ── 클라우드(supabase) 모드: 나음 스테이션이 발신한 우리 반 이벤트를 Supabase relay에서 수신·복호화 ──
  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    let ok = true
    let unsub: (() => void) | null = null
    const refresh = async () => {
      const evs = await cloudRelay.loadClassEvents(grade, classNo)
      if (ok) setEvents(evs)
    }
    ;(async () => {
      setTokenMap(await cloudRelay.buildClassTokenMap(classStudents))
      await refresh()
      unsub = await cloudRelay.subscribeClass(grade, classNo, () => void refresh())
    })()
    return () => {
      ok = false
      unsub?.()
    }
  }, [grade, classNo, classStudents])

  // ── 로컬/데모 모드: 기존 동일-브라우저 시뮬(스테이션 emit → localStorage 인박스 수신) ──
  useEffect(() => {
    if (SUPABASE_ENABLED) return
    let ok = true
    const classToken = getClassToken(grade, classNo)
    const map = classStudentMap(grade, classNo)
    setTokenMap(Object.fromEntries(map.map((m) => [m.token, { name: m.name, number: m.number }])))
    ;(async () => {
      await stationEmitClass(grade, classNo, visits, studentOf)
      const raw = loadClassInbox(classToken)
      const key = await getClassKey(grade, classNo)
      const dec = await Promise.all(
        raw.map(async (e) => ({
          studentToken: e.studentToken,
          ts: e.ts,
          payload: await decryptJson<ClassPayload>(key, e.enc).catch(() => null),
        })),
      )
      if (ok) setEvents(dec)
    })()
    return () => {
      ok = false
    }
  }, [visits, grade, classNo, studentOf])

  const resolve = (token: string) => tokenMap[token]

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 600 }}>
        {grade}학년 {classNo}반 · 보건실 알림
      </h2>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        담임 <b>{session?.name}</b> 선생님 · 우리 반 학생 알림
      </div>
      <div className="route-note" style={{ margin: '0 0 12px' }}>
        <i className="ti ti-shield-lock" aria-hidden="true" /> 보건실에 직접 접근하지 않습니다 — 중계 서버의 <b>우리 반 채널</b>로
        <b>토큰 + 암호문</b>만 수신하고, <b>반 키로 복호화</b> + <b>반 한정 매핑</b>으로 확인합니다. (서버는 토큰·암호문만, 내용 못 봄)
      </div>

      {events.length === 0 ? (
        <div className="card"><div className="col-empty">오늘 우리 반 보건실 방문 알림이 없습니다.</div></div>
      ) : (
        <div className="card">
          {events.map((e, i) => {
            const who = resolve(e.studentToken)
            const p = e.payload
            const done = p?.kind === '종료'
            return (
              <div key={i} className="evt-row">
                <div className="evt-main">
                  <div className="evt-name">
                    {who ? `${who.name}` : '(미상)'}{' '}
                    <span className="muted-inline">{who ? `${who.number}번` : ''}</span>
                  </div>
                  <div className="evt-sym">
                    {!p ? '(복호화 실패)' : buildTeacherLine(p)}
                  </div>
                </div>
                <div className="evt-side">
                  <span className={`pill ${done ? 'success' : 'warn'}`}>{p?.kind ?? '—'}</span>
                  <span className="evt-time">{clock(e.ts)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.7 }}>
        담임은 <b>자기 반</b> 채널만 받고, 이름은 학교가 내려준 <b>반 한정 매핑</b>으로 풉니다. 다른 반·전체 명부·보건실 데이터엔 접근하지 않습니다.
      </p>
    </div>
  )
}
