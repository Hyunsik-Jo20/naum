// 접수 도착 폰 푸시(Web Push) — 보건교사 기기(폰/PC)에 새 접수 알림.
//  · subscribe/unsubscribe: 보건교사(Supabase JWT)만. 구독은 push_subs(학교 스코프)에 저장.
//  · notify: 키오스크(비로그인)가 접수 직후 호출 — 학교의 모든 구독 기기로 발송.
//    내용은 비식별(개수만): "새 접수 — 대기 N명". 학교당 분당 발송 상한으로 남용 완화.
//  · pubkey: 클라이언트 구독용 VAPID 공개키 반환(클라이언트 env 불필요 — 재빌드 없이 교체 가능).
//  env: PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY, (선택) PUSH_VAPID_SUBJECT,
//       SUPABASE_URL/SERVICE_ROLE_KEY/ANON. 미설정 시 501 → 클라이언트는 기능 숨김/안내.
import webpush from 'web-push'

const SCH_RE = /^[a-z0-9_-]{1,32}$/i

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  const chunks = []; for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

/** 호출자가 보건교사면 { sch } 반환(keys.js와 동일 패턴). */
async function callerNurseSchool(req, SB_URL, SERVICE, ANON) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return null
  try {
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${m[1]}` } })
    if (!ur.ok) return null
    const user = await ur.json()
    if (!user?.id) return null
    const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,school_id`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
    if (!pr.ok) return null
    const rows = await pr.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || row.role !== 'nurse') return null
    return { sch: SCH_RE.test(String(row.school_id || '')) ? String(row.school_id) : 'demo' }
  } catch { return null }
}

// 학교당 발송 상한(웜 인스턴스 메모리 — 완화 목적의 가벼운 제한)
const rate = new Map() // sch -> { windowStart, count }
function rateOk(sch) {
  const now = Date.now()
  const r = rate.get(sch)
  if (!r || now - r.windowStart > 60000) { rate.set(sch, { windowStart: now, count: 1 }); return true }
  r.count += 1
  return r.count <= 10
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const PUB = process.env.PUSH_VAPID_PUBLIC_KEY
  const PRIV = process.env.PUSH_VAPID_PRIVATE_KEY
  const SUBJECT = process.env.PUSH_VAPID_SUBJECT || 'mailto:admin@naum.kr'
  const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!PUB || !PRIV || !SB_URL || !SERVICE) return res.status(501).json({ error: 'not_configured' })

  const sb = (path, init = {}) =>
    fetch(`${SB_URL}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', ...(init.headers || {}) },
    })

  const body = await readBody(req)
  try {
    if (body.action === 'pubkey') return res.status(200).json({ key: PUB })

    if (body.action === 'subscribe' || body.action === 'unsubscribe') {
      const nurseP = await callerNurseSchool(req, SB_URL, SERVICE, ANON)
      if (!nurseP) return res.status(403).json({ error: 'nurse_required' })
      const sub = body.sub
      const endpoint = String(sub?.endpoint || body.endpoint || '')
      if (!endpoint.startsWith('https://')) return res.status(400).json({ error: 'bad_subscription' })
      if (body.action === 'subscribe') {
        const r = await sb('push_subs?on_conflict=endpoint', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ endpoint, school_id: nurseP.sch, sub }),
        })
        if (!r.ok) return res.status(500).json({ error: 'store_failed' })
        return res.status(200).json({ ok: true })
      }
      await sb(`push_subs?endpoint=eq.${encodeURIComponent(endpoint)}&school_id=eq.${encodeURIComponent(nurseP.sch)}`, { method: 'DELETE' })
      return res.status(200).json({ ok: true })
    }

    if (body.action === 'notify') {
      const sch = SCH_RE.test(String(body.schoolId || '')) ? String(body.schoolId) : null
      if (!sch) return res.status(400).json({ error: 'bad_school' })
      if (!rateOk(sch)) return res.status(429).json({ error: 'rate_limited' })

      const sr = await sb(`push_subs?school_id=eq.${encodeURIComponent(sch)}&select=endpoint,sub`)
      const subs = sr.ok ? await sr.json() : []
      if (!Array.isArray(subs) || subs.length === 0) return res.status(200).json({ ok: true, sent: 0 })

      // 진행 중 인원(비식별) = 대기 + 처치 중 — 알림 본문·앱 배지에 사용.
      //  대기만 세면 빈 대기열에서 콘솔이 즉시 자동 처치 시작한 경우(+insert 도착 전 경합)
      //  0명이 되어 알림이 무의미해짐. 접수 직후 호출이므로 최소 1명으로 보정.
      let count = null
      try {
        const cr = await sb(`visits?school_id=eq.${encodeURIComponent(sch)}&status=in.(waiting,treating)&select=id`, {
          headers: { Prefer: 'count=exact', Range: '0-0' },
        })
        const range = cr.headers.get('content-range')
        const m2 = range && /\/(\d+)$/.exec(range)
        if (m2) count = Math.max(1, Number(m2[1]))
      } catch { /* 개수 없이 발송 */ }

      webpush.setVapidDetails(SUBJECT, PUB, PRIV)
      const payload = JSON.stringify({
        title: '보건실 새 접수',
        body: count != null ? `보건실에 온 학생 ${count}명 — 콘솔에서 확인하세요.` : '새 접수가 도착했어요. 콘솔에서 확인하세요.',
        count: count ?? undefined,
        url: '/nurse/queue',
      })
      let sent = 0
      await Promise.all(
        subs.map(async ({ endpoint, sub }) => {
          try {
            await webpush.sendNotification(sub, payload, { TTL: 600 })
            sent += 1
          } catch (e) {
            const code = e?.statusCode
            if (code === 404 || code === 410) {
              // 만료·해지된 구독 정리
              await sb(`push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' }).catch(() => {})
            }
          }
        }),
      )
      return res.status(200).json({ ok: true, sent })
    }

    return res.status(400).json({ error: 'unknown_action' })
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e).slice(0, 200) })
  }
}
