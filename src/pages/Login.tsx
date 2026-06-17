import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type Role } from '../store/auth'
import { SCHOOL } from '../data/location'
import { classes } from '../data/mock'
import InstallButton from '../components/InstallButton'

const roleHome = (r: Role) => (r === 'edu' ? '/edu' : r === 'teacher' ? '/teacher' : r === 'parent' ? '/parent' : '/')

// 클라우드(supabase) 데모 계정 — 대시보드에서 동일 이메일/비번으로 생성해 두면 빠른 로그인 동작.
const DEMO_PW = '123456'
const DEMO_ACCOUNTS: { role: Role; label: string; icon: string; email: string }[] = [
  { role: 'nurse', label: '보건교사', icon: 'ti-stethoscope', email: 'nurse@naum.kr' },
  { role: 'teacher', label: '담임(1-1)', icon: 'ti-user', email: 'teacher@naum.kr' },
  { role: 'parent', label: '학부모(장지호)', icon: 'ti-users', email: 'parent@naum.kr' },
  { role: 'edu', label: '교육청', icon: 'ti-building-bank', email: 'edu@naum.kr' },
]

const TABS: { role: Role; label: string; icon: string }[] = [
  { role: 'nurse', label: '보건교사', icon: 'ti-stethoscope' },
  { role: 'teacher', label: '교사(담임)', icon: 'ti-user' },
  { role: 'parent', label: '학부모', icon: 'ti-users' },
  { role: 'edu', label: '교육청', icon: 'ti-building-bank' },
]

