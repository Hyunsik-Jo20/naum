import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Student, Visit } from '../types'
import { findStudent, suggestDiseases } from '../data/mock'
import { roster } from '../data/localRoster'
import {
  probeBackend,
  fetchVisits,
  fetchLinks,
  createVisit as apiCreateVisit,
  patchVisit as apiPatchVisit,
  subscribeVisits,
  subscribeLinks,
} from '../api/backend'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import { loadLinks as loadLocalLinks } from '../data/localStation'
import * as sb from '../api/supabaseBackend'
import * as offline from '../data/offline'
import { tileById } from '../data/mock'
import { loadNotifyTargets } from '../data/notifyTargets'

/**
 * 로컬/서버 분리 — 세 가지 모드로 동작(우선순위 supabase > backend > local):
 *  - 'supabase': 클라우드 배포. 비식별 Visit은 Supabase(Realtime 동기화), 링크(PII)는 브라우저
 *                로컬 스테이션(localStation)에만. VITE_SUPABASE_URL/ANON_KEY 설정 시 이 모드.
 *  - 'backend' : 로컬 스테이션(:8787, PII 링크) + 비식별 중앙 서버(:8788) Node 백엔드 + SSE.
 *  - 'local'   : 백엔드 미가동 시 폴백. 단일 메모리 + BroadcastChannel(같은 PC 2창 동기화).
 *  어느 모드든 화면(VisitsCtx) API는 동일(동기). 내부에서 로컬 미러 + 낙관적 업데이트.
 *
 *  공통 원칙: visits=비식별(이름·반·번호 없음), links=visit_id↔student_id(재식별 키, 로컬만).
 *  ※ supabase 모드의 링크는 기기별 localStorage라 같은 브라우저(콘솔+키오스크 탭) 기준 공유.
 *    다른 기기 간 이름 복원은 후속(암호화 링크 또는 온프레미스 스테이션) — 비식별 데이터는 전 기기 공유.
 */
type Mode = 'probing' | 'supabase' | 'backend' | 'local'

interface VisitsCtx {
  visits: Visit[]
  mode: Mode // 'supabase'=클라우드 / 'backend'=Node서버 / 'local'=폴백 / 'probing'=확인 중
  getVisit: (id: string) => Visit | undefined
  studentOf: (visitId: string) => Student | undefined
  addVisit: (student: Student, symptomTileIds: string[]) => Visit
  startTreating: (id: string) => void
  completeVisit: (id: string, patch: Partial<Visit>) => void
  updateVisit: (id: string, patch: Partial<Visit>) => void
  deleteVisit: (id: string) => void
}

const Ctx = createContext<VisitsCtx | null>(null)

// 창마다 고유 prefix — 두 창에서 동시에 접수해도 visit id 충돌 방지
const WIN = Math.random().toString(36).slice(2, 7)
let counter = 100

interface Store { visits: Visit[]; links: Record<string, string> }
let SEED: Store | null = null

