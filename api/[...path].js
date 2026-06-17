// 공공데이터포털(data.go.kr) 프록시 — 단일 catch-all 서버리스 함수(self-contained).
//  /api/<svc>/<endpoint>?params → data.go.kr 대응 서비스로 중계, serviceKey를 서버측 주입.
//  개발 환경의 vite.config 프록시와 동일 역할(브라우저에 키 미노출).
const TARGETS = {
  kma: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0',
  kmawrn: 'https://apis.data.go.kr/1360000/WthrWrnInfoService',
  kmaeqk: 'https://apis.data.go.kr/1360000/EqkInfoService',
  airstn: 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc',
  air: 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc',
}

export default async function handler(req, res) {
  const key = process.env.DATAGOKR_KEY || ''
  const { path = [], ...q } = req.query || {}
  const segs = Array.isArray(path) ? path : [path]
  const svc = segs[0]
  const base = TARGETS[svc]
  if (!base) {
    res.status(404).json({ error: 'unknown service', svc })
    return
  }
  const sub = segs.slice(1).join('/')

  // serviceKey는 Encoding 키(이미 URL-encoded)라 재인코딩 없이 그대로 덧붙인다.
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x))
    else if (v != null) params.set(k, String(v))
  }
  let url = `${base}/${sub}`
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
