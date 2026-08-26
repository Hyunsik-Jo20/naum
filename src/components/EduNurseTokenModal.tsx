// 교육청 → 보건교사 "가입 토큰" 발급. 보건교사는 이 토큰으로 최초 1회 회원가입(이메일·비번 등록).
//  멀티테넌트: 교육청이 실제 학교 명부(busanSchools + 오버레이)에서 학교를 지정 → 토큰에 학교 id(sch)가
//  서명 포함 → 가입 계정·방문 데이터가 그 학교로 스코프(지도·현황과 자동 연결).
import { useMemo, useState } from 'react'
import { issueLoginToken } from '../data/tokenApi'
import { useSchools } from '../store/schools'

export default function EduNurseTokenModal({ onClose }: { onClose: () => void }) {
  const { schools } = useSchools()
  const [query, setQuery] = useState('')
  const [schId, setSchId] = useState('')
  const [secret, setSecret] = useState('')
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  const picked = useMemo(() => schools.find((s) => s.id === schId), [schools, schId])
  // 이름/지역 검색 — 최대 12건 표시(642개교 전체 나열 방지)
  const matches = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return schools.filter((s) => s.name.includes(q) || s.region.includes(q)).slice(0, 12)
  }, [schools, query])

  async function gen() {
    setCopied(false)
    setErr('')
    if (!picked) { setErr('학교를 명부에서 선택하세요.'); return }
    try {
      setToken(await issueLoginToken({ r: 'n', sch: picked.id, org: picked.name }, { eduSecret: secret.trim() || undefined }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '토큰 발급에 실패했습니다.')
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-id-badge-2" style={{ verticalAlign: -2 }} aria-hidden="true" /> 보건교사 가입 토큰 발급
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
          <b>학교를 명부에서 선택</b>해 발급하세요 — 가입 계정과 방문 데이터가 그 학교로 귀속됩니다(지도·현황 자동 연결).
          보건교사는 로그인 화면 <b>"보건교사 회원가입"</b>에서 토큰 + 이메일/비밀번호로 계정을 만듭니다.
        </p>

        <label className="login-field">학교 검색 (이름 또는 구·군)
          <input value={query} placeholder="예: 주감, 사하구" onChange={(e) => { setQuery(e.target.value); setToken('') }} />
        </label>
        {matches.length > 0 && (
          <div className="chips" style={{ marginBottom: 10 }}>
            {matches.map((s) => (
              <button key={s.id} className={`chip ${schId === s.id ? 'on' : ''}`}
                onClick={() => { setSchId(s.id); setToken('') }}>
                {schId === s.id && <i className="ti ti-check" aria-hidden="true" />} {s.name}
                <span className="muted-inline" style={{ marginLeft: 4 }}>{s.region}</span>
              </button>
            ))}
          </div>
        )}
        {picked && (
          <div className="route-note" style={{ marginBottom: 10 }}>
            <i className="ti ti-school" aria-hidden="true" /> 선택됨: <b>{picked.name}</b> ({picked.region} · {picked.level}) — 학교 id <code>{picked.id}</code>
          </div>
        )}
        <label className="login-field">발급 비밀번호 (서버 보안 설정 시 — 교육청 계정으로 로그인했다면 생략)
          <input type="password" value={secret} placeholder="서버 EDU_ISSUE_SECRET" autoComplete="off"
            onChange={(e) => { setSecret(e.target.value); setToken('') }} />
        </label>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={gen} disabled={!picked}>
          <i className="ti ti-key" aria-hidden="true" /> 가입 토큰 생성{picked ? ` — ${picked.name}` : ''}
        </button>

        {err && <div className="ai-err" style={{ marginTop: 10 }}>{err}</div>}

        {token && (
          <div style={{ marginTop: 12 }}>
            <div className="sec-label" style={{ marginBottom: 6 }}>보건교사 가입 토큰{picked ? ` · ${picked.name}` : ''}</div>
            <textarea readOnly value={token} rows={3} className="memo" style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn small" onClick={copy}>
                <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" /> {copied ? '복사됨' : '토큰 복사'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
