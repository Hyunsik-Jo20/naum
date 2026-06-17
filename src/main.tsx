import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { VisitsProvider } from './store/visits'
import { NoticeProvider } from './store/notices'
import { SchoolsProvider } from './store/schools'
import { AuthProvider } from './store/auth'
import './index.css'

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
