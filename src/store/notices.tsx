import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { eduSchools } from '../data/eduMock'
import { DEFAULT_THRESHOLDS, type DisasterAlert, type Thresholds } from '../data/disasters'
import type { NoticeTo, SentNotice } from '../components/QuickNoticeModal'
import { pushNotify } from '../push'

// 자동 발송 가능한 경보(트리거) 목록 — deriveAlerts의 title과 동일해야 함
// thKey: 임계치 키, unit: 단위, cmp: 비교(이상/이하)
export const AUTO_TRIGGERS = [
  { title: '초미세먼지 매우나쁨', sev: 'danger', thKey: 'pm25_verybad', unit: '㎍/㎥', cmp: '이상' },
  { title: '초미세먼지 나쁨', sev: 'warning', thKey: 'pm25_bad', unit: '㎍/㎥', cmp: '이상' },
  { title: '호우경보', sev: 'danger', thKey: 'rain_warning', unit: 'mm/h', cmp: '이상' },
  { title: '호우주의보', sev: 'warning', thKey: 'rain_advisory', unit: 'mm/h', cmp: '이상' },
  { title: '폭염경보', sev: 'danger', thKey: 'heat_warning', unit: '°C', cmp: '이상' },
  { title: '폭염주의보', sev: 'warning', thKey: 'heat_advisory', unit: '°C', cmp: '이상' },
  { title: '한파경보', sev: 'danger', thKey: 'cold_warning', unit: '°C', cmp: '이하' },
  { title: '한파주의보', sev: 'warning', thKey: 'cold_advisory', unit: '°C', cmp: '이하' },
] as const

export interface Rule {
  enabled: boolean
  region: string
  level: string
}
export type RuleMap = Record<string, Rule>

export interface NoticeDraft {
  title?: string
  body?: string
  region?: string
  level?: string
  school?: string
  to?: NoticeTo
}

export interface NurseMsg {
  title: string
  body: string
  sender?: string
  ts: number
  read?: boolean
  kind?: 'msg' | 'notice' | 'alert' // msg=담임/학부모, notice=교육청 공지, alert=재난 경보
}

interface NoticeCtx {
  sent: SentNotice[]
  nurseInbox: NurseMsg[]
  clearNurseInbox: () => void
  rules: RuleMap
  setRule: (title: string, patch: Partial<Rule>) => void
  thresholds: Thresholds
  setThreshold: (key: keyof Thresholds, value: number) => void
  toast: string | null
  send: (n: SentNotice) => void
  composeOpen: boolean
  draft: NoticeDraft | null
  openCompose: (draft?: NoticeDraft) => void
  closeCompose: () => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
  autoEvaluate: (alerts: DisasterAlert[]) => void
}

const Ctx = createContext<NoticeCtx | null>(null)
const LS_KEY = 'naum.autoRules'
const LS_TH = 'naum.thresholds'
const LS_NURSE = 'naum.nurseinbox'

