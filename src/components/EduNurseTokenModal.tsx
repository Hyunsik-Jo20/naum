// 교육청 → 보건교사 "가입 토큰" 발급. 보건교사는 이 토큰으로 최초 1회 회원가입(이메일·비번 등록).
//  토큰 = 학교 키 암호문(자체완결, 서버 미저장). 학교명을 넣으면 가입 시 소속으로 적용.
import { useState } from 'react'
import { issueLoginToken } from '../data/tokenApi'

export default function EduNurseTokenModal({ onClose }: { onClose: () => void }) {
  const [org, setOrg] = useState('')
  const [secret, setSecret] = useState('')
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  async function gen() {
    setCopied(false)
    setErr('')
    try {
      setToken(await issueLoginToken({ r: 'n', org: org.trim() }, { eduSecret: secret.trim() || undefined }))
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
          학교 보건교사에게 이 토큰을 전달하세요. 보건교사는 로그인 화면 <b>"보건교사 회원가입"</b>에서 토큰 + 이메일/비밀번호를 등록해 계정을 만듭니다.
        </p>

        <label className="login-field">학교명 (선택 — 가입 시 소속으로 적용)
          <input value={org} placeholder="예: 주감초등학교" onChange={(e) => { setOrg(e.target.value); setToken('') }} />
        </label>
        <label className="login-field">발급 비밀번호 (서버 보안 설정 시 — 교육청 계정으로 로그인했다면 생략)
          <input type="password" value={secret} placeholder="서버 EDU_ISSUE_SECRET" autoComplete="off"
            onChange={(e) => { setSecret(e.target.value); setToken('') }} />
        </label>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={gen}>
          <i className="ti ti-key" aria-hidden="true" /> 가입 토큰 생성
        </button>

        {err && <div className="ai-err" style={{ marginTop: 10 }}>{err}</div>}

        {token && (
          <div style={{ marginTop: 12 }}>
            <div className="sec-label" style={{ marginBottom: 6 }}>보건교사 가입 토큰{org ? ` · ${org}` : ''}</div>
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
