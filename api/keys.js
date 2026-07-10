// 학교 E2E 키·라우팅 토큰을 "서버에서" 파생해 인증·권한에 맞게만 발급.
//  왜: 기존엔 VITE_SCHOOL_LINK_SECRET(마스터 비밀)이 클라이언트 번들에 있어 누구나 추출→전교 복호 가능.
//  해결: 마스터 비밀을 서버 전용(SCHOOL_MASTER_SECRET)으로 이전. 파생 알고리즘은 클라이언트와 동일(SHA-256(secret:ns))
//        → 기존 암호문 그대로 복호(재암호화 불필요). 요청자 권한만큼만 키를 준다.
//   · 보건교사(Supabase JWT role=nurse): 자기 학교 links/class/student 키 전부.
//   · 교사(서명토큰 {r:'t',g,c}): 자기 반 class 키만.  · 학부모({r:'p',sid}): 자기 자녀 student 키만.
//   · 토큰(라우팅 해시, 복호 불가값)은 key 응답에 동봉 + studentTokens 배치(보건교사·교사).
//  SCHOOL_MASTER_SECRET 미설정 시 501 → 클라이언트는 기존 로컬 파생으로 폴백(무중단, Phase 1).
//  env: SCHOOL_MASTER_SECRET, TOKEN_SIGNING_SECRET, SUPABASE_URL/SERVICE_ROLE_KEY/ANON
import crypto from 'crypto'

const keyB64 = (master, ns) => crypto.createHash('sha256').update(`${master}:${ns}`).digest('base64')
const tokenHex = (master, input) => crypto.createHash('sha256').update(`${master}:token:${input}`).digest('hex').slice(0, 32)

// 서명 로그인 토큰 검증(token.js와 동일 HMAC).
const unb64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
function verifyLoginToken(token, secret) {
  const p = String(token || '').split('.')
  if (p.length !== 3 || p[0] !== 'v1') return null
  const mac = crypto.createHmac('sha256', secret).update(p[1]).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const a = Buffer.from(p[2]); const b = Buffer.from(mac)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let body; try { body = JSON.parse(unb64url(p[1]).toString('utf8')) } catch { return null }
  if (!body || typeof body.exp !== 'number' || Date.now() > body.exp) return null
  return body
}

async function isNurse(req, SB_URL, SERVICE, ANON) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return false
  try {
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${m[1]}` } })
    if (!ur.ok) return false
    const user = await ur.json()
    if (!user?.id) return false
    const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
    if (!pr.ok) return false
    const rows = await pr.json()
    return Array.isArray(rows) && (rows[0]?.role === 'nurse' || rows[0]?.role === 'edu')
  } catch { return false }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  const chunks = []; for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

// ns 문자열을 파싱해 토큰 권한과 대조. 반환 null=거부.
function entitled(ns, nurse, tok) {
  if (ns === 'links') return nurse ? { hasToken: false } : null
  let mm
  if ((mm = /^class:(\d+)-(\d+)$/.exec(ns))) {
    const g = Number(mm[1]), c = Number(mm[2])
    if (nurse) return { hasToken: true }
    if (tok?.r === 't' && Number(tok.g) === g && Number(tok.c) === c) return { hasToken: true }
    return null
  }
  if ((mm = /^student:(.+)$/.exec(ns))) {
    const sid = mm[1]
    if (nurse) return { hasToken: true }
    if (tok?.r === 'p' && String(tok.sid) === sid) return { hasToken: true }
    return null
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const MASTER = process.env.SCHOOL_MASTER_SECRET
  const TOKEN_SECRET = process.env.TOKEN_SIGNING_SECRET
  const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!MASTER || !SB_URL || !SERVICE) return res.status(501).json({ error: 'not_configured' })

  const body = await readBody(req)
  const nurse = await isNurse(req, SB_URL, SERVICE, ANON)
  const tok = !nurse && body.token && TOKEN_SECRET ? verifyLoginToken(body.token, TOKEN_SECRET) : null

  try {
    if (body.action === 'key') {
      const ns = String(body.ns || '')
      const ent = entitled(ns, nurse, tok)
      if (!ent) return res.status(403).json({ error: 'not_entitled' })
      return res.status(200).json({ key: keyB64(MASTER, ns), token: ent.hasToken ? tokenHex(MASTER, ns) : undefined })
    }
    if (body.action === 'studentTokens') {
      // 라우팅 토큰(복호 불가)만 — 보건교사 또는 유효 교사 토큰이면 허용.
      if (!nurse && tok?.r !== 't') return res.status(403).json({ error: 'not_entitled' })
      const sids = Array.isArray(body.sids) ? body.sids.slice(0, 500) : []
      const tokens = {}
      for (const sid of sids) tokens[String(sid)] = tokenHex(MASTER, `student:${sid}`)
      return res.status(200).json({ tokens })
    }
    return res.status(400).json({ error: 'unknown_action' })
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e).slice(0, 200) })
  }
}