// 오프라인 캐시(supabase 모드) — 인터넷 없이도 콘솔/키오스크가 마지막 상태 + 로컬 신규를 보여줌.
const LS_CACHE = 'naum.cache.visits'
function loadCache(): Store | null {
  try {
    const o = JSON.parse(localStorage.getItem(LS_CACHE) || 'null')
    return o && Array.isArray(o.visits) ? o : null
  } catch {
    return null
  }
}
function saveCache(s: Store) {
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

function buildSeed(): Store {
  const now = Date.now()
  const at = (i: number) => roster[i % roster.length]
  const visits: Visit[] = []
  const links: Record<string, string> = {}

  const add = (idx: number, tiles: string[], extra: Partial<Visit>) => {
    const s = at(idx)
    const id = `v-seed-${visits.length + 1}`
    visits.push({
      id,
      grade: s.grade,
      sex: s.sex,
      symptomTileIds: tiles,
      status: 'waiting',
      ticket: 8 + visits.length,
      diseases: [],
      treatments: [],
      createdAt: now,
      ...extra,
    })
    links[id] = s.id
  }

  add(40, ['head'], { createdAt: now - 2 * 60000 })
  add(80, ['hurt'], { createdAt: now - 1 * 60000 })
  add(5, ['tummy', 'dizzy'], {
    status: 'treating',
    diseases: suggestDiseases(['tummy', 'dizzy']),
    treatments: ['안정·휴식'],
    createdAt: now - 9 * 60000,
    calledAt: now - 8 * 60000,
  })
  add(120, ['nose'], {
    status: 'done',
    diseases: [{ name: '비출혈', category: '이비인후과계', isPrimary: true }],
    treatments: ['지혈'],
    outcome: '교실 복귀',
    createdAt: now - 40 * 60000,
    calledAt: now - 38 * 60000,
    treatedAt: now - 33 * 60000,
  })
  add(160, ['eye'], {
    status: 'done',
    diseases: [{ name: '충혈', category: '안과계', isPrimary: true }],
    treatments: ['안약 점안'],
    outcome: '교실 복귀',
    createdAt: now - 30 * 60000,
    calledAt: now - 28 * 60000,
    treatedAt: now - 25 * 60000,
  })

  return { visits, links }
}

function getSeed(): Store {
  if (!SEED) SEED = buildSeed()
  // 각 창이 독립 복사본을 갖도록 깊은 복제
  return { visits: SEED.visits.map((v) => ({ ...v })), links: { ...SEED.links } }
}

/** 다른 창에서 온 상태를 로컬과 병합(visit id 기준 remote 우선, 삭제 없음). */
function mergeStore(local: Store, remote: Store): Store {
  const m = new Map(local.visits.map((v) => [v.id, v]))
  remote.visits.forEach((v) => m.set(v.id, v))
  return { visits: [...m.values()], links: { ...local.links, ...remote.links } }
}

/** 한 방문을 visit id 기준으로 upsert(SSE 수신 병합용). */
function upsertVisit(list: Visit[], v: Visit): Visit[] {
  const i = list.findIndex((x) => x.id === v.id)
  if (i < 0) return [...list, v]
  const next = list.slice()
  next[i] = { ...next[i], ...v }
  return next
}

export function VisitsProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>({ visits: [], links: {} })
  const [mode, setMode] = useState<Mode>('probing')
  const modeRef = useRef<Mode>('probing')
  modeRef.current = mode
  const storeRef = useRef(store)
  storeRef.current = store
  const chanRef = useRef<BroadcastChannel | null>(null)
  const suppressRef = useRef(false)

  // 부팅: 백엔드 가용성 확인 → backend면 서버에서 하이드레이트(+빈 경우 시드), 아니면 local 폴백.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 1) 클라우드(Supabase) 모드 — 비식별 방문은 클라우드, 링크는 로컬 스테이션.
      //    오프라인 대비: 캐시를 먼저 띄우고(즉시 사용), 온라인이면 클라우드와 병합. 밀린 쓰기는 자동 업로드.
      if (SUPABASE_ENABLED) {
        offline.initAutoFlush()
        const cached = loadCache()
        if (cached) {
          setStore(cached)
          setMode('supabase')
        }
        if (offline.isOnline()) {
          const [visits, cloudLinks] = await Promise.all([sb.fetchVisits(), sb.fetchLinks()])
          if (cancelled) return
          const base = cached ?? { visits: [], links: {} }
          // 클라우드 방문을 캐시 위에 upsert(오프라인에서 만든 로컬 전용 방문 보존).
          const m = new Map(base.visits.map((v) => [v.id, v]))
          visits.forEach((v) => m.set(v.id, v))
          const links = { ...base.links, ...loadLocalLinks(), ...cloudLinks }
          setStore({ visits: [...m.values()], links })
        } else if (!cached) {
          setStore({ visits: [], links: loadLocalLinks() })
        }
        setMode('supabase')
        return
      }
      // 2) Node 백엔드 모드
      const on = await probeBackend()
      if (cancelled) return
      if (on) {
        let visits = await fetchVisits()
        let links = await fetchLinks()
        if (visits.length === 0) {
          // 중앙이 비어 있으면 결정적 시드를 멱등 등록(고정 id → 다중 창 동시 시드도 안전).
          const seed = buildSeed()
          await Promise.all(seed.visits.map((v) => apiCreateVisit(v, seed.links[v.id])))
          visits = seed.visits
          links = seed.links
        }
        if (cancelled) return
        setStore({ visits, links })
        setMode('backend')
      } else {
        // 3) 로컬 폴백(연수 데모)
        setStore(getSeed())
        setMode('local')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // [supabase] Realtime 구독 — 비식별 방문 + 암호화 링크(다기기 이름 복원).
  useEffect(() => {
    if (mode !== 'supabase') return
    const offV = sb.subscribeVisits((v) => setStore((p) => ({ ...p, visits: upsertVisit(p.visits, v) })))
    const offL = sb.subscribeLinks((l) =>
      setStore((p) => ({ ...p, links: { ...p.links, [l.visitId]: l.studentId } })),
    )
    return () => {
      offV()
      offL()
    }
  }, [mode])

  // [supabase] 재연결/탭 복귀 시 catch-up — Realtime이 끊긴 사이 다른 기기가 만든 방문을 재조회 병합.
  //  기존 방문은 로컬(낙관적 최신)을 유지하고 없는 것만 추가 → 미업로드 상태를 되돌리지 않음.
  useEffect(() => {
    if (mode !== 'supabase') return
    let busy = false
    const resync = async () => {
      if (busy || !offline.isOnline()) return
      busy = true
      try {
        const [visits, cloudLinks] = await Promise.all([sb.fetchVisits(), sb.fetchLinks()])
        setStore((p) => {
          const have = new Set(p.visits.map((v) => v.id))
          const add = visits.filter((v) => !have.has(v.id))
          return add.length || Object.keys(cloudLinks).length
            ? { visits: [...p.visits, ...add], links: { ...cloudLinks, ...p.links } }
            : p
        })
      } catch {
        /* 무시(다음 트리거에 재시도) */
      } finally {
        busy = false
      }
    }
    const onVis = () => { if (document.visibilityState === 'visible') void resync() }
    window.addEventListener('online', resync)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('online', resync)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mode])

  // [supabase] 상태가 바뀔 때마다 오프라인 캐시에 저장.
  useEffect(() => {
    if (mode === 'supabase') saveCache(store)
  }, [store, mode])

  // [backend] SSE 구독 — 중앙(비식별 방문)·스테이션(링크) 실시간 반영.
  useEffect(() => {
    if (mode !== 'backend') return
    const offV = subscribeVisits((v) => setStore((p) => ({ ...p, visits: upsertVisit(p.visits, v) })))
    const offL = subscribeLinks((l) =>
      setStore((p) => ({ ...p, links: { ...p.links, [l.visitId]: l.studentId } })),
    )
    return () => {
      offV()
      offL()
    }
  }, [mode])

  // [local] BroadcastChannel — 같은 PC의 다른 창과 대기열 동기화(백엔드 미가동 시에만).
  useEffect(() => {
    if (mode !== 'local') return
    if (typeof BroadcastChannel === 'undefined') return
    const c = new BroadcastChannel('naum-visits')
    chanRef.current = c
    c.onmessage = (e) => {
      const msg = e.data as { type: string; data?: Store }
      if (msg.type === 'sync-request') {
        c.postMessage({ type: 'state', data: storeRef.current })
      } else if (msg.type === 'state' && msg.data) {
        suppressRef.current = true
        setStore((local) => mergeStore(local, msg.data as Store))
      }
    }
    // 입장 시 기존 창들에 현재 상태 요청(늦게 연 창도 동기화)
    c.postMessage({ type: 'sync-request' })
    return () => {
      c.close()
      chanRef.current = null
    }
  }, [mode])

  // [local] 로컬 변경 시 다른 창에 브로드캐스트 (수신 적용분은 제외)
  useEffect(() => {
    if (mode !== 'local') return
    if (suppressRef.current) {
      suppressRef.current = false
      return
    }
    chanRef.current?.postMessage({ type: 'state', data: store })
  }, [store, mode])

  const api = useMemo<VisitsCtx>(
    () => ({
      visits: store.visits,
      mode,
      getVisit: (id) => store.visits.find((v) => v.id === id),
      studentOf: (visitId) => {
        const sid = store.links[visitId]
        return sid ? findStudent(sid) : undefined
      },
      addVisit: (student, symptomTileIds) => {
        const id = `v-${WIN}-${++counter}`
        const v: Visit = {
          id,
          grade: student.grade,
          sex: student.sex,
          symptomTileIds,
          status: 'waiting',
          ticket: counter - 70,
          diseases: [],
          treatments: [],
          createdAt: Date.now(),
        }
        setStore((p) => ({ visits: [...p.visits, v], links: { ...p.links, [id]: student.id } }))
        // 원격 반영(실패해도 화면은 유지). supabase=클라우드, backend=스테이션 경유. 둘 다 비식별 visit만.
        if (modeRef.current === 'supabase') {
          // 온라인이면 즉시, 오프라인이면 큐에 쌓아 재연결 시 업로드.
          const sym = symptomTileIds.map((tid) => tileById(tid)?.label).filter(Boolean).join(' · ')
          offline.run({ type: 'createVisit', visit: v, studentId: student.id })
          // 알림 대상 설정(담임/학부모)에 따라 발송
          const nt = loadNotifyTargets()
          if (nt.teacher) offline.run({ type: 'emitClass', grade: student.grade, classNo: student.classNo, studentId: student.id, payload: { kind: '접수', sym }, ts: v.createdAt })
          if (nt.parent) offline.run({ type: 'emitStudent', studentId: student.id, payload: { kind: '접수', sym }, ts: v.createdAt })
        } else if (modeRef.current === 'backend') void apiCreateVisit(v, student.id)
        return v
      },
      startTreating: (id) => {
        const calledAt = Date.now()
        setStore((p) => ({
          ...p,
          visits: p.visits.map((v) =>
            v.id === id && v.status === 'waiting' ? { ...v, status: 'treating', calledAt } : v,
          ),
        }))
        const patch = { status: 'treating' as const, calledAt }
        if (modeRef.current === 'supabase') offline.run({ type: 'patchVisit', id, patch })
        else if (modeRef.current === 'backend') void apiPatchVisit(id, patch)
      },
      updateVisit: (id, patch) => {
        setStore((p) => ({ ...p, visits: p.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)) }))
        if (modeRef.current === 'supabase') offline.run({ type: 'patchVisit', id, patch })
        else if (modeRef.current === 'backend') void apiPatchVisit(id, patch)
      },
      completeVisit: (id, patch) => {
        const treatedAt = Date.now()
        setStore((p) => ({
          ...p,
          visits: p.visits.map((v) =>
            v.id === id ? { ...v, ...patch, status: 'done', treatedAt } : v,
          ),
        }))
        const full = { ...patch, status: 'done' as const, treatedAt }
        if (modeRef.current === 'supabase') {
          offline.run({ type: 'patchVisit', id, patch: full })
          const sid = store.links[id]
          const student = sid ? findStudent(sid) : undefined
          if (student) {
            const cur = store.visits.find((v) => v.id === id)
            // 관찰 → 최종 결과 전환처럼 patch에 병명·처치가 없으면 저장된 방문값으로 보완(알림 누락 방지).
            const diseases = patch.diseases ?? cur?.diseases ?? []
            const prim = diseases.find((d) => d.isPrimary) ?? diseases[0]
            const sym = cur?.symptomTileIds.map((t) => tileById(t)?.label).filter(Boolean).join(' · ')
            const p = {
              kind: '종료' as const,
              outcome: (patch.outcome as string) ?? cur?.outcome ?? '교실 복귀',
              disease: prim?.name,
              treatments: patch.treatments ?? cur?.treatments,
              sym,
            }
            const nt = loadNotifyTargets()
            if (nt.teacher) offline.run({ type: 'emitClass', grade: student.grade, classNo: student.classNo, studentId: student.id, payload: p, ts: treatedAt })
            if (nt.parent) offline.run({ type: 'emitStudent', studentId: student.id, payload: p, ts: treatedAt })
          }
        } else if (modeRef.current === 'backend') void apiPatchVisit(id, full)
      },
      // 방문 삭제(학생이 교실로 가버린 경우 등). 로컬에서 제거 + 클라우드 삭제.
      deleteVisit: (id) => {
        setStore((p) => {
          const links = { ...p.links }
          delete links[id]
          return { visits: p.visits.filter((v) => v.id !== id), links }
        })
        if (modeRef.current === 'supabase') offline.run({ type: 'deleteVisit', id })
        // backend 모드는 서버 삭제 API 미구현 — 로컬 제거만(데모/연수는 supabase·local 사용)
      },
    }),
    [store, mode],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useVisits(): VisitsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useVisits must be used within VisitsProvider')
  return ctx
}

export function minutesSince(ts: number): number {
  return Math.max(0, Math.floor((Date.now() - ts) / 60000))
}