function loadNurseInbox(): NurseMsg[] {
  try {
    const a = JSON.parse(localStorage.getItem(LS_NURSE) || '[]')
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

function loadThresholds(): Thresholds {
  const base = { ...DEFAULT_THRESHOLDS }
  try {
    const saved = JSON.parse(localStorage.getItem(LS_TH) || '{}')
    Object.keys(base).forEach((k) => {
      const v = saved[k]
      if (typeof v === 'number' && !Number.isNaN(v)) base[k as keyof Thresholds] = v
    })
  } catch {
    /* ignore */
  }
  return base
}

function loadRules(): RuleMap {
  const base: RuleMap = {}
  AUTO_TRIGGERS.forEach((t) => (base[t.title] = { enabled: false, region: '전체', level: '전체' }))
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    Object.keys(saved).forEach((k) => {
      if (base[k]) base[k] = { ...base[k], ...saved[k] }
    })
  } catch {
    /* ignore */
  }
  return base
}

function countTargets(region: string, level: string): number {
  return eduSchools.filter(
    (s) => (region === '전체' || s.region === region) && (level === '전체' || s.level === level),
  ).length
}

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [sent, setSent] = useState<SentNotice[]>([])
  const [nurseInbox, setNurseInbox] = useState<NurseMsg[]>(() => loadNurseInbox())
  const [rules, setRules] = useState<RuleMap>(() => loadRules())
  const [thresholds, setThresholds] = useState<Thresholds>(() => loadThresholds())
  const [composeOpen, setComposeOpen] = useState(false)
  const [draft, setDraft] = useState<NoticeDraft | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const autoSent = useRef<Set<string>>(new Set())
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  const addNurseMsg = useCallback((msg: NurseMsg) => {
    setNurseInbox((p) => {
      const next = [msg, ...p].slice(0, 50)
      try {
        localStorage.setItem(LS_NURSE, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const send = useCallback(
    (n: SentNotice) => {
      // 교사·학부모 → 보건교사: 보건실 수신함에 적재(외부 발송 목록엔 안 넣음)
      if (n.to === '보건교사') {
        addNurseMsg({ title: n.title, body: n.body ?? '', sender: n.sender, ts: n.ts, kind: 'msg' })
        pushNotify(n.title, n.body || '보건실 도착')
        showToast(`보건실 전달 · ${n.title}`)
        return
      }
      setSent((p) => [n, ...p])
      // 교육청 → 학교 공지·경보는 보건교사 수신함에도 도착(데모: 학교 대상 공지 전달. 실서비스는 학교/지역 필터).
      const toSchools = n.to === '학교' || (n.to !== '교육청' && (n.auto || (n.count ?? 0) > 0))
      if (toSchools) {
        const isAlert = !!n.auto || /경보|주의보|긴급|재난/.test(n.title)
        addNurseMsg({ title: n.title, body: n.body ?? '', sender: n.sender ?? '교육청', ts: n.ts, kind: isAlert ? 'alert' : 'notice' })
      }
      const tgt = n.to === '교육청' ? '교육청 보고' : `${n.count}개교`
      pushNotify(n.title, n.body || (n.to === '교육청' ? '교육청 보고' : `${n.region}·${n.level} ${n.count}개교`))
      showToast(`${n.auto ? '자동 ' : ''}발송 · ${tgt}: ${n.title}`)
    },
    [showToast, addNurseMsg],
  )

  const clearNurseInbox = useCallback(() => {
    setNurseInbox([])
    try {
      localStorage.removeItem(LS_NURSE)
    } catch {
      /* ignore */
    }
  }, [])

  const setThreshold = useCallback((key: keyof Thresholds, value: number) => {
    setThresholds((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(LS_TH, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const setRule = useCallback((title: string, patch: Partial<Rule>) => {
    setRules((prev) => {
      const next = { ...prev, [title]: { ...prev[title], ...patch } }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const autoEvaluate = useCallback(
    (alerts: DisasterAlert[]) => {
      const day = new Date().toISOString().slice(0, 10)
      alerts.forEach((a) => {
        const rule = rules[a.title]
        if (!rule?.enabled) return
        const key = `${a.title}|${rule.region}|${rule.level}|${day}`
        if (autoSent.current.has(key)) return
        autoSent.current.add(key)
        send({
          title: `[자동][긴급] ${a.title}`,
          body: a.detail,
          region: rule.region,
          level: rule.level,
          count: countTargets(rule.region, rule.level),
          ts: Date.now(),
          auto: true,
        })
      })
    },
    [rules, send],
  )

  const api = useMemo<NoticeCtx>(
    () => ({
      sent,
      nurseInbox,
      clearNurseInbox,
      rules,
      setRule,
      thresholds,
      setThreshold,
      toast,
      send,
      composeOpen,
      draft,
      openCompose: (d) => {
        setDraft(d ?? null)
        setComposeOpen(true)
      },
      closeCompose: () => setComposeOpen(false),
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
      autoEvaluate,
    }),
    [sent, nurseInbox, clearNurseInbox, rules, setRule, thresholds, setThreshold, toast, send, composeOpen, draft, settingsOpen, autoEvaluate],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useNotices(): NoticeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotices must be used within NoticeProvider')
  return ctx
}
