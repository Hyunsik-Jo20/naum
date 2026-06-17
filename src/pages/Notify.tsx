import { useMemo, useState } from 'react'
import { classes, classLabel, students, tileById } from '../data/mock'
import { useVisits } from '../store/visits'
import type { Student, Visit } from '../types'

type Role = '담임' | '학부모'
type Event = '접수' | '종료'

interface Notif {
  key: string
  event: Event
  ts: number
  visit: Visit
  student: Student
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 주격 조사 이/가 */
function iga(name: string): string {
  const c = name.charCodeAt(name.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return '이'
  return (c - 0xac00) % 28 !== 0 ? '이' : '가'
}

function symptomText(v: Visit): string {
  return v.symptomTileIds
    .map((id) => tileById(id)?.label)
    .filter(Boolean)
    .join(' · ')
}

function iconFor(n: Notif, role: Role): string {
  if (n.event === '접수') return role === '담임' ? 'ti-login-2' : 'ti-bell'
  switch (n.visit.outcome) {
    case '귀가':
      return 'ti-home'
    case '병원 이송':
      return 'ti-ambulance'
    default:
      return role === '담임' ? 'ti-check' : 'ti-walk'
  }
}

function tone(n: Notif): 'info' | 'success' | 'danger' {
  if (n.event === '접수') return 'info'
  return n.visit.outcome === '병원 이송' ? 'danger' : 'success'
}

function title(n: Notif, role: Role): string {
  const name = n.student.name
  if (n.event === '접수') {
    return role === '담임' ? `${name} 보건실 접수` : `${name}${iga(name)} 보건실에 왔어요`
  }
  switch (n.visit.outcome) {
    case '귀가':
      return role === '담임' ? `${name} 귀가` : `${name}${iga(name)} 집으로 가요`
    case '병원 이송':
      return role === '담임' ? `${name} 병원 이송` : `${name}${iga(name)} 병원으로 가요`
    default:
      return role === '담임' ? `${name} 교실로 이동 중` : `${name}${iga(name)} 교실로 가고 있어요`
  }
}

function treatText(v: Visit): string {
  return v.treatments.join(', ')
}

function primaryDiseaseName(v: Visit): string {
  const p = v.diseases.find((d) => d.isPrimary) ?? v.diseases[0]
  return p?.name ?? symptomText(v)
}

function fmtKorTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours()
  const ap = h < 12 ? '오전' : '오후'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${ap} ${hh}:${String(d.getMinutes()).padStart(2, '0')}`
}

function subtitle(n: Notif, role: Role): string {
  const v = n.visit

  // 접수
  if (n.event === '접수') {
    const s = symptomText(v)
    if (role === '담임') return s
    // 학부모: 언제 왔고 어떤 증상인지 처음 알림
    return `${fmtKorTime(v.createdAt)}에 보건실에 왔어요 · 증상: ${s} · 보건 선생님이 살펴보고 있어요`
  }

  // 종료
  const dz = primaryDiseaseName(v)
  const tr = treatText(v)

  if (role === '담임') {
    // 교사: 어떤 처치를 했는지 함께 전달
    const parts = [dz]
    if (tr) parts.push(`처치: ${tr}`)
    parts.push(v.outcome ?? '교실 복귀')
    if (v.outcome === '병원 이송') {
      parts.push(`동행 ${v.escort?.join('·') ?? '보건교사'}·${v.transport ?? '119'}`)
    }
    return parts.join(' · ')
  }

  // 학부모: 구체적 처치 + 안심 문구
  const treatSentence = tr
    ? `${dz} 증상으로 ${tr} 처치를 했어요. `
    : `${dz} 증상을 살펴봤어요. `
  let tail: string
  switch (v.outcome) {
    case '귀가':
      tail = '보호자께 안내드렸고, 오늘은 집에서 푹 쉬는 게 좋겠어요.'
      break
    case '병원 이송':
      tail = `안전을 위해 ${v.escort?.join('·') ?? '보건교사'}와 함께 병원으로 갔어요(${v.transport ?? '119'}). 도착하면 다시 안내드릴게요.`
      break
    default:
      tail = '지금은 안정되어 교실로 돌아갔어요. 큰 이상은 없었어요.'
  }
  return treatSentence + tail
}

export default function Notify() {
  const { visits, studentOf } = useVisits()
  const [role, setRole] = useState<Role>('담임')
  const [cls, setCls] = useState<string>(classes[0])
  const [studentId, setStudentId] = useState<string>(students[0].id)

  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = []
    visits.forEach((v) => {
      const s = studentOf(v.id)
      if (!s) return
      if (role === '담임' ? classLabel(s) !== cls : s.id !== studentId) return
      out.push({ key: `${v.id}-in`, event: '접수', ts: v.createdAt, visit: v, student: s })
      if (v.status === 'done') {
        out.push({
          key: `${v.id}-out`,
          event: '종료',
          ts: v.treatedAt ?? v.createdAt,
          visit: v,
          student: s,
        })
      }
    })
    return out.sort((a, b) => b.ts - a.ts)
  }, [visits, studentOf, role, cls, studentId])

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>실시간 알림</h2>
        <span className="muted" style={{ fontSize: 13 }}>접수·종료 2회</span>
      </div>

      <div className="seg" style={{ marginBottom: 12 }}>
        {(['담임', '학부모'] as Role[]).map((r) => (
          <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
            {r} 보기
          </button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 16, gap: 10 }}>
        {role === '담임' ? (
          <label className="field">
            우리 반
            <select value={cls} onChange={(e) => setCls(e.target.value)}>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            내 자녀
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({classLabel(s)})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <i
            className={`ti ${role === '담임' ? 'ti-school' : 'ti-heart'}`}
            style={{ fontSize: 18, color: 'var(--text-2)' }}
            aria-hidden="true"
          />
          <span style={{ fontWeight: 500 }}>
            {role === '담임' ? `${cls} 담임 알림` : '학부모 알림'}
          </span>
        </div>

        {notifs.length === 0 ? (
          <div className="col-empty">아직 알림이 없어요.</div>
        ) : (
          <div className="notif-list">
            {notifs.map((n) => (
              <div key={n.key} className="notif-item">
                <span className={`notif-icon ${tone(n)}`}>
                  <i className={`ti ${iconFor(n, role)}`} aria-hidden="true" />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="notif-title">{title(n, role)}</div>
                  <div className="notif-sub">{subtitle(n, role)}</div>
                  <div className="notif-time">{fmtTime(n.ts)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {role === '학부모' && (
          <div className="privacy-note">
            <i className="ti ti-lock" aria-hidden="true" /> 이름은 보호자 휴대폰에서만 표시 · 서버는 누구인지 모름
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        <i className="ti ti-info-circle" style={{ verticalAlign: -2 }} aria-hidden="true" /> 키오스크 접수·보건교사 처치 완료 시 알림이 자동으로 쌓입니다. (접수·종료 2회)
      </p>
    </div>
  )
}