export default function Login() {
  const { loginNurse, loginEdu, loginTeacher, loginParent, loginPassword, loginToken, authMode, session } = useAuth()
  const nav = useNavigate()
  const [tab, setTab] = useState<Role>('nurse')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [keepLogin, setKeepLogin] = useState(true) // 로그인 상태 유지(기본 ON)
  const [cloudMode, setCloudMode] = useState<'staff' | 'token'>('staff') // 직원 vs 교사·학부모(토큰)
  // 토큰 로그인 입력
  const [tk, setTk] = useState('')
  const [tkRole, setTkRole] = useState<'teacher' | 'parent'>('teacher')
  const [tkGrade, setTkGrade] = useState(1)
  const [tkClass, setTkClass] = useState(1)
  const [tkChild, setTkChild] = useState('')
  const [tkName, setTkName] = useState('')

  // "로그인 상태 유지" 플래그 — OFF면 브라우저 종료 시 로그아웃(auth 부팅에서 적용).
  const applyPersist = () => {
    try {
      localStorage.setItem('naum.persistLogin', keepLogin ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  // 클라우드 모드: 로그인(또는 기존 세션) 시 역할별 홈으로 자동 이동.
  useEffect(() => {
    if (authMode === 'supabase' && session) nav(roleHome(session.role))
  }, [authMode, session, nav])
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [grade, setGrade] = useState<number>(1)
  const [classNo, setClassNo] = useState<number>(1)
  const [child, setChild] = useState('')
  const [err, setErr] = useState('')

  const grades = useMemo(() => [...new Set(classes.map((c) => Number(c.split('-')[0])))].sort((a, b) => a - b), [])
  const classNos = useMemo(
    () => classes.filter((c) => Number(c.split('-')[0]) === grade).map((c) => Number(c.split('-')[1])).sort((a, b) => a - b),
    [grade],
  )

  function changeTab(r: Role) {
    setTab(r)
    setErr('')
  }

  function submit() {
    setErr('')
    let e: string | null = null
    if (tab === 'nurse') e = loginNurse(name, pin)
    else if (tab === 'edu') e = loginEdu(id, pw)
    else if (tab === 'teacher') e = loginTeacher(name, grade, classNos.includes(classNo) ? classNo : classNos[0], pin)
    else e = loginParent(child, pin)
    if (e) return setErr(e)
    nav(tab === 'edu' ? '/edu' : tab === 'teacher' ? '/teacher' : tab === 'parent' ? '/parent' : '/')
  }
  const onEnter = (k: string) => k === 'Enter' && submit()

  async function submitCloud() {
    setErr('')
    applyPersist()
    setBusy(true)
    const e = await loginPassword(email, password)
    setBusy(false)
    if (e) return setErr(e)
    // 역할별 이동은 위 useEffect(session)가 처리.
  }

  async function quickLogin(em: string) {
    setErr('')
    applyPersist()
    setEmail(em)
    setPassword(DEMO_PW)
    setBusy(true)
    const e = await loginPassword(em, DEMO_PW)
    setBusy(false)
    if (e) return setErr(e)
  }

  async function submitToken() {
    setErr('')
    if (!tk.trim()) return setErr('토큰을 입력하세요.')
    applyPersist()
    setBusy(true)
    const info =
      tkRole === 'teacher'
        ? { grade: tkGrade, classNo: tkClass, name: tkName }
        : { childName: tkChild }
    const e = await loginToken(tk, info)
    setBusy(false)
    if (e) return setErr(e)
    // 역할별 이동은 useEffect(session)가 처리.
  }
  const tkClassNos = classes.filter((c) => Number(c.split('-')[0]) === tkGrade).map((c) => Number(c.split('-')[1])).sort((a, b) => a - b)

  // ── 클라우드(Supabase) 모드: 이메일 + 비밀번호 단일 폼. 역할은 계정 프로필에서 결정. ──
  if (authMode === 'supabase') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">나음 <span style={{ color: 'var(--info)' }}>NaUM</span></div>
          <div className="login-tag">보건실 디지털 전환 플랫폼 · 로그인</div>
          <div className="login-tabs grid4" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
            <button className={`login-tab ${cloudMode === 'staff' ? 'on' : ''}`} onClick={() => { setCloudMode('staff'); setErr('') }}>
              <i className="ti ti-stethoscope" aria-hidden="true" /> 보건교사·교육청
            </button>
            <button className={`login-tab ${cloudMode === 'token' ? 'on' : ''}`} onClick={() => { setCloudMode('token'); setErr('') }}>
              <i className="ti ti-key" aria-hidden="true" /> 교사·학부모(토큰)
            </button>
          </div>

          {cloudMode === 'staff' ? (
            <>
              <label className="login-field">이메일
                <input type="email" value={email} placeholder="이메일" onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="login-field">비밀번호
                <input type="password" value={password} placeholder="비밀번호" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitCloud()} />
              </label>
              {err && <div className="ai-err" style={{ marginBottom: 12 }}>{err}</div>}
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={submitCloud}>
                <i className="ti ti-login" aria-hidden="true" /> {busy ? '확인 중…' : '로그인'}
              </button>
              <div className="login-demo" style={{ margin: '16px 0 6px' }}>데모 빠른 로그인 (역할 선택)</div>
              <div className="login-tabs grid4">
                {DEMO_ACCOUNTS.map((a) => (
                  <button key={a.role} className="login-tab" disabled={busy} onClick={() => quickLogin(a.email)}>
                    <i className={`ti ${a.icon}`} aria-hidden="true" /> {a.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="login-tabs grid4" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 10 }}>
                <button className={`login-tab ${tkRole === 'teacher' ? 'on' : ''}`} onClick={() => { setTkRole('teacher'); setErr('') }}>담임</button>
                <button className={`login-tab ${tkRole === 'parent' ? 'on' : ''}`} onClick={() => { setTkRole('parent'); setErr('') }}>학부모</button>
              </div>
              <label className="login-field">발급받은 토큰
                <textarea rows={2} value={tk} placeholder="보건교사에게 받은 토큰 붙여넣기" onChange={(e) => setTk(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </label>
              {tkRole === 'teacher' ? (
                <>
                  <div className="row" style={{ gap: 8 }}>
                    <label className="login-field" style={{ flex: 1 }}>학년
                      <select value={tkGrade} onChange={(e) => setTkGrade(Number(e.target.value))}>
                        {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
                      </select>
                    </label>
                    <label className="login-field" style={{ flex: 1 }}>반
                      <select value={tkClass} onChange={(e) => setTkClass(Number(e.target.value))}>
                        {tkClassNos.map((c) => <option key={c} value={c}>{c}반</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="login-field">이름(선택)
                    <input value={tkName} placeholder="담임 이름" onChange={(e) => setTkName(e.target.value)} />
                  </label>
                </>
              ) : (
                <label className="login-field">자녀 이름
                  <input value={tkChild} placeholder="자녀 이름 (토큰과 일치해야 함)" onChange={(e) => setTkChild(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitToken()} />
                </label>
              )}
              {err && <div className="ai-err" style={{ marginBottom: 12 }}>{err}</div>}
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={submitToken}>
                <i className="ti ti-login" aria-hidden="true" /> {busy ? '확인 중…' : '로그인'}
              </button>
            </>
          )}

          <label className="row" style={{ gap: 8, marginTop: 14, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={keepLogin} onChange={(e) => setKeepLogin(e.target.checked)} /> 로그인 상태 유지 (이 기기에서 계속 로그인)
          </label>

          <p className="muted" style={{ fontSize: 11, marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
            교사·학부모는 보건교사가 발급한 <b>토큰</b>으로 로그인합니다. 학생 키오스크는 로그인 없이 사용합니다.
          </p>
          <div style={{ marginTop: 12, textAlign: 'center' }}><InstallButton /></div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">나음 <span style={{ color: 'var(--info)' }}>NaUM</span></div>
        <div className="login-tag">보건실 디지털 전환 플랫폼 · 로그인</div>

        <div className="login-tabs grid4">
          {TABS.map((t) => (
            <button key={t.role} className={`login-tab ${tab === t.role ? 'on' : ''}`} onClick={() => changeTab(t.role)}>
              <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'nurse' && (
          <>
            <div className="login-school"><i className="ti ti-school" aria-hidden="true" /> {SCHOOL.name} <span className="muted-inline">로컬 스테이션</span></div>
            <label className="login-field">이름<input value={name} placeholder="보건교사 이름" onChange={(e) => setName(e.target.value)} /></label>
            <label className="login-field">PIN<input type="password" inputMode="numeric" value={pin} placeholder="4자리 PIN" onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => onEnter(e.key)} /></label>
            <p className="login-demo">데모: 이름 자유 · PIN <b>1234</b></p>
          </>
        )}

        {tab === 'teacher' && (
          <>
            <div className="login-school"><i className="ti ti-school" aria-hidden="true" /> {SCHOOL.name} <span className="muted-inline">담임 — 우리 반 알림</span></div>
            <label className="login-field">이름<input value={name} placeholder="교사 이름" onChange={(e) => setName(e.target.value)} /></label>
            <div className="row" style={{ gap: 8 }}>
              <label className="login-field" style={{ flex: 1 }}>학년
                <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
                  {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
                </select>
              </label>
              <label className="login-field" style={{ flex: 1 }}>반
                <select value={classNo} onChange={(e) => setClassNo(Number(e.target.value))}>
                  {classNos.map((c) => <option key={c} value={c}>{c}반</option>)}
                </select>
              </label>
            </div>
            <label className="login-field">PIN<input type="password" inputMode="numeric" value={pin} placeholder="4자리 PIN" onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => onEnter(e.key)} /></label>
            <p className="login-demo">데모: 이름 자유 · 담당 학년/반 선택 · PIN <b>1234</b></p>
          </>
        )}

        {tab === 'parent' && (
          <>
            <div className="login-school"><i className="ti ti-device-mobile" aria-hidden="true" /> 보호자 — 자녀 알림만</div>
            <label className="login-field">자녀 이름<input value={child} placeholder="자녀 이름 (명부 등록)" onChange={(e) => setChild(e.target.value)} /></label>
            <label className="login-field">인증번호<input type="password" inputMode="numeric" value={pin} placeholder="인증번호" onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => onEnter(e.key)} /></label>
            <p className="login-demo">데모: 명부의 자녀 이름(예: 장지호) · 인증번호 <b>1234</b>. 실제는 등록 토큰/휴대폰 OTP.</p>
          </>
        )}

        {tab === 'edu' && (
          <>
            <div className="login-school"><i className="ti ti-building-bank" aria-hidden="true" /> 부산광역시교육청 <span className="muted-inline">비식별 대시보드</span></div>
            <label className="login-field">아이디<input value={id} placeholder="아이디" onChange={(e) => setId(e.target.value)} /></label>
            <label className="login-field">비밀번호<input type="password" value={pw} placeholder="비밀번호" onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => onEnter(e.key)} /></label>
            <p className="login-demo">데모: 아이디 <b>edu</b> · 비밀번호 <b>1234</b></p>
          </>
        )}

        {err && <div className="ai-err" style={{ marginBottom: 12 }}>{err}</div>}

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={submit}>
          <i className="ti ti-login" aria-hidden="true" /> 로그인
        </button>

        <p className="muted" style={{ fontSize: 11, marginTop: 14, marginBottom: 0, lineHeight: 1.6 }}>
          보건교사·교사·학부모는 학생 알림(로컬), 교육청은 비식별 집계 대시보드에 접근합니다.
          교사는 자기 반, 학부모는 자기 자녀 알림만 봅니다. 학생 키오스크는 로그인 없이 사용합니다.
        </p>
        <div style={{ marginTop: 12, textAlign: 'center' }}><InstallButton /></div>
      </div>
    </div>
  )
}
