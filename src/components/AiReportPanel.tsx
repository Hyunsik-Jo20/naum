import { useEffect, useRef, useState } from 'react'
import {
  AI_PROVIDERS,
  DEFAULT_EVENING_PROMPT,
  DEFAULT_INTERVAL_PROMPT,
  DEFAULT_MORNING_PROMPT,
  callAi,
  isConfigured,
  loadAiConfig,
  saveAiConfig,
  type AiConfig,
  type AiProvider,
} from '../data/ai'
import { downloadWord, printPdf } from '../data/report'
import { useNotices } from '../store/notices'

type ReportKind = 'morning' | 'evening' | 'interval'
const KIND_LABEL: Record<ReportKind, string> = { morning: '아침 보고', evening: '저녁 보고', interval: '주기 보고' }
const KIND_TIME: Record<ReportKind, string> = { morning: '08:00', evening: '17:00', interval: '현재' }
const KIND_ICON: Record<ReportKind, string> = { morning: 'ti-sun', evening: 'ti-moon', interval: 'ti-clock' }

type IntervalMode = 'off' | '30' | '60'
const INTERVAL_LABEL: Record<IntervalMode, string> = { off: '끄기', '30': '30분', '60': '1시간' }

interface ReportItem {
  kind: ReportKind
  text: string
  ts: number
  model: string
}

