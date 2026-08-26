import { useEffect, useMemo, useRef, useState } from 'react'
import { useVisits } from '../store/visits'
import { useAuth } from '../store/auth'
import { getClassToken } from '../data/routingTokens'
import { classStudentMap, stationEmitClass, type ClassPayload } from '../data/station'
import { loadClassInbox } from '../data/relay'
import { decryptJson, getClassKey } from '../data/e2e'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import { students as allStudents } from '../data/mock'
import { symptomTiles } from '../data/mock'
import * as cloudRelay from '../api/supabaseRelay'
import { buildTeacherLine } from '../data/notifyText'
import { sendNurseRequest } from '../data/nurseRequest'
import { classRoster, hasRoster, nameOf, setClassRoster, upsertOne, type TClassStudent } from '../data/teacherClassRoster'
import { parseRosterRows, parseRosterCsv, decodeBuffer, ROSTER_TEMPLATE } from '../data/localRoster'
import { readXlsxFirstSheet } from '../data/xlsxReader'
import { setBadge, clearBadge } from '../data/appBadge'

function clock(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Evt = { studentToken: string; ts: number; payload: ClassPayload | null }

export default function TeacherView() {
  const { session } = useAuth()
  const { visits, studentOf } = useVisits()
  const grade = session?.grade ?? 0
  const classNo = session?.classNo ?? 0

  const [events, setEvents] = useState<Evt[]>([])
  const [tokenMap, setTokenMap] = useState<Record<string, { name: string; number: number }>>({})
  const [rosterVer, setRosterVer] = useState(0) // 명부 변경 반영용
  const fileRef = useRef<HTMLInputElement>(null)

  // 교사 로컬 명부(번호→이름). 없으면 번호만.
  const roster = useMemo(() => classRoster(grade, classNo), [grade, classNo, rosterVer])
  const hasRoster0 = useMemo(() => hasRoster(grade, classNo), [grade, classNo, rosterVer])
  const nameByNo = (n?: number) => (n != null ? nameOf(grade, classNo, n) : undefined)

  // ── 보건실 알림 수신(보건교사→교사 relay) ──
  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    let ok = true
    let unsub: (() => void) | null = null
    const refresh = async () => { const evs = await cloudRelay.loadClassEvents(grade, classNo); if (ok) setEvents(evs) }
    ;(async () => {
      setTokenMap(await cloudRelay.buildClassTokenMap(allStudents.filter((s) => s.grade === grade && s.classNo === classNo)))
      await refresh()
      unsub = await cloudRelay.subscribeClass(grade, classNo, () => void refresh())
    })()
    return () => { ok = false; unsub?.() }
  }, [grade, classNo])

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
      const dec = await Promise.all(raw.map(async (e) => ({ studentToken: e.studentToken, ts: e.ts, payload: await decryptJson<ClassPayload>(key, e.enc).catch(() => null) })))
      if (ok) setEvents(dec)
    })()
    return () => { ok = false }
  }, [visits, grade, classNo, studentOf])

  // 이벤트의 번호 — 암호문 payload.number 우선(이름 없이도 식별), 없으면 토큰맵.
  const evNumber = (e: Evt) => e.payload?.number ?? tokenMap[e.studentToken]?.number
  const evName = (e: Evt) => nameByNo(evNumber(e))

  // ── 실행 아이콘 배지(설치형 PWA): 미확인 보건실 알림 개수 ──
  //  교사가 앱을 보고 있으면(visible) 읽음 처리 + 배지 제거. 앱이 백그라운드(다른 앱/탭)일 때
  //  새 알림이 오면 미확인 개수를 앱 아이콘 우측 상단에 숫자로 표시. 이름 없이 개수만 노출(비식별).
  useEffect(() => {
    if (session?.role !== 'teacher') return
    const seenKey = `naum.teacher.alertSeen.${grade}-${classNo}`
    const maxTs = events.reduce((m, e) => Math.max(m, e.ts), 0)
    const seenTs = () => { try { return Number(localStorage.getItem(seenKey) || '0') } catch { return 0 } }
    const sync = () => {
      if (document.visibilityState === 'visible') {
        try { localStorage.setItem(seenKey, String(maxTs)) } catch { /* ignore */ }
        clearBadge()
      } else {
        const seen = seenTs()
        setBadge(events.filter((e) => e.ts > seen).length)
      }
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [events, session?.role, grade, classNo])

  // 교사 화면을 떠나거나 로그아웃할 때 배지 정리.
  useEffect(() => () => clearBadge(), [])

  // ── 보건실로 보내기 ──
  const [sendNo, setSendNo] = useState('')
  const [sendSyms, setSendSyms] = useState<string[]>([])
  const [sendMsg, setSendMsg] = useState('')
  const toggleSym = (id: string) => setSendSyms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  async function doSend() {
    const n = Number(sendNo)
    if (!n || Number.isNaN(n)) { setSendMsg('학생 번호를 입력하세요.'); return }
    try {
      await sendNurseRequest({ kind: '보건실요청', grade, classNo, number: n, symIds: sendSyms })
      const nm = nameByNo(n)
      setSendMsg(`${n}번${nm ? ` (${nm})` : ''} 학생을 보건실로 보냈습니다. 보건교사가 접수합니다.`)
      setSendNo(''); setSendSyms([])
    } catch {
      setSendMsg('전송 실패 — 잠시 후 다시 시도하세요.')
    }
  }

  // ── 전학생 추가 ──
  const [tNo, setTNo] = useState('')
  const [tName, setTName] = useState('')
  const [tSex, setTSex] = useState<'남' | '여'>('남')
  const [tMsg, setTMsg] = useState('')
  async function doTransfer() {
    const n = Number(tNo)
    if (!n || !tName.trim()) { setTMsg('번호와 이름을 입력하세요.'); return }
    try {
      await sendNurseRequest({ kind: '전학안내', grade, classNo, number: n, name: tName.trim(), sex: tSex })
      upsertOne(grade, classNo, { number: n, name: tName.trim(), sex: tSex })
      setRosterVer((v) => v + 1)
      setTMsg(`전학생 ${n}번 ${tName.trim()} 을(를) 보건교사에게 안내했습니다.`)
      setTNo(''); setTName('')
    } catch {
      setTMsg('전송 실패 — 잠시 후 다시 시도하세요.')
    }
  }

  // ── 명부 업로드(엑셀/CSV) ──
  async function onUpload(file: File) {
    try {
      const buf = await file.arrayBuffer()
      const isXlsx = /\.xlsx$/i.test(file.name)
      const res = isXlsx ? parseRosterRows(await readXlsxFirstSheet(buf)) : parseRosterCsv(decodeBuffer(buf))
      if (res.error) { setSendMsg(`명부 오류: ${res.error}`); return }
      const mine: TClassStudent[] = res.students
        .filter((s) => s.grade === grade && s.classNo === classNo)
        .map((s) => ({ number: s.number, name: s.name, sex: s.sex }))
      if (!mine.length) { setSendMsg(`업로드한 명부에 ${grade}-${classNo} 학생이 없습니다.`); return }
      setClassRoster(grade, classNo, mine)
      setRosterVer((v) => v + 1)
      setSendMsg(`${grade}-${classNo} 명부 ${mine.length}명 적용됨. 이제 번호에 이름이 표시됩니다.`)
    } catch {
      setSendMsg('파일을 읽지 못했습니다.')
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 600 }}>{grade}학년 {classNo}반 · 보건실</h2>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>담임 <b>{session?.name}</b> 선생님</div>

      {/* 보건실로 보내기 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="sec-label" style={{ marginBottom: 8 }}><i className="ti ti-first-aid-kit" aria-hidden="true" /> 학생을 보건실로 보내기</div>
        <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label className="login-field" style={{ width: 120 }}>번호
            <input type="number" value={sendNo} placeholder="예: 15" onChange={(e) => setSendNo(e.target.value)} />
          </label>
          {sendNo && <span className="muted" style={{ fontSize: 13 }}>{nameByNo(Number(sendNo)) ? `→ ${nameByNo(Number(sendNo))}` : hasRoster0 ? '→ (명부에 없음)' : ''}</span>}
        </div>
        <div className="treat-grid" style={{ marginBottom: 8 }}>
          {symptomTiles.filter((t) => t.id !== 'unknown').map((t) => (
            <button key={t.id} className={`chip ${sendSyms.includes(t.id) ? 'on' : ''}`} onClick={() => toggleSym(t.id)}>
              {sendSyms.includes(t.id) && <i className="ti ti-check" aria-hidden="true" />} {t.label}
            </button>
          ))}
        </div>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={doSend}>
          <i className="ti ti-send" aria-hidden="true" /> 보건실로 보내기
        </button>
        {sendMsg && <div className="route-note" style={{ marginTop: 8 }}>{sendMsg}</div>}
      </div>

      {/* 전학생 추가 + 명부 업로드 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="sec-label" style={{ marginBottom: 8 }}><i className="ti ti-user-plus" aria-hidden="true" /> 전학생 추가 · 명부 업로드</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <label className="login-field" style={{ width: 90 }}>번호
            <input type="number" value={tNo} onChange={(e) => setTNo(e.target.value)} />
          </label>
          <label className="login-field" style={{ flex: 1, minWidth: 120 }}>이름
            <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="전학생 이름" />
          </label>
          <label className="login-field" style={{ width: 90 }}>성별
            <select value={tSex} onChange={(e) => setTSex(e.target.value as '남' | '여')}><option>남</option><option>여</option></select>
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={doTransfer}><i className="ti ti-user-plus" aria-hidden="true" /> 전학생 안내</button>
        </div>
        {tMsg && <div className="route-note" style={{ marginBottom: 8 }}>{tMsg}</div>}
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn ghost small" onClick={() => fileRef.current?.click()}><i className="ti ti-upload" aria-hidden="true" /> 반 명부 엑셀/CSV 업로드</button>
          <button
            className="btn ghost small"
            onClick={() => {
              const blob = new Blob(['﻿' + ROSTER_TEMPLATE], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = '반명부_양식.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            <i className="ti ti-download" aria-hidden="true" /> 양식 내려받기
          </button>
          <span className="muted" style={{ fontSize: 12 }}>{hasRoster0 ? `명부 ${roster.length}명 (이 기기에만 저장)` : '미업로드 — 번호만 표시'}</span>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.currentTarget.value = '' }} />
        </div>
      </div>

      {/* 받은 보건실 알림 */}
      <div className="sec-label" style={{ margin: '4px 0 6px' }}><i className="ti ti-bell" aria-hidden="true" /> 우리 반 보건실 알림</div>
      {events.length === 0 ? (
        <div className="card"><div className="col-empty">오늘 우리 반 보건실 방문 알림이 없습니다.</div></div>
      ) : (
        <div className="card">
          {events.map((e, i) => {
            const p = e.payload
            const done = p?.kind === '종료'
            const no = evNumber(e)
            const nm = evName(e)
            return (
              <div key={i} className="evt-row">
                <div className="evt-main">
                  <div className="evt-name">{nm ? nm : no != null ? `${no}번` : '(미상)'} {nm && no != null && <span className="muted-inline">{no}번</span>}</div>
                  <div className="evt-sym">{!p ? '(복호화 실패)' : buildTeacherLine(p)}</div>
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
        학생 이름은 <b>보건교사 명부</b>에만 있어 교사 화면엔 <b>번호</b>로 표시됩니다. 반 명부를 업로드하면 이 기기에서만 번호↔이름이 매칭됩니다.
      </p>
    </div>
  )
}
