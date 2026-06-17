import { useState } from 'react'
import { EDU_LEVELS, EDU_REGIONS, eduSchools } from '../data/eduMock'

export type NoticeTo = '교육청' | '학교' | '보건교사'

export interface SentNotice {
  title: string
  body: string
  region: string
  level: string
  count: number
  ts: number
  auto?: boolean
  school?: string
  to?: NoticeTo
  sender?: string // 보건교사 수신 시 발신자(담임/학부모) 표시용
}

export default function QuickNoticeModal({
  initial,
  onClose,
  onSend,
}: {
  initial?: { title?: string; body?: string; region?: string; level?: string; school?: string; to?: NoticeTo }
  onClose: () => void
  onSend: (n: SentNotice) => void
}) {
  const fixedSchool = initial?.school
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [region, setRegion] = useState(initial?.region ?? '전체')
  const [level, setLevel] = useState(initial?.level ?? '전체')
  const [schoolOnly, setSchoolOnly] = useState(!!fixedSchool)
  // 보건교사 긴급 공지 기본 = 교육청 보고. (대상 지정 발송이면 학교)
  const [to, setTo] = useState<NoticeTo>(
    initial?.to ?? ((initial?.school || initial?.region || initial?.level) ? '학교' : '교육청'),
  )

  const targets = eduSchools.filter(
    (s) => (region === '전체' || s.region === region) && (level === '전체' || s.level === level),
  )
  const useSchool = !!fixedSchool && schoolOnly
  const toEdu = to === '교육청'
  const toNurse = to === '보건교사' // 교사·학부모 → 보건실(보건교사)로만, 선택지 없음
  const count = toEdu || toNurse ? 1 : useSchool ? 1 : targets.length

  function send() {
    if (!title.trim()) return
    onSend({
      title: title.trim(),
      body: body.trim(),
      region: toNurse ? '보건실' : toEdu ? '부산광역시교육청' : useSchool ? (fixedSchool as string) : region,
      level: toNurse ? '보건교사' : toEdu ? '보고' : useSchool ? '학교지정' : level,
      count,
      school: !toEdu && !toNurse && useSchool ? fixedSchool : undefined,
      to,
      ts: Date.now(),
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{toNurse ? '보건실에 알리기' : '긴급 공지 발송'}</h3>
          <button className="x" onClick={onClose} aria-label="닫기">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {/* 받는 곳 — 보건교사 고정(교사·학부모) 또는 교육청/주변학교 선택(보건교사·교육청) */}
        {toNurse ? (
          <div className="login-school" style={{ marginBottom: 14 }}>
            <i className="ti ti-stethoscope" aria-hidden="true" /> 우리 학교 보건실(보건교사)에게 전달됩니다
          </div>
        ) : (
          <>
            <div className="sec-label" style={{ marginBottom: 6 }}>받는 곳</div>
            <div className="recipient-seg" style={{ marginBottom: 14 }}>
              <button className={`rseg ${toEdu ? 'on' : ''}`} onClick={() => setTo('교육청')}>
                <i className="ti ti-building-bank" aria-hidden="true" /> 교육청 보고
              </button>
              <button className={`rseg ${!toEdu ? 'on' : ''}`} onClick={() => setTo('학교')}>
                <i className="ti ti-school" aria-hidden="true" /> 주변 학교 알림
              </button>
            </div>
          </>
        )}

        <div className="sec-label" style={{ marginBottom: 6 }}>제목</div>
        <input className="memo" value={title} placeholder="공지 제목" onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 12 }} />

        <div className="sec-label" style={{ marginBottom: 6 }}>내용</div>
        <textarea
          className="memo"
          value={body}
          placeholder="공지 내용"
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          style={{ marginBottom: 12, resize: 'vertical' }}
        />

        {!toEdu && !toNurse && (
          <>
            {fixedSchool && (
              <label className="row" style={{ gap: 8, marginBottom: 10, fontSize: 14 }}>
                <input type="checkbox" checked={schoolOnly} onChange={(e) => setSchoolOnly(e.target.checked)} />
                <span><strong>{fixedSchool}</strong>에만 발송</span>
              </label>
            )}
            <div className="row" style={{ gap: 10, marginBottom: 14, opacity: useSchool ? 0.4 : 1 }}>
              <label className="field">
                지역
                <select value={region} disabled={useSchool} onChange={(e) => setRegion(e.target.value)}>
                  <option>전체</option>
                  {EDU_REGIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                학교급
                <select value={level} disabled={useSchool} onChange={(e) => setLevel(e.target.value)}>
                  <option>전체</option>
                  {EDU_LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        <div className="row between" style={{ paddingTop: 14, borderTop: '0.5px solid var(--border)' }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {toNurse ? (
              <><strong style={{ color: 'var(--info)' }}>보건실(보건교사)</strong>에게 전달됩니다</>
            ) : toEdu ? (
              <><strong style={{ color: 'var(--info)' }}>부산광역시교육청</strong>으로 보고됩니다</>
            ) : (
              <>
                대상{' '}
                <strong style={{ color: 'var(--info)' }}>
                  {useSchool ? `${fixedSchool} (1개교)` : `${count}개교`}
                </strong>
                로 발송됩니다
              </>
            )}
          </span>
          <button className="btn emergency" disabled={!title.trim()} onClick={send}>
            <i className="ti ti-send" aria-hidden="true" /> {toNurse ? '보내기' : '발송'}
          </button>
        </div>
      </div>
    </div>
  )
}
