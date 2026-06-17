// 공공데이터포털(data.go.kr) 프록시 — 평범한 단일 함수(브래킷 catch-all 회피).
//  vercel.json 의 rewrite 가 /api/<svc>/<endpoint> → /api/proxy?svc=&endpoint= 로 보냄.
//  serviceKey(서버 전용)를 주입하고 원본 쿼리는 그대로 전달. (개발 vite 프록시와 동일 역할)
const TARGETS = {
  kma: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0',
  kmawrn: 'https://apis.data.go.kr/1360000/WthrWrnInfoService',
  kmaeqk: 'https://apis.data.go.kr/1360000/EqkInfoService',
  airstn: 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc',
  air: 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc',
}

export default async function handler(req, res) {
  const key = process.env.DATAGOKR_KEY || ''
  const { svc, endpoint, ...q } = req.query || {}
  const base = TARGETS[svc]
  if (!base || !endpoint) {
    res.status(404).json({ error: 'unknown service/endpoint', svc, endpoint })
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
    res.status(r.status).send(body)
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(e) })
  }
}
