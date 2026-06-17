// 나음 백엔드 공용 유틸 — 외부 의존성 없음(Node 내장 http만).
//  · JSON 파일 영속(server/.data/*.json)
//  · 아주 작은 라우터 + JSON 바디 파싱 + CORS
//  · SSE 허브(서버→클라이언트 실시간 push). 양방향이 필요 없으므로 WebSocket 대신 SSE 사용.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '.data')

/** JSON 파일 로드(없으면 fallback). */
export function loadJson(name, fallback) {
  try {
    const p = join(DATA_DIR, name)
    if (!existsSync(p)) return fallback
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}

/** JSON 파일 저장(디렉터리 자동 생성). */
export function saveJson(name, value) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(join(DATA_DIR, name), JSON.stringify(value, null, 2), 'utf8')
  } catch (e) {
    console.error('[naum] saveJson 실패', name, e)
  }
}

/** SSE 구독자 집합 — 채널별 응답 스트림을 들고 있다가 broadcast로 밀어줌. */
export function makeHub() {
  const subs = new Set()
  return {
    add(res) {
      subs.add(res)
      res.on('close', () => subs.delete(res))
    },
    broadcast(event, data) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      for (const res of subs) {
        try {
          res.write(frame)
        } catch {
          subs.delete(res)
        }
      }
    },
    get size() {
      return subs.size
    },
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS })
  res.end(JSON.stringify(body))
}

export function openSse(req, res, hub) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...CORS,
  })
  res.write('retry: 3000\n\n')
  hub.add(res)
  // keep-alive 핑(프록시 타임아웃 방지)
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      clearInterval(ping)
    }
  }, 25000)
  req.on('close', () => clearInterval(ping))
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve({})
      }
    })
  })
}

/**
 * 라우트 정의로 http 서버 생성.
 * routes: [{ method, pattern(RegExp, named groups), handler(req,res,{params,body}) }]
 */
export function makeServer(name, port, routes) {
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      return res.end()
    }
    const url = new URL(req.url, 'http://localhost')
    for (const r of routes) {
      if (r.method !== req.method) continue
      const m = url.pathname.match(r.pattern)
      if (!m) continue
      const params = m.groups ?? {}
      const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {}
      try {
        return await r.handler(req, res, { params, body, query: url.searchParams })
      } catch (e) {
        console.error(`[${name}] handler error`, e)
        return sendJson(res, 500, { error: String(e) })
      }
    }
    sendJson(res, 404, { error: 'not found', path: url.pathname })
  })
  server.listen(port, () => console.log(`[naum:${name}] http://localhost:${port}`))
  return server
}
