import { useState } from 'react'
import { Link } from 'react-router-dom'
import { classLabel, findStudent, students } from '../data/mock'
import {
  allRoutingTokens,
  clearRoutingTokens,
  getRoutingToken,
  studentIdOfToken,
  tokenShort,
} from '../data/routingTokens'
import {
  clearRelay,
  isRegistered,
  loadInbox,
  loadReg,
  relayDeliver,
  relayRegister,
  type RelayMsg,
} from '../data/relay'
import type { Student } from '../types'

const BODY: Record<RelayMsg['kind'], string> = {
  접수: '자녀가 보건실에 접수되었습니다. 처치 후 다시 안내드립니다.',
  종료: '보건실 처치가 끝났습니다. 결과: 교실 복귀.',
}

function clock(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ParentRouting() {
  const demoStudents = students.slice(0, 8)
  const [tokens, setTokens] = useState<Record<string, string>>(() => allRoutingTokens())
  const [reg, setReg] = useState(() => loadReg())
  const [inbox, setInbox] = useState<RelayMsg[]>(() => loadInbox())
  const [err, setErr] = useState('')

  function doRegister(s: Student) {
    const token = getRoutingToken(s.id)
    setReg(relayRegister(token))
    setTokens(allRoutingTokens())
    setErr('')
  }
  function doSend(s: Student, kind: RelayMsg['kind']) {
    const token = getRoutingToken(s.id)
    setTokens(allRoutingTokens())
    if (!isRegistered(token)) {
      setErr(`${s.name} 보호자가 아직 등록되지 않았습니다. 먼저 "보호자 등록"을 누르세요.`)
      return
    }
    setErr('')
    setInbox(relayDeliver(token, kind, BODY[kind]))
  }
  function resetDemo() {
    clearRoutingTokens()
    clearRelay()
    setTokens({})
    setReg([])
    setInbox([])
    setErr('')
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Link to="/" className="muted" style={{ fontSize: 12, textDecoration: 'none' }}>
            <i className="ti ti-arrow-left" style={{ verticalAlign: -2 }} aria-hidden="true" /> 홈
          </Link>
          <h2 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 600 }}>보호자 알림 · 익명 토큰 라우팅</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            이름↔토큰은 보건실 로컬에만 · 서버는 토큰만 앎 · 보호자는 자기 자녀만 앎
          </div>
        </div>
        <button className="btn ghost small" onClick={resetDemo}>
          <i className="ti ti-rotate" aria-hidden="true" /> 데모 초기화
        </button>
      </div>

      {err && <div className="ai-err" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="route-demo-grid">
        {/* 1. 보건실 로컬 (PII) */}
        <div className="card route-col">
          <div className="route-head local">
            <i className="ti ti-lock" aria-hidden="true" /> 보건실 로컬 <span>이름 ↔ 토큰 (PII)</span>
          </div>
          <p className="route-desc">학생마다 안정적 난수 토큰을 발급. 매핑은 이 기기에만 있습니다.</p>
          <div className="route-students">
            {demoStudents.map((s) => {
              const token = tokens[s.id]
              const registered = !!token && reg.some((r) => r.token === token)
              return (
                <div key={s.id} className="route-student">
                  <div className="rs-info">
                    <span className="rs-name">{s.name} <span className="muted-inline">{classLabel(s)}</span></span>
                    <span className="rs-token">
                      {token ? <>토큰 <code>{tokenShort(token)}…</code></> : <span className="muted-inline">토큰 미발급</span>}
                      {registered && <span className="rs-reg"><i className="ti ti-check" aria-hidden="true" /> 등록됨</span>}
                    </span>
                  </div>
                  <div className="rs-actions">
                    {!registered ? (
                      <button className="btn ghost small" onClick={() => doRegister(s)} title="보호자 QR 등록(시뮬)">
                        <i className="ti ti-qrcode" aria-hidden="true" /> 보호자 등록
                      </button>
                    ) : (
                      <>
                        <button className="btn small" onClick={() => doSend(s, '접수')}>접수 알림</button>
                        <button className="btn ghost small" onClick={() => doSend(s, '종료')}>종료 알림</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 2. 중계 서버 (익명) */}
        <div className="card route-col">
          <div className="route-head server">
            <i className="ti ti-server" aria-hidden="true" /> 중계 서버 <span>토큰만 — 이름·전화 없음</span>
          </div>
          <div className="route-sub">등록 (토큰 ↔ 채널)</div>
          {reg.length === 0 ? (
            <div className="col-empty">등록된 토큰이 없습니다.</div>
          ) : (
            <div className="route-rows">
              {reg.map((r) => (
                <div key={r.token} className="route-row mono">
                  <code>{tokenShort(r.token)}…</code> → {r.channel}
                </div>
              ))}
            </div>
          )}
          <div className="route-sub" style={{ marginTop: 10 }}>발송 로그 (토큰으로 배달)</div>
          {inbox.length === 0 ? (
            <div className="col-empty">발송 내역이 없습니다.</div>
          ) : (
            <div className="route-rows">
              {inbox.map((m, i) => (
                <div key={i} className="route-row mono">
                  <code>{tokenShort(m.token)}…</code> · {m.kind} · {clock(m.ts)}
                </div>
              ))}
            </div>
          )}
          <p className="route-note"><i className="ti ti-eye-off" aria-hidden="true" /> 서버는 누구인지 모릅니다. 토큰·채널·이벤트만 처리.</p>
        </div>

        {/* 3. 보호자 휴대폰 */}
        <div className="card route-col">
          <div className="route-head parent">
            <i className="ti ti-device-mobile" aria-hidden="true" /> 보호자 휴대폰 <span>자기 자녀만 앎</span>
          </div>
          <p className="route-desc">토큰으로 도착한 알림을 보호자 기기가 자녀로 풀어 표시합니다.</p>
          {inbox.length === 0 ? (
            <div className="col-empty">받은 알림이 없습니다.</div>
          ) : (
            <div className="route-rows">
              {inbox.map((m, i) => {
                const sid = studentIdOfToken(m.token)
                const child = sid ? findStudent(sid) : undefined
                return (
                  <div key={i} className="parent-msg">
                    <div className="pm-top">
                      <i className="ti ti-bell" aria-hidden="true" /> {child ? `${child.name}(${classLabel(child)})` : '자녀'} · 보건실 {m.kind}
                      <span className="pm-time">{clock(m.ts)}</span>
                    </div>
                    <div className="pm-body">{m.body}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.7 }}>
        <b>흐름:</b> ① 보건실 로컬이 학생별 난수 토큰 발급 → ② 보호자가 QR로 토큰↔기기 채널 등록(서버에 토큰만 저장) →
        ③ 방문 시 로컬이 "토큰 T에 접수/종료" 전송 → 서버가 토큰 채널로 배달 → ④ 보호자 기기만 그게 자기 자녀임을 압니다.
        실제 운영에선 채널 = 앱 푸시/web-push(전화번호 불필요), 또는 연락처 게이트웨이 분리(알림톡).
      </p>
    </div>
  )
}
