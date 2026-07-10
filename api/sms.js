// 솔라피(Solapi) 문자·알림톡 발송 — 서버 전용 키로 발송(키·발신번호는 서버 보관, 브라우저 미노출).
//  · 보건교사(Supabase JWT role=nurse)만 발송 가능. 수신번호·본문은 발송 시점에만 전달(서버 미저장).
//  · SMS/LMS: { to, text }.  알림톡: { to, templateId, variables }(SOLAPI_PF_ID 설정 시, 실패 시 문자 대체).
//  · 환경변수 미설정 시 501(not_configured) → 클라이언트는 조용히 비활성(앱 무중단).
//  env: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER(발신번호), SOLAPI_PF_ID(선택, 카카오 채널)
//       + 인증용 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (token.js와 공유)
import crypto from 'crypto'

const SOLAPI_SEND = 'https://api.solapi.com/messages/v4/send'
const PHONE_RE = /^0\d{9,10}$/ // 국내 번호(하이픈 제거 후 10~11자리)

// 인스턴스 로컬 발송 제한(문자는 과금 → 낮게). 운영은 KV 권장.
const HITS = new Map()
function rateLimited(ip, max = 30, win = 60_000) {
  const now = Date.now()
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win)
  arr.push(now)
  HITS.set(ip, arr)
  if (HITS.size > 5000) HITS.clear()
  return arr.length > max
}

// 호출자가 보건교사인지 확인(Supabase JWT + profiles.role).
async function isNurse(req, SB_URL, SERVICE, ANON) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return false
  try {
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${m[1]}` } })
    if (!ur.ok) return false
    const user = await ur.json()
    if (!user?.id) return false
    const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    })
    if (!pr.ok) return false
    const rows = await pr.json()
    return Array.isArray(rows) && rows[0]?.role === 'nurse'
  } catch {
    return false
  }
}

// Solapi HMAC-SHA256 인증 헤더.
function authHeader(apiKey, apiSecret) {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(32).toString('hex')
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex')
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const API_KEY = process.env.SOLAPI_API_KEY
  const API_SECRET = process.env.SOLAPI_API_SECRET
  const SENDER = process.env.SOLAPI_SENDER
  const PF_ID = process.env.SOLAPI_PF_ID
  const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!API_KEY || !API_SECRET || !SENDER || !SB_URL || !SERVICE) return res.status(501).json({ error: 'not_configured' })

  if (!(await isNurse(req, SB_URL, SERVICE, ANON))) return res.status(403).json({ error: 'nurse_required' })

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'rate_limited' }) }

  const body = await readBody(req)
  const to = String(body.to || '').replace(/[^0-9]/g, '')
  const text = String(body.text || '').trim()
  const templateId = body.templateId ? String(body.templateId) : ''
  if (!PHONE_RE.test(to)) return res.status(400).json({ error: 'bad_phone' })
  if (!templateId && (!text || text.length > 2000)) return res.status(400).json({ error: 'bad_text' })

  const message = { to, from: SENDER }
  if (templateId && PF_ID) {
    message.type = 'ATA' // 알림톡
    message.kakaoOptions = { pfId: PF_ID, templateId, variables: body.variables || {}, disableSms: false }
    if (text) message.text = text // 대체발송(문자) 본문
  } else {
    message.text = text // SMS/LMS(길면 자동 LMS)
  }

  try {
    const r = await fetch(SOLAPI_SEND, {
      method: 'POST',
      headers: { Authorization: authHeader(API_KEY, API_SECRET), 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const out = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(502).json({ error: 'send_failed', detail: out })
    return res.status(200).json({ ok: true, groupId: out.groupId, statusCode: out.statusCode })
  } catch (e) {
    return res.status(502).json({ error: 'send_failed', detail: String(e).slice(0, 200) })
  }
}
