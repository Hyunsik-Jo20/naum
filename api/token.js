// 나음(NaUM) 토큰 서버 — 발급/검증/보건교사 가입을 서버에서 HMAC 서명·게이팅.
//  왜: 기존 토큰은 클라이언트 번들의 학교 비밀에서 파생 → 누구나 번들에서 비밀을 꺼내 위조 가능.
//      또 계정 생성이 클라이언트 signUp(role 메타)라 토큰 없이도 보건교사 자칭 가입이 됐다.
//  해결: ① 토큰을 서버 전용 비밀로 HMAC 서명(위조 불가) ② 발급은 호출자 역할(Supabase JWT) 확인
//        ③ 가입은 service-role로 서버가 계정 생성하며 role을 app_metadata(클라 조작 불가)로 지정.
//  서버 미설정 시 501(not_configured) → 클라이언트는 기존 로컬 동작으로 폴백(데모 유지).
//  POST body: { action: 'issue'|'verify'|'signup', ... }
import crypto from 'crypto'

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/** payload → 'v1.<b64url(payload+exp)>.<b64url(hmac)>' */
function signToken(payloadObj, secret, ttlMs) {
  const body = { ...payloadObj, exp: Date.now() + ttlMs }
  const p = b64url(JSON.stringify(body))
  const mac = b64url(crypto.createHmac('sha256', secret).update(p).digest())
  return `v1.${p}.${mac}`
}

/** 토큰 검증 → payload(만료·서명 불일치면 null). 타이밍 세이프 비교. */
function verifyToken(token, secret) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const p = parts[1]
  const mac = parts[2]
  const expected = b64url(crypto.createHmac('sha256', secret).update(p).digest())
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let body
  try {
    body = JSON.parse(unb64url(p).toString('utf8'))
  } catch {
    return null
  }
  if (!body || typeof body.exp !== 'number' || Date.now() > body.exp) return null
  return body
}

/** Authorization: Bearer <supabase jwt> → { role, org } (profiles 권위값, service-role 조회). */
async function callerProfile(req, SB_URL, SERVICE, ANON) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return null
  try {
    const ur = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${m[1]}` },
    })
    if (!ur.ok) return null
    const user = await ur.json()
    if (!user || !user.id) return null
    const pr = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,org`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    )
    if (!pr.ok) return null
    const rows = await pr.json()
    return Array.isArray(rows) && rows[0] ? rows[0] : null
  } catch {
    return null
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

// 발급 payload 화이트리스트(불필요 필드 주입 방지)
function sanitizeLogin(p) {
  if (p.r === 't') return { r: 't', g: Number(p.g), c: Number(p.c) }
  if (p.r === 'p') return { r: 'p', sid: String(p.sid || ''), n: String(p.n || '') }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const SECRET = process.env.TOKEN_SIGNING_SECRET
  const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const EDU_SECRET = process.env.EDU_ISSUE_SECRET
  // 서버 전용 값이 없으면 not_configured → 클라이언트가 로컬 폴백(데모/미설정 유지).
  if (!SECRET || !SB_URL || !SERVICE) return res.status(501).json({ error: 'not_configured' })

  const body = await readBody(req)
  const action = body && body.action

  try {
    if (action === 'issue') {
      const payload = body.payload || {}
      // 로그인 토큰(교사/학부모) — 보건교사만 발급 가능.
      if (payload.r === 't' || payload.r === 'p') {
        const prof = await callerProfile(req, SB_URL, SERVICE, ANON)
        if (!prof || prof.role !== 'nurse') return res.status(403).json({ error: 'nurse_required' })
        const clean = sanitizeLogin(payload)
        if (!clean) return res.status(400).json({ error: 'bad_payload' })
        return res.status(200).json({ token: signToken(clean, SECRET, 30 * 24 * 3600 * 1000) })
      }
      // 가입 토큰(보건교사) — 교육청 계정(JWT role=edu) 또는 발급 비밀(EDU_ISSUE_SECRET).
      if (payload.r === 'n') {
        const prof = await callerProfile(req, SB_URL, SERVICE, ANON)
        const secretHdr = req.headers['x-issue-secret']
        const eduOk =
          (prof && prof.role === 'edu') ||
          (EDU_SECRET && secretHdr && secretHdr === EDU_SECRET)
        if (!eduOk) return res.status(403).json({ error: 'edu_required' })
        return res
          .status(200)
          .json({ token: signToken({ r: 'n', org: String(payload.org || '') }, SECRET, 14 * 24 * 3600 * 1000) })
      }
      return res.status(400).json({ error: 'bad_role' })
    }

    if (action === 'verify') {
      const p = verifyToken(body.token, SECRET)
      if (!p) return res.status(400).json({ error: 'invalid_token' })
      const { exp, ...payload } = p // eslint-disable-line no-unused-vars
      return res.status(200).json({ payload })
    }

    if (action === 'signup') {
      const p = verifyToken(body.token, SECRET)
      if (!p || p.r !== 'n') return res.status(403).json({ error: 'bad_token' })
      const email = String(body.email || '').trim()
      const password = String(body.password || '')
      const name = String(body.name || '').trim() || '보건교사'
      if (!email || password.length < 6) return res.status(400).json({ error: 'bad_input' })
      // service-role로 계정 생성 — role은 app_metadata(클라이언트가 조작 불가)로 지정.
      const cr = await fetch(`${SB_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true, // 토큰이 곧 인가 → 즉시 로그인 가능(이메일 확인 대체)
          user_metadata: { name },
          app_metadata: { role: 'nurse', org: p.org || '' },
        }),
      })
      if (cr.ok) return res.status(200).json({ ok: true })
      const t = await cr.text()
      if (/registered|already|exist|duplicate/i.test(t)) return res.status(409).json({ error: 'exists' })
      return res.status(502).json({ error: 'create_failed', detail: t.slice(0, 200) })
    }

    return res.status(400).json({ error: 'unknown_action' })
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e).slice(0, 200) })
  }
}
