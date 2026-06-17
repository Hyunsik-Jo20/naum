import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { VisitsProvider } from './store/visits'
import { NoticeProvider } from './store/notices'
import { SchoolsProvider } from './store/schools'
import { AuthProvider } from './store/auth'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

// 서비스워커 등록 — 앱 셸 캐시(오프라인 실행) + 새 버전 자동 업데이트.
registerSW({ immediate: true })

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