const LS_LASTRUN = 'naum.ai.lastrun'

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function clock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function dateStr(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}
function ymd(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

type DailyKind = 'morning' | 'evening'

function loadLastRun(): Record<DailyKind, string> {
  try {
    const o = JSON.parse(localStorage.getItem(LS_LASTRUN) || '{}')
    return { morning: o.morning ?? '', evening: o.evening ?? '' }
  } catch {
    return { morning: '', evening: '' }
  }
}

export default function AiReportPanel({ summary }: { summary: string }) {
  const { openCompose } = useNotices()
  const [cfg, setCfg] = useState<AiConfig>(() => loadAiConfig())
  const [showCfg, setShowCfg] = useState(false)
  const [auto, setAuto] = useState(true) // 정기 보고(아침·저녁) 기본 ON
  const [intervalMode, setIntervalMode] = useState<IntervalMode>('off') // 주기 보고(30분·1시간)
  const [loadingKind, setLoadingKind] = useState<ReportKind | null>(null)
  const [error, setError] = useState('')
  const [reports, setReports] = useState<ReportItem[]>([])

  const summaryRef = useRef(summary)
  summaryRef.current = summary
  const reportsRef = useRef(reports)
  reportsRef.current = reports
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const lastRunRef = useRef<Record<DailyKind, string>>(loadLastRun())
  const runningRef = useRef(false)
  const configured = isConfigured(cfg)

  async function generate(kind: ReportKind) {
    const c = cfgRef.current
    if (!isConfigured(c)) {
      setError('먼저 API 설정을 완료하세요.')
      setShowCfg(true)
      return
    }
    if (runningRef.current) return
    runningRef.current = true
    setLoadingKind(kind)
    setError('')
    try {
      const system =
        kind === 'morning' ? c.morningPrompt : kind === 'evening' ? c.eveningPrompt : c.intervalPrompt
      let user = `[보고 시점] ${KIND_LABEL[kind]} (${KIND_TIME[kind]} 기준)\n\n${summaryRef.current}`
      if (kind === 'morning') {
        const lastEve = reportsRef.current.find((r) => r.kind === 'evening')
        if (lastEve) user += `\n\n[직전 저녁 보고 — 이후 변화 위주로 비교]\n${lastEve.text}`
      } else if (kind === 'interval') {
        const last = reportsRef.current[0]
        if (last) user += `\n\n[직전 보고(${KIND_LABEL[last.kind]}) — 이후 변화 위주로 비교]\n${last.text}`
      }
      const text = await callAi(c, system, user)
      setReports((prev) => [{ kind, text, ts: Date.now(), model: c.model }, ...prev].slice(0, 12))
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패')
    } finally {
      runningRef.current = false
      setLoadingKind(null)
    }
  }

  // 정기 보고 자동 생성 — 매분 시각 확인(08:00 아침 / 17:00 저녁, 하루 1회)
  useEffect(() => {
    if (!auto || !configured) return
    const tick = () => {
      const now = new Date()
      const today = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
      const h = now.getHours()
      const check = (kind: DailyKind, hour: number) => {
        if (h === hour && lastRunRef.current[kind] !== today) {
          lastRunRef.current = { ...lastRunRef.current, [kind]: today }
          try {
            localStorage.setItem(LS_LASTRUN, JSON.stringify(lastRunRef.current))
          } catch {
            /* ignore */
          }
          void generate(kind)
        }
      }
      check('morning', 8)
      check('evening', 17)
    }
    tick()
    const t = window.setInterval(tick, 30_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, configured])

  // 주기 보고 자동 생성 — 30분 / 1시간 간격
  useEffect(() => {
    if (intervalMode === 'off' || !configured) return
    const ms = Number(intervalMode) * 60 * 1000
    const t = window.setInterval(() => void generate('interval'), ms)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMode, configured])

  return (
    <div className="ai-panel">
      <p className="rail-desc">
        현재 대시보드의 <b>비식별 집계</b>를 AI가 분석해 <b>아침(08:00)·저녁(17:00) 정기 보고</b>를 생성합니다. 학생 개인정보는 전송하지 않습니다.
      </p>

      {/* 제공자 상태 + 설정 */}
      <div className="ai-status">
        <span className={`ai-dot ${configured ? 'on' : 'off'}`} />
        <span className="ai-status-txt">
          {configured ? `${AI_PROVIDERS.find((p) => p.id === cfg.provider)?.name} · ${cfg.model}` : 'API 미설정'}
        </span>
        <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => setShowCfg(true)}>
          <i className="ti ti-settings" aria-hidden="true" /> API·프롬프트
        </button>
      </div>

      {/* 정기 보고 토글 */}
      <label className="ai-auto">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <span>정기 보고 자동 생성 <span className="muted-inline">· 매일 08:00 / 17:00 (이 화면이 열려 있는 동안)</span></span>
      </label>

      {/* 수동 생성 */}
      <div className="ai-controls">
        <button className="btn small" onClick={() => void generate('morning')} disabled={loadingKind != null}>
          <i className={`ti ${loadingKind === 'morning' ? 'ti-loader-2 spin' : 'ti-sun'}`} aria-hidden="true" />{' '}
          {loadingKind === 'morning' ? '생성 중…' : '아침 보고'}
        </button>
        <button className="btn small" onClick={() => void generate('evening')} disabled={loadingKind != null}>
          <i className={`ti ${loadingKind === 'evening' ? 'ti-loader-2 spin' : 'ti-moon'}`} aria-hidden="true" />{' '}
          {loadingKind === 'evening' ? '생성 중…' : '저녁 보고'}
        </button>
      </div>

      {/* 주기 보고 (30분·1시간) */}
      <div className="ai-controls" style={{ marginTop: 8 }}>
        <span className="ai-interval-label"><i className="ti ti-clock" aria-hidden="true" /> 주기 보고</span>
        <div className="seg">
          {(['off', '30', '60'] as IntervalMode[]).map((m) => (
            <button key={m} className={`seg-btn ${intervalMode === m ? 'on' : ''}`} onClick={() => setIntervalMode(m)}>
              {INTERVAL_LABEL[m]}
            </button>
          ))}
        </div>
        <button className="btn ghost small" onClick={() => void generate('interval')} disabled={loadingKind != null}>
          <i className={`ti ${loadingKind === 'interval' ? 'ti-loader-2 spin' : 'ti-player-play'}`} aria-hidden="true" />{' '}
          {loadingKind === 'interval' ? '생성 중…' : '지금'}
        </button>
      </div>
      {intervalMode !== 'off' && (
        <div className="rail-hint">{INTERVAL_LABEL[intervalMode]}마다 자동 생성 (이 화면이 열려 있는 동안)</div>
      )}

      {error && <div className="ai-err">{error}</div>}

      {/* 보고 목록 */}
      {reports.length === 0 ? (
        <div className="col-empty" style={{ marginTop: 10 }}>
          {configured ? '아직 생성된 보고가 없어요. 위 버튼으로 즉시 생성할 수 있어요.' : 'API 설정 후 보고를 생성할 수 있어요.'}
        </div>
      ) : (
        reports.map((r, i) => (
          <ReportCard key={r.ts} report={r} expanded={i === 0} onCompose={openCompose} />
        ))
      )}

      {showCfg && (
        <AiSettings
          cfg={cfg}
          onClose={() => setShowCfg(false)}
          onSave={(next) => {
            setCfg(next)
            saveAiConfig(next)
            setShowCfg(false)
            setError('')
          }}
        />
      )}
    </div>
  )
}

function ReportCard({
  report: r,
  expanded,
  onCompose,
}: {
  report: ReportItem
  expanded: boolean
  onCompose: (d: { title: string; body: string }) => void
}) {
  const title = `${KIND_LABEL[r.kind]} (${dateStr(r.ts)})`
  const subtitle = `${dateStr(r.ts)} ${clock(r.ts)} · ${KIND_LABEL[r.kind]} · AI ${r.model} · 비식별 집계 기반`
  const fname = `naum_${r.kind}_${ymd(r.ts)}`
  return (
    <details className="ai-report" open={expanded}>
      <summary className="ai-report-head">
        <span>
          <i className={`ti ${KIND_ICON[r.kind]}`} aria-hidden="true" /> {KIND_LABEL[r.kind]} · {dateStr(r.ts)} {clock(r.ts)}
        </span>
      </summary>
      <div className="ai-report-body">{r.text}</div>
      <div className="ai-report-actions">
        <button className="btn ghost small" onClick={() => printPdf(title, subtitle, r.text)}>
          <i className="ti ti-file-type-pdf" aria-hidden="true" /> PDF
        </button>
        <button className="btn ghost small" onClick={() => downloadWord(`${fname}.doc`, title, subtitle, r.text)}>
          <i className="ti ti-file-type-doc" aria-hidden="true" /> Word
        </button>
        <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(r.text)}>
          <i className="ti ti-copy" aria-hidden="true" /> 복사
        </button>
        <button className="btn ghost small" onClick={() => onCompose({ title: `[${KIND_LABEL[r.kind]}] ${dateStr(r.ts)}`, body: r.text })}>
          <i className="ti ti-send" aria-hidden="true" /> 공지
        </button>
      </div>
    </details>
  )
}

