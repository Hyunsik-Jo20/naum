// 부트로더 — 로컬 PII 저장소(암호화)를 먼저 복호한 뒤 앱 모듈을 로드한다.
//  명부·재식별 링크 등이 모듈 초기화 시 "동기"로 읽히기 때문에, 복호가 끝나기 전에
//  앱 모듈이 평가되면 안 된다(동적 import로 평가 시점을 미룸).
import { initSecureStore } from './data/secureStore'

void initSecureStore()
  .catch((e) => console.error('[naum:secure] init 실패 — 빈 값으로 진행', e))
  .finally(() => {
    void import('./appMain')
  })
