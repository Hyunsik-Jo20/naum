import { Link } from 'react-router-dom'

export default function Stub({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="card">
      <div className="stub">
        <i className={`ti ${icon}`} aria-hidden="true" />
        <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>{title}</p>
        <p>이 화면은 다음 단계에서 구현합니다. (설계 확정본 기준)</p>
        <Link to="/" className="btn ghost" style={{ marginTop: 12 }}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> 홈으로
        </Link>
      </div>
    </div>
  )
}
