// 보건교사 → 교사·학부모 로그인 토큰 발급·배부.
//  담임: 학년/반 토큰 / 학부모: 학생 토큰. 토큰은 학교 키로 암호화된 자체완결 코드(서버 미저장).
import { useMemo, useState } from 'react'
import { classes, studentsInClass } from '../data/mock'
import { issueLoginToken } from '../data/schoolCrypto'

type Tab = 'teacher' | 'parent'

export default function LoginTokenModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('teacher')
  const grades = useMemo(() => [...new Set(classes.map((c) => Number(c.split('-')[0])))].sort((a, b) => a - b), [])
  const [grade, setGrade] = useState(grades[0] ?? 1)
  const classNos = useMemo(
    () => classes.filter((c) => Number(c.split('-')[0]) === grade).map((c) => Number(c.split('-')[1])).sort((a, b) => a - b),
    [grade],
  )
  const [classNo, setClassNo] = useState(classNos[0] ?? 1)
  const roster = useMemo(() => studentsInClass(`${grade}-${classNo}`), [grade, classNo])
  const [studentId, setStudentId] = useState('')
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)

  async function gen() {
    setCopied(false)
    const cls = classNos.includes(classNo) ? classNo : classNos[0]
    if (tab === 'teacher') {
      setToken(await issueLoginToken({ r: 't', g: grade, c: cls }))
    } else {
      const s = roster.find((x) => x.id === studentId) ?? roster[0]
      if (!s) return
      setToken(await issueLoginToken({ r: 'p', sid: s.id, n: s.name }))
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      /* ignore */
    }
  }
  const changeTab = (t: Tab) => { setTab(t); setToken(''); setCopied(false) }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-key" style={{ verticalAlign: -2 }} aria-hidden="true" /> 로그인 토큰 발급
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
          교사·학부모에게 이 토큰을 전달하세요. 받는 분은 로그인 화면에서 <b>토큰 + (학반/자녀 이름)</b>을 입력해 로그인합니다.
        </p>

        <div className="login-tabs grid4" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
          <button className={`login-tab ${tab === 'teacher' ? 'on' : ''}`} onClick={() => changeTab('teacher')}>
            <i className="ti ti-user" aria-hidden="true" /> 담임(학반)
          </button>
          <button className={`login-tab ${tab === 'parent' ? 'on' : ''}`} onClick={() => changeTab('parent')}>
            <i className="ti ti-users" aria-hidden="true" /> 학부모(학생)
          </button>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <label className="login-field" style={{ flex: 1 }}>학년
            <select value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setToken('') }}>
              {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
          </label>
          <label className="login-field" style={{ flex: 1 }}>반
            <select value={classNo} onChange={(e) => { setClassNo(Number(e.target.value)); setToken('') }}>
              {classNos.map((c) => <option key={c} value={c}>{c}반</option>)}
            </select>
          </label>
        </div>

        {tab === 'parent' && (
          <label className="login-field">학생
            <select value={studentId} onChange={(e) => { setStudentId(e.target.value); setToken('') }}>
              <option value="">학생 선택</option>
              {roster.map((s) => <option key={s.id} value={s.id}>{s.number}. {s.name}</option>)}
            </select>
          </label>
        )}

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={tab === 'parent' && !studentId && roster.length > 0 ? false : false} onClick={gen}>
          <i className="ti ti-key" aria-hidden="true" /> 토큰 생성
        </button>

        {token && (
          <div style={{ marginTop: 12 }}>
            <div className="sec-label" style={{ marginBottom: 6 }}>
              {tab === 'teacher' ? `${grade}-${classNo} 담임 토큰` : `${roster.find((x) => x.id === studentId)?.name ?? ''} 학부모 토큰`}
            </div>
            <textarea readOnly value={token} rows={3} className="memo" style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn small" onClick={copy}>
                <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" /> {copied ? '복사됨' : '토큰 복사'}
              </button>
            </div>
          </div>
        )}

        <p className="muted" style={{ fontSize: 11, marginTop: 14, marginBottom: 0, lineHeight: 1.6 }}>
          토큰은 받는 분이 자기 학반/자녀를 입력해 매칭할 때만 동작합니다(보안). 분실 시 다시 발급하세요.
        </p>
      </div>
    </div>
  )
}
