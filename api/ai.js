// AI 호출 프록시 — API 키를 서버에만 두고, 로그인한 edu/nurse에게만 호출을 허용한다.
//  왜: 지금까지 AI 키는 브라우저 localStorage('naum.ai')에 평문으로 있었고, 브라우저가 제공자를
//      직접 호출해 개발자도구 네트워크 탭에 키가 그대로 보였다(Anthropic은 아예
//      'anthropic-dangerous-direct-browser-access'를 붙여야 했다). 호출 제한·비용 상한도 없었다.
//      SCHOOL_MASTER_SECRET을 서버로 옮긴 Phase 2와 같은 조치를 AI 키에도 적용한다.
//  범위(사용자 결정 2026-09-22): 우선 **교육청 감염병 심층 분석**만 이 경로를 쓴다.
//      보건교사 콘솔 AI 추천은 당분간 기존 개인 키 방식 유지(권한 게이트는 nurse도 미리 허용).
//  미설정(AI_API_KEY 없음) 시 501 → 클라이언트는 기존 로컬 키로 폴백(무중단, keys.js와 같은 패턴).
//
//  env: AI_PROVIDER(gemini|openai|anthropic|custom, 기본 gemini) · AI_API_KEY · AI_MODEL
//       · AI_BASE_URL(custom 전용)
//       · SUPABASE_URL(또는 VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY(또는 VITE_)

// Vercel에는 클라이언트용 VITE_ 이름으로만 들어 있을 수 있다 — keys.js·token.js·push.js와 같은 폴백.
const sbUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''

const MAX_INPUT = 24_000 // system+user 합계 상한(자). 브리프가 ~1.5KB라 넉넉하되 폭주는 막는다.
const MAX_OUTPUT_TOKENS = 2048
const ALLOWED_ROLES = new Set(['edu', 'nurse'])

// 타 사이트에서 남의 키로 토큰을 태우지 못하게. (헤더가 없으면 통과 — proxy.js와 동일 규칙)
function originAllowed(req) {
  const host = req.headers.host || ''
  const ref = req.headers.origin || req.headers.referer || ''
  if (!ref) return true
  try {
    const u = new URL(ref)
    return u.host === host || u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  } catch {
    return true
  }
}

// 인스턴스 로컬 슬라이딩 윈도(베스트에포트). AI는 프록시보다 비싸므로 훨씬 빡빡하게.
const HITS = new Map()
const RL_WINDOW = 60_000
const RL_MAX = 10 // 분당/IP
function rateLimited(ip) {
  const now = Date.now()
  const arr = (HITS.get(ip) || []).filter((t) => now - t < RL_WINDOW)
  arr.push(now)
  HITS.set(ip, arr)
  if (HITS.size > 5000) HITS.clear()
  return arr.length > RL_MAX
}

/** Supabase JWT → profiles.role. edu/nurse만 통과. (api/keys.js와 같은 방식) */
async function callerRole(req, SB_URL, SERVICE, ANON) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return null
  try {
    const ur = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${m[1]}` },
    })
    if (!ur.ok) return null
    const user = await ur.json()
    if (!user?.id) return null
    const pr = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,school_id`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    )
    if (!pr.ok) return null
    const rows = await pr.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || !ALLOWED_ROLES.has(row.role)) return null
    return { role: row.role, sch: String(row.school_id || '') }
  } catch {
    return null
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

async function readError(res) {
  let body = ''
  try { body = await res.text() } catch { /* ignore */ }
  try {
    const j = JSON.parse(body)
    body = j.error?.message || j.error || j.message || body
  } catch { /* keep raw */ }
  return `${res.status} ${res.statusText}${body ? ` — ${String(body).slice(0, 200)}` : ''}`
}

/** 제공자별 호출 — 클라이언트 data/ai.ts callAi와 요청 형태를 같게 유지(응답 차이 방지). */
async function generate({ provider, apiKey, model, baseUrl }, system, user) {
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    })
    if (!r.ok) throw new Error(await readError(r))
    const j = await r.json()
    return (j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '').trim()
  }

  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!r.ok) throw new Error(await readError(r))
    const j = await r.json()
    return (j.content?.map((c) => c.text ?? '').join('') ?? '').trim()
  }

  // openai · custom (OpenAI 호환)
  const base = provider === 'custom' ? String(baseUrl || '').replace(/\/$/, '') : 'https://api.openai.com/v1'
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!r.ok) throw new Error(await readError(r))
  const j = await r.json()
  return (j.choices?.[0]?.message?.content ?? '').trim()
}

export default async function handler(req, res) {
  const cfg = {
    provider: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    baseUrl: process.env.AI_BASE_URL || '',
  }
  const enabled = !!cfg.apiKey && !!cfg.model && (cfg.provider !== 'custom' || !!cfg.baseUrl)

  // 왜 못 쓰는지 — **이름만** 알려 준다(값은 절대 노출하지 않음).
  //  Vercel에 넣었는데 enabled:false로 보일 때 원인을 바로 짚기 위한 진단.
  const missing = []
  if (!cfg.apiKey) missing.push('AI_API_KEY')
  if (!cfg.model) missing.push('AI_MODEL')
  if (cfg.provider === 'custom' && !cfg.baseUrl) missing.push('AI_BASE_URL')
  if (!sbUrl()) missing.push('SUPABASE_URL(또는 VITE_SUPABASE_URL)')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')

  // GET = 가용성 확인. 키는 절대 돌려주지 않고 "쓸 수 있는지 + 모델명 + 빠진 변수 이름"만.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      enabled,
      provider: enabled ? cfg.provider : null,
      model: enabled ? cfg.model : null,
      missing,
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden origin' })
  // 미설정 → 501. 클라이언트가 기존 로컬 키로 폴백한다(무중단).
  if (!enabled) return res.status(501).json({ error: 'server AI not configured' })

  const SB_URL = sbUrl()
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!SB_URL || !SERVICE) return res.status(501).json({ error: 'supabase not configured' })

  const caller = await callerRole(req, SB_URL, SERVICE, ANON)
  if (!caller) return res.status(403).json({ error: '교육청·보건교사 계정으로 로그인해야 사용할 수 있습니다.' })

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) {
    res.setHeader('Retry-After', '60')
    return res.status(429).json({ error: '요청이 너무 잦습니다. 1분 뒤 다시 시도해 주세요.' })
  }

  const body = await readBody(req)
  const system = String(body.system || '')
  const user = String(body.user || '')
  if (!system || !user) return res.status(400).json({ error: 'system·user가 필요합니다.' })
  if (system.length + user.length > MAX_INPUT) return res.status(413).json({ error: '입력이 너무 깁니다.' })

  try {
    const text = await generate(cfg, system, user)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ text: text || '(빈 응답)', model: cfg.model, provider: cfg.provider })
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : 'AI 호출 실패' })
  }
}
