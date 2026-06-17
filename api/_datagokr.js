// 공공데이터포털(data.go.kr) 프록시 공용 핸들러 (Vercel 서버리스).
//  개발 환경의 vite.config 프록시와 동일 역할: serviceKey를 서버측에서 주입(브라우저 미노출).
//  serviceKey는 "Encoding 인증키"라 이미 URL-encoded → 재인코딩하지 않고 그대로 덧붙인다.
//  파일명이 '_'로 시작해 라우트가 아니라 공용 모듈로만 import 된다.

/** base 타깃을 주면 [...path] 라우트용 핸들러를 만든다. */
export function makeProxy(base) {
  return async (req, res) => {
    const key = process.env.DATAGOKR_KEY || ''
    const { path = [], ...q } = req.query || {}
    const sub = Array.isArray(path) ? path.join('/') : String(path || '')

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
}
