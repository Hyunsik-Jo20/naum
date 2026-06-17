import { Link, Navigate } from 'react-router-dom'
import { useAuth, type Role } from '../store/auth'

interface Item {
  to: string
  icon: string
  title: string
  desc: string
  roles: Role[]
}

const items: Item[] = [
  { to: '/kiosk', icon: 'ti-device-tablet', title: '학생 키오스크', desc: 'QR/학반 행렬 → 증상 선택 → 접수', roles: ['nurse'] },
  { to: '/nurse/queue', icon: 'ti-list-check', title: '보건교사 콘솔', desc: '대기 / 처치 / 완료 한 화면', roles: ['nurse'] },
  { to: '/notify', icon: 'ti-bell', title: '담임·학부모 알림', desc: '접수·종료 2회 · 담임/학부모 보기', roles: ['nurse'] },
  { to: '/principal', icon: 'ti-clipboard-text', title: '교장 보고', desc: '일일 보고 자동 마감 · 보건일지 엑셀', roles: ['nurse'] },
  { to: '/roster', icon: 'ti-users', title: '학생 명부 관리', desc: '로컬 명부 엑셀/CSV 업로드 (PII 로컬)', roles: ['nurse'] },
  { to: '/parents', icon: 'ti-shield-lock', title: '보호자 알림 (토큰 라우팅)', desc: '익명 토큰 등록·발송 데모', roles: ['nurse'] },
  { to: '/teacher', icon: 'ti-user', title: '우리 반 보건실 알림', desc: '담임 — 우리 반 학생 접수·종료', roles: ['teacher'] },
  { to: '/parent', icon: 'ti-device-mobile', title: '자녀 보건실 알림', desc: '학부모 — 자녀 알림만', roles: ['parent'] },
  { to: '/edu', icon: 'ti-map-2', title: '교육청 대시보드', desc: '지역 비식별 집계 · 카카오맵 · AI 보고', roles: ['edu'] },
]

export default function Home() {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />

  const visible = items.filter((it) => it.roles.includes(session.role))

  return (
    <div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        <strong>{session.name}</strong>님 · {session.org}{' '}
        <span className="muted-inline">({session.role === 'nurse' ? '보건실 로컬' : '비식별 대시보드'})</span>
      </p>
      <div className="menu-grid">
        {visible.map((it) => (
          <Link key={it.to} to={it.to} className="menu-item">
            <i className={`ti ${it.icon} mi-icon`} aria-hidden="true" />
            <span className="mi-title">{it.title}</span>
            <span className="mi-desc">{it.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
