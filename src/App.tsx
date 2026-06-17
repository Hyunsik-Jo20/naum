import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
// 라우트별 코드 분할 — 초기 번들 축소(특히 교육청 지도/차트). Login만 즉시 로드(진입).
const Home = lazy(() => import('./pages/Home'))
const Kiosk = lazy(() => import('./pages/Kiosk'))
const NurseQueue = lazy(() => import('./pages/NurseQueue'))
const NurseTreat = lazy(() => import('./pages/NurseTreat'))
const Notify = lazy(() => import('./pages/Notify'))
const Edu = lazy(() => import('./pages/Edu'))
const Principal = lazy(() => import('./pages/Principal'))
const RosterManager = lazy(() => import('./pages/RosterManager'))
const ParentRouting = lazy(() => import('./pages/ParentRouting'))
const TeacherView = lazy(() => import('./pages/TeacherView'))
const ParentView = lazy(() => import('./pages/ParentView'))
import QuickNoticeModal from './components/QuickNoticeModal'
import AutoNoticeSettings from './components/AutoNoticeSettings'
import HeaderWeather from './components/HeaderWeather'
import { useNotices } from './store/notices'
import { useAuth, type Role } from './store/auth'
import { ensurePushPermission } from './push'

function Protected({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { session, authLoading } = useAuth()
  // 클라우드 모드: 세션 복원 중에는 성급히 리다이렉트하지 않고 대기(딥링크/새로고침 보호).
  if (authLoading) return <div className="route-loading">불러오는 중…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!allow.includes(session.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const loc = useLocation()
  const isKiosk = loc.pathname.startsWith('/kiosk')
  const isLogin = loc.pathname.startsWith('/login')
  // 보건교사 콘솔은 일반 PC 모니터 — 좌우 여백 없이 가로로 넓게(세로 스크롤 최소화)
  const isWide = loc.pathname.startsWith('/nurse')
  const { session, logout } = useAuth()
  const { composeOpen, draft, openCompose, closeCompose, send, settingsOpen, openSettings, closeSettings, toast } =
    useNotices()

  return (
    <div className={`app-shell${isWide ? ' wide' : ''}`}>
      {!isKiosk && !isLogin && (
        <div className="topbar">
          <Link to="/" className="logo">
            나음 <span style={{ color: 'var(--info)' }}>NaUM</span>
          </Link>
          {session && (
            <button
              className="notice-quick"
              onClick={() =>
                openCompose({
                  to: session.role === 'edu' ? '학교' : session.role === 'nurse' ? '교육청' : '보건교사',
                })
              }
            >
              <i className="ti ti-send" aria-hidden="true" />{' '}
              {session.role === 'teacher' || session.role === 'parent' ? '보건실에 알리기' : '공지 보내기'}
            </button>
          )}
          {isWide ? <HeaderWeather /> : <span className="spacer" />}
          {session && (
            <span className="user-chip" title={session.org}>
              <i
                className={`ti ${
                  session.role === 'nurse'
                    ? 'ti-stethoscope'
                    : session.role === 'edu'
                      ? 'ti-building-bank'
                      : session.role === 'teacher'
                        ? 'ti-user'
                        : 'ti-device-mobile'
                }`}
                aria-hidden="true"
              />
              {session.name}
            </span>
          )}
          {/* 자동 공지 설정(임계치·지역/학교급 타깃팅)은 교육청 소관 — 보건교사 화면에는 표시하지 않음 */}
          {session?.role === 'edu' && (
            <button className="btn ghost small" onClick={openSettings} title="자동 공지 설정">
              <i className="ti ti-settings" aria-hidden="true" /> 설정
            </button>
          )}
          {session && (
            <button className="btn ghost small" onClick={logout} title="로그아웃">
              <i className="ti ti-logout" aria-hidden="true" /> 로그아웃
            </button>
          )}
        </div>
      )}

      <Suspense fallback={<div className="route-loading">불러오는 중…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/nurse/queue" element={<Protected allow={['nurse']}><NurseQueue /></Protected>} />
        <Route path="/nurse/treat" element={<Protected allow={['nurse']}><NurseTreat /></Protected>} />
        <Route path="/nurse/treat/:id" element={<Protected allow={['nurse']}><NurseTreat /></Protected>} />
        <Route path="/notify" element={<Protected allow={['nurse']}><Notify /></Protected>} />
        <Route path="/principal" element={<Protected allow={['nurse']}><Principal /></Protected>} />
        <Route path="/roster" element={<Protected allow={['nurse']}><RosterManager /></Protected>} />
        <Route path="/parents" element={<Protected allow={['nurse']}><ParentRouting /></Protected>} />
        <Route path="/teacher" element={<Protected allow={['teacher']}><TeacherView /></Protected>} />
        <Route path="/parent" element={<Protected allow={['parent']}><ParentView /></Protected>} />
        <Route path="/edu" element={<Protected allow={['edu']}><Edu /></Protected>} />
      </Routes>
      </Suspense>

      {composeOpen && (
        <QuickNoticeModal
          initial={draft ?? undefined}
          onClose={closeCompose}
          onSend={async (n) => {
            await ensurePushPermission()
            const sender = session
              ? session.role === 'teacher'
                ? `${session.grade}-${session.classNo} 담임 ${session.name}`
                : session.role === 'parent'
                  ? `${session.childName ?? ''} 보호자`
                  : session.name
              : undefined
            send({ ...n, sender })
          }}
        />
      )}
      {settingsOpen && <AutoNoticeSettings onClose={closeSettings} />}

      {toast && (
        <div className="toast">
          <i className="ti ti-bell" aria-hidden="true" /> {toast}
        </div>
      )}
    </div>
  )
}
