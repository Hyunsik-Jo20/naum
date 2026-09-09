// 앱 본체 — main.tsx(부트로더)가 secureStore 복호를 마친 뒤 동적 로드한다.
//  (명부 등 PII 로컬 데이터가 모듈 초기화 시 동기로 읽히므로 이 파일은 복호 이후에 평가돼야 함)
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { VisitsProvider } from './store/visits'
import { NoticeProvider } from './store/notices'
import { SchoolsProvider } from './store/schools'
import { AuthProvider } from './store/auth'
import { registerSW } from 'virtual:pwa-register'
import { syncSymptomsFromCloud } from './data/symptomsSync'
import { SECURE_UNLOCK_EVENT } from './data/secureStore'
import './index.css'

// 서비스워커 등록 — 앱 셸 캐시(오프라인 실행) + 새 버전 자동 업데이트.
registerSW({ immediate: true })

// 로컬 암호화 데이터(명부·일일업무기록)가 부팅 시 잠겼다가 복구되면 1회 새로고침.
//  명부는 모듈 초기화 때 확정되므로, 복구만으로는 화면에 반영되지 않는다(빈 명부로 오인 방지).
window.addEventListener(SECURE_UNLOCK_EVENT, () => {
  try {
    if (sessionStorage.getItem('naum.secure.reloaded')) return
    sessionStorage.setItem('naum.secure.reloaded', '1')
  } catch {
    /* ignore */
  }
  window.location.reload()
})

// 증상 목록 다기기 동기화 — 다른 기기(콘솔)에서 편집된 목록을 부팅 시 받아 반영.
//  변경이 있을 때만 1회 새로고침(로컬=클라우드가 되므로 루프 없음).
void syncSymptomsFromCloud().then((changed) => {
  if (changed) window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <VisitsProvider>
          <NoticeProvider>
            <SchoolsProvider>
              <App />
            </SchoolsProvider>
          </NoticeProvider>
        </VisitsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
