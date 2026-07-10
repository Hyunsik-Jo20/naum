// 함수 배포 확인용 헬스체크. /api/health → {ok:true}
//  (키 설정 여부 등 내부 상태는 노출하지 않는다.)
export default function handler(_req, res) {
  res.status(200).json({ ok: true, service: 'naum-api' })
}
