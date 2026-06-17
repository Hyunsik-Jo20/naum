// 함수 배포 확인용 헬스체크. /api/health → {ok:true}
export default function handler(_req, res) {
  res.status(200).json({ ok: true, service: 'naum-api', hasKey: Boolean(process.env.DATAGOKR_KEY) })
}
