import { Link, useNavigate, useParams } from 'react-router-dom'
import TreatPanel from '../components/TreatPanel'
import { useVisits } from '../store/visits'

export default function NurseTreat() {
  const { id } = useParams()
  const { getVisit } = useVisits()
  const nav = useNavigate()
  const visit = id ? getVisit(id) : undefined

  if (!visit) {
    return (
      <div className="card">
        <div className="stub">
          <i className="ti ti-stethoscope" aria-hidden="true" />
          <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>처치할 학생을 선택하세요</p>
          <p>보건교사 콘솔(대기열)에서 처치가 통합 진행됩니다.</p>
          <Link to="/nurse/queue" className="btn ghost" style={{ marginTop: 12 }}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> 보건교사 콘솔로
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <Link to="/nurse/queue" className="btn ghost">
          <i className="ti ti-arrow-left" aria-hidden="true" /> 콘솔
        </Link>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <TreatPanel key={visit.id} visit={visit} onDone={() => nav('/nurse/queue')} />
      </div>
    </div>
  )
}
