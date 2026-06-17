// 나음 백엔드 진입점 — 중앙(비식별) + 로컬 스테이션을 한 프로세스에서 기동.
//  운영 시엔 두 서버를 물리적으로 분리(학교 온프레미스 = station, 교육청/클라우드 = central).
//  개발 편의를 위해 `npm run server` 하나로 둘 다 띄운다.
import './central.mjs'
import './station.mjs'

console.log('[naum] 백엔드 기동: central :8788 (비식별) · station :8787 (PII 로컬)')
