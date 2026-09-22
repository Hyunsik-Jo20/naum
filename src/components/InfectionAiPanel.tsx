// 감염병 심층 분석(AI) — 교육청 대시보드. 요청 2026-09-22.
//
//  기존 "AI 특이사항 보고"는 하루 브리핑이라 감염병을 깊게 못 봤다. 여기서는
//  [infectionBrief]가 만든 깊은 비식별 자료(2주 추이·학년·시간대·중증도·학교별·지역 군집)를
//  감염병 전용 프롬프트로 보내 "무엇이 유행 중일 가능성이 있는가"를 묻는다.
//
//  안전장치 — 이 글은 교육청 공문으로 나갈 수 있다:
//   ① 보낸 자료를 그대로 펼쳐 볼 수 있게 한다(무엇이 외부로 나갔는지 감출 이유가 없다).
//   ② 학교는 익명 코드로 보내고 화면에서만 실명으로 되돌린다.
//   ③ 입력에 없는 수치·보내지 않은 학교명이 답에 있으면 경고를 띄운다(auditAiOutput).
//   ④ 공지로 옮길 때 "AI 보조 해석" 고지를 자동으로 앞에 붙인다.
import { useMemo, useState } from 'react'
import { callAi, isConfigured, loadAiConfig } from '../data/ai'
import { auditAiOutput, buildInfectionBrief, revealCodes } from '../data/infectionBrief'
import type { EduSchoolStats, EduVisitRow } from '../data/eduLive'
import type { SurvParams } from '../data/surveillance'
import { useNotices } from '../store/notices'

const DISCLAIMER =
  '※ 이 내용은 나음의 비식별 집계를 바탕으로 한 AI 보조 해석입니다. 확진·확정 판단이 아니며, '
  + '실제 대응은 보건교사·학교장·관할 보건소의 확인을 거쳐 결정해 주세요.'

export default function InfectionAiPanel({
  schools,
  rows,
  params,
  scopeLabel,
}: {
  schools: EduSchoolStats[]
  rows: EduVisitRow[]
  params: SurvParams
  scopeLabel: string
}) {
  const { openCompose } = useNotices()
  const cfg = loadAiConfig()
  const configured = isConfigured(cfg)

  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [ranAt, setRanAt] = useState<number | null>(null)

  const brief = useMemo(
    () => buildInfectionBrief(rows, schools, params, scopeLabel),
    [rows, schools, params, scopeLabel],
  )

  async function run() {
    setLoading(true)
    setError('')
    setWarnings([])
    try {
      const out = await callAi(cfg, cfg.infectionPrompt, brief.text)
      setWarnings(auditAiOutput(brief, out, schools.map((s) => s.name)))
      setAnswer(revealCodes(out, brief.codeMap)) // 화면에는 실명으로
      setRanAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 실패')
    } finally {
      setLoading(false)
    }
  }

  const schoolCount = brief.codeMap.size

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div className="sec-label">
          <i className="ti ti-virus-search" style={{ verticalAlign: -2 }} aria-hidden="true" /> 감염병 심층 분석 (AI)
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost small no-print" onClick={() => setShowInput((v) => !v)}>
            <i className="ti ti-file-text" aria-hidden="true" /> AI에 보낼 자료 {showInput ? '접기' : '보기'}
          </button>
          <button className="btn primary small no-print" onClick={() => void run()} disabled={loading || !configured}>
            <i className={`ti ${loading ? 'ti-loader-2' : 'ti-microscope'}`} aria-hidden="true" />{' '}
            {loading ? '분석 중…' : '심층 분석'}
          </button>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, margin: '0 0 10px', lineHeight: 1.7 }}>
        최근 2주 일자별 추이 · 증후군별 평소 대비 배수 · 학년 분포 · 시간대 분포 · 처치 결과(중증도) ·
        학교별 상승 · 같은 지역 동시 상승을 함께 보내 <b>무엇이 유행 중일 가능성이 있는지</b> 묻습니다.
        <br />
        <i className="ti ti-lock" style={{ verticalAlign: -2 }} aria-hidden="true" />{' '}
        학교는 <b>익명 코드(A교·B교…)</b>로만 보내고, 답변을 화면에 띄울 때만 실제 학교명으로 되돌립니다
        {schoolCount > 0 && <> — 이번 분석에 포함된 학교 {schoolCount}개교</>}.
        학생 개인정보는 애초에 서버에 없습니다.
      </p>

      {!configured && (
        <div className="admin-err" style={{ marginBottom: 10 }}>
          <i className="ti ti-key-off" aria-hidden="true" /> AI 제공자·API 키가 설정되지 않았습니다 —
          우측 <b>AI 특이사항 보고</b> 패널의 설정에서 먼저 등록해 주세요.
        </div>
      )}

      {showInput && (
        <pre className="ai-brief" aria-label="AI에 보낼 비식별 자료">{brief.text}</pre>
      )}

      {error && <div className="admin-err" style={{ marginBottom: 10 }}>{error}</div>}

      {warnings.length > 0 && (
        <div className="admin-err" style={{ marginBottom: 10, lineHeight: 1.7 }}>
          <b><i className="ti ti-alert-triangle" aria-hidden="true" /> 답변 점검</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {answer && (
        <>
          <pre className="ai-answer">{answer}</pre>
          <div className="row between" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {ranAt && `${new Date(ranAt).toLocaleString('ko-KR')} · ${cfg.model}`} · {DISCLAIMER}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn ghost small no-print"
                onClick={() => void navigator.clipboard?.writeText(`${answer}\n\n${DISCLAIMER}`)}
              >
                <i className="ti ti-copy" aria-hidden="true" /> 복사
              </button>
              <button
                className="btn small no-print"
                onClick={() =>
                  openCompose({
                    title: '[학교보건] 감염병 유행 가능성 분석 안내',
                    body: `${DISCLAIMER}\n\n${answer}`,
                    to: '학교',
                  })
                }
              >
                <i className="ti ti-send" aria-hidden="true" /> 공지로 보내기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
