// 중앙(비식별) 서버 — :8788
//  저장: 비식별 Visit + 중계(등록 토큰, 반/학생 암호문 인박스).
//  원칙: 이름·반·번호·연락처·studentId 를 절대 받지도 저장하지도 않는다(코드로 강제).
import { loadJson, saveJson, makeHub, makeServer, sendJson, openSse } from './lib.mjs'

const PORT = 8788

// ── 상태 ──
let visits = loadJson('central.visits.json', []) // 비식별 Visit[]
let relay = loadJson('central.relay.json', { reg: [], classInbox: [], studentInbox: [] })

const visitHub = makeHub()
const relayHub = makeHub()

const persistVisits = () => saveJson('central.visits.json', visits)
const persistRelay = () => saveJson('central.relay.json', relay)

// PII로 간주해 거부하는 키 — 이 중 하나라도 있으면 400.
const FORBIDDEN = ['name', 'classNo', 'number', 'guardianPhone', 'studentId', 'phone']
function rejectsPii(obj) {
  if (!obj || typeof obj !== 'object') return null
  for (const k of FORBIDDEN) if (k in obj) return k
  return null
}

const routes = [
  { method: 'GET', pattern: /^\/central\/health$/, handler: (_q, res) => sendJson(res, 200, { ok: true, service: 'central', visits: visits.length }) },

  // ── 비식별 방문 ──
  { method: 'GET', pattern: /^\/central\/visits$/, handler: (_q, res) => sendJson(res, 200, visits) },

  {
    method: 'POST',
    pattern: /^\/central\/visits$/,
    handler: (_q, res, { body }) => {
      const bad = rejectsPii(body)
      if (bad) return sendJson(res, 400, { error: `비식별 서버는 PII를 받지 않습니다: '${bad}'` })
      if (!body.id) return sendJson(res, 400, { error: 'id 필요' })
      const i = visits.findIndex((v) => v.id === body.id)
      if (i >= 0) visits[i] = { ...visits[i], ...body }
      else visits.push(body)
      persistVisits()
      visitHub.broadcast('visit', body)
      sendJson(res, 200, body)
    },
  },

  {
    method: 'PATCH',
    pattern: /^\/central\/visits\/(?<id>[^/]+)$/,
    handler: (_q, res, { params, body }) => {
      const bad = rejectsPii(body)
      if (bad) return sendJson(res, 400, { error: `비식별 서버는 PII를 받지 않습니다: '${bad}'` })
      const i = visits.findIndex((v) => v.id === params.id)
      if (i < 0) return sendJson(res, 404, { error: 'visit 없음' })
      visits[i] = { ...visits[i], ...body, id: params.id }
      persistVisits()
      visitHub.broadcast('visit', visits[i])
      sendJson(res, 200, visits[i])
    },
  },

  { method: 'GET', pattern: /^\/central\/visits\/stream$/, handler: (req, res) => openSse(req, res, visitHub) },

  // ── 중계: 보호자 기기 등록(토큰↔채널, 이름 없음) ──
  {
    method: 'POST',
    pattern: /^\/central\/relay\/register$/,
    handler: (_q, res, { body }) => {
      if (!body.token) return sendJson(res, 400, { error: 'token 필요' })
      relay.reg = relay.reg.filter((r) => r.token !== body.token)
      relay.reg.push({ token: body.token, channel: `push-${body.token.slice(0, 6)}`, ts: body.ts ?? 0 })
      persistRelay()
      sendJson(res, 200, { ok: true })
    },
  },
  { method: 'GET', pattern: /^\/central\/relay\/reg$/, handler: (_q, res) => sendJson(res, 200, relay.reg) },

  // ── 중계: 반/학생 암호문 인박스(토큰 + 암호문만) ──
  { method: 'GET', pattern: /^\/central\/relay\/class$/, handler: (_q, res) => sendJson(res, 200, relay.classInbox) },
  {
    method: 'POST',
    pattern: /^\/central\/relay\/class$/,
    handler: (_q, res, { body }) => {
      // body: { classToken, events:[{classToken,studentToken,enc,ts}] } — 평문 없음
      const token = body.classToken
      relay.classInbox = relay.classInbox.filter((e) => e.classToken !== token).concat(body.events ?? [])
      persistRelay()
      relayHub.broadcast('class', { classToken: token })
      sendJson(res, 200, { ok: true, n: (body.events ?? []).length })
    },
  },
  { method: 'GET', pattern: /^\/central\/relay\/student$/, handler: (_q, res) => sendJson(res, 200, relay.studentInbox) },
  {
    method: 'POST',
    pattern: /^\/central\/relay\/student$/,
    handler: (_q, res, { body }) => {
      const token = body.studentToken
      relay.studentInbox = relay.studentInbox.filter((e) => e.studentToken !== token).concat(body.events ?? [])
      persistRelay()
      relayHub.broadcast('student', { studentToken: token })
      sendJson(res, 200, { ok: true, n: (body.events ?? []).length })
    },
  },
  { method: 'GET', pattern: /^\/central\/relay\/stream$/, handler: (req, res) => openSse(req, res, relayHub) },
]

makeServer('central', PORT, routes)