function AiSettings({ cfg, onClose, onSave }: { cfg: AiConfig; onClose: () => void; onSave: (c: AiConfig) => void }) {
  const [draft, setDraft] = useState<AiConfig>(cfg)
  const info = AI_PROVIDERS.find((p) => p.id === draft.provider)!

  function pickProvider(p: AiProvider) {
    const pi = AI_PROVIDERS.find((x) => x.id === p)!
    setDraft((d) => ({ ...d, provider: p, model: d.provider === p ? d.model : pi.defaultModel }))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="sec-label"><i className="ti ti-settings" style={{ verticalAlign: -2 }} aria-hidden="true" /> AI API · 프롬프트 설정</div>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        <div className="sec-label" style={{ marginBottom: 6 }}>제공자</div>
        <div className="ai-prov-grid">
          {AI_PROVIDERS.map((p) => (
            <button key={p.id} className={`ai-prov ${draft.provider === p.id ? 'on' : ''}`} onClick={() => pickProvider(p.id)}>
              {p.name}
            </button>
          ))}
        </div>

        {info.needsBaseUrl && (
          <>
            <div className="sec-label" style={{ margin: '12px 0 6px' }}>Base URL (OpenAI 호환)</div>
            <input className="memo" value={draft.baseUrl ?? ''} placeholder="https://your-host/v1" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
          </>
        )}

        <div className="sec-label" style={{ margin: '12px 0 6px' }}>API 키 <span className="muted-inline">· {info.keyHint}</span></div>
        <input className="memo" type="password" value={draft.apiKey} placeholder="API 키 붙여넣기" onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />

        <div className="sec-label" style={{ margin: '12px 0 6px' }}>모델</div>
        <input className="memo" value={draft.model} placeholder={info.defaultModel || '모델명'} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />

        <div className="row between" style={{ margin: '14px 0 6px' }}>
          <div className="sec-label" style={{ margin: 0 }}><i className="ti ti-sun" style={{ verticalAlign: -2 }} aria-hidden="true" /> 아침 보고 프롬프트</div>
          <button className="btn ghost small" onClick={() => setDraft({ ...draft, morningPrompt: DEFAULT_MORNING_PROMPT })}>기본값</button>
        </div>
        <textarea className="memo prompt-area" value={draft.morningPrompt} onChange={(e) => setDraft({ ...draft, morningPrompt: e.target.value })} />

        <div className="row between" style={{ margin: '12px 0 6px' }}>
          <div className="sec-label" style={{ margin: 0 }}><i className="ti ti-moon" style={{ verticalAlign: -2 }} aria-hidden="true" /> 저녁 보고 프롬프트</div>
          <button className="btn ghost small" onClick={() => setDraft({ ...draft, eveningPrompt: DEFAULT_EVENING_PROMPT })}>기본값</button>
        </div>
        <textarea className="memo prompt-area" value={draft.eveningPrompt} onChange={(e) => setDraft({ ...draft, eveningPrompt: e.target.value })} />

        <div className="row between" style={{ margin: '12px 0 6px' }}>
          <div className="sec-label" style={{ margin: 0 }}><i className="ti ti-clock" style={{ verticalAlign: -2 }} aria-hidden="true" /> 주기 보고 프롬프트 <span className="muted-inline">· 30분·1시간</span></div>
          <button className="btn ghost small" onClick={() => setDraft({ ...draft, intervalPrompt: DEFAULT_INTERVAL_PROMPT })}>기본값</button>
        </div>
        <textarea className="memo prompt-area" value={draft.intervalPrompt} onChange={(e) => setDraft({ ...draft, intervalPrompt: e.target.value })} />

        <p className="muted" style={{ fontSize: 11, margin: '12px 0 0', lineHeight: 1.6 }}>
          <i className="ti ti-shield-lock" aria-hidden="true" /> 키·프롬프트는 이 브라우저(localStorage)에만 저장되며 호출 시 <b>비식별 집계만</b> 선택 제공자에게 전송합니다.
          (브라우저→제공자 직접 호출이라 CORS·키노출에 유의하세요.)
        </p>

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={() => onSave(draft)}>저장</button>
          <button className="btn ghost" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}
