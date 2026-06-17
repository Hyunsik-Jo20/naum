// 로컬 스테이션(보건실 온프레미스) 서버 — :8787
//  저장: visitId ↔ studentId 링크(PII 재식별 키). 이건 학교 로컬에만 남는다.
//  게이트웨이: 방문 생성 시 링크는 로컬 저장, "비식별 Visit"만 중앙 서버로 전달(studentId 제거).
import { loadJson, saveJson, makeHub, makeServer, sendJson, openSse } from './lib.mjs'

const PORT = 8787
const CENTRAL = 'http://localhost:8788'

let links = loadJson('station.links.json', {}) // { [visitId]: studentId }
const linkHub = makeHub()
const persist = () => saveJson('station.links.json', links)

async function forwardToCentral(path, method, body) {
  try {
    const r = await fetch(`${CENTRAL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await r.json()
  } catch (e) {
    console.error('[naum:station] 중앙 서버 전달 실패', e.message)
    return null
  }
}

const routes = [
  { method: 'GET', pattern: /^\/station\/health$/, handler: (_q, res) => sendJson(res, 200, { ok: true, service: 'station', links: Object.keys(links).length }) },

  // 링크 맵(로컬 전용). 이름은 클라이언트가 로컬 명부로 복원하므로 여기엔 studentId만.
  { method: 'GET', pattern: /^\/station\/links$/, handler: (_q, res) => sendJson(res, 200, links) },

  {
    // 방문 생성: { visit(비식별), studentId } → 링크 로컬 저장 + 비식별 visit만 중앙으로.
    method: 'POST',
    pattern: /^\/station\/visits$/,
    handler: async (_q, res, { body }) => {
      const { visit, studentId } = body
      if (!visit?.id || !studentId) return sendJson(res, 400, { error: 'visit.id, studentId 필요' })
      links[visit.id] = studentId
      persist()
      linkHub.broadcast('link', { visitId: visit.id, studentId })
      // 중앙엔 studentId 없이 비식별 visit만 전달
      await forwardToCentral('/central/visits', 'POST', visit)
      sendJson(res, 200, { ok: true })
    },
  },

  { method: 'GET', pattern: /^\/station\/links\/stream$/, handler: (req, res) => openSse(req, res, linkHub) },
]

makeServer('station', PORT, routes)
