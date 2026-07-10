// 공공데이터포털(data.go.kr) 프록시 — 평범한 단일 함수(브래킷 catch-all 회피).
//  vercel.json 의 rewrite 가 /api/<svc>/<endpoint> → /api/proxy?svc=&endpoint= 로 보냄.
//  serviceKey(서버 전용)를 주입하고 원본 쿼리는 그대로 전달. (개발 vite 프록시와 동일 역할)
//
//  보안:
//   · svc 는 아래 TARGETS 화이트리스트로만 허용, endpoint 는 영숫자/밑줄 단일 세그먼트만(경로 조작 차단).
//   · 타 도메인 핫링크 차단(Origin/Referer 검사 — 동일출처/로컬만, 헤더 없으면 통과해 앱은 안 깨짐).
//   · 성공 응답은 CDN 캐시(s-maxage) → 상류(data.go.kr) 호출·쿼터 절감.
//   · 경량 IP 버스트 제한(인스턴스 로컬, 베스트에포트 — 분산 제한은 Vercel KV 등 필요).
const TARGETS = {
  kma: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0',
  kmawrn: 'https://apis.data.go.kr/1360000/WthrWrnInfoService',
  kmaeqk: 'https://apis.data.go.kr/1360000/EqkInfoService',
  airstn: 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc',
  air: 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc',
}

const ENDPOINT_RE = /^[A-Za-z0-9_]+$/ // data.go.kr 오퍼레이션명(getXxx)만

// 타 사이트 핫링크 차단. 동일출처 GET은 Origin이 없을 수 있어 "헤더가 있고 외부일 때만" 거부(앱 무중단).
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

// 인스턴스 로컬 슬라이딩 윈도 — 단일 소스 폭주 완화(베스트에포트). 운영 분산 제한은 KV/WAF 권장.
const HITS = new Map()
const RL_WINDOW = 60_000
const RL_MAX = 300 // 분당/IP. CDN 캐시로 함수 호출은 더 적음 + 학교 공유 IP 오탐 방지 위해 넉넉히.
function rateLimited(ip) {
  const now = Date.now()
  const arr = (HITS.get(ip) || []).filter((t) => now - t < RL_WINDOW)
  arr.push(now)
  HITS.set(ip, arr)
  if (HITS.size > 5000) HITS.clear() // 메모리 폭주 방지(러프)
  return arr.length > RL_MAX
}

export default async function handler(req, res) {
  const key = process.env.DATAGOKR_KEY || ''
  const { svc, endpoint, ...q } = req.query || {}
  const base = TARGETS[svc]
  if (!base || !endpoint) {
    res.status(404).json({ error: 'unknown service/endpoint' })
    return
  }
  if (!ENDPOINT_RE.test(String(endpoint))) {
    res.status(400).json({ error: 'invalid endpoint' })
    return
  }
  if (!originAllowed(req)) {
    res.status(403).json({ error: 'forbidden origin' })
    return
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) {
    res.setHeader('Retry-After', '60')
    res.status(429).json({ error: 'rate limited' })
    return
  }

  // serviceKey는 Encoding 키(이미 URL-encoded)라 재인코딩 없이 그대로 덧붙인다.
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x))
    else if (v != null) params.set(k, String(v))
  }
  let url = `${base}/${endpoint}`
  const qs = params.toString()
  if (qs) url += `?${qs}`
  url += (url.includes('?') ? '&' : '?') + 'serviceKey=' + key

  try {
    const r = await fetch(url)
    const body = await r.text()
    res.setHeader('content-type', r.headers.get('content-type') || 'application/xml; charset=utf-8')
    // 성공분만 CDN 캐시(날씨·특보는 분 단위로 갱신 → 5분 캐시 안전). 오류는 캐시 안 함.
    if (r.status === 200) res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    res.status(r.status).send(body)
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(e) })
  }
}
