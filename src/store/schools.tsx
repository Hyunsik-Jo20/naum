// 학교 명부 설정 스토어 — 매년 폐교/증설/정보변경을 반영.
// 기본 명부(eduSchools, 부산 642교)에 localStorage CRUD 오버레이를 병합해 유효 명부를 제공.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { eduSchools, makeEduSchool, type EduSchool, type NewSchoolInput } from '../data/eduMock'
import { supabase, SUPABASE_ENABLED } from '../data/supabaseClient'

const LS_KEY = 'naum.schools'
const APP_STATE_KEY = 'schools.overlay'

interface Overlay {
  added: EduSchool[] // 사용자 증설
  removed: string[] // 폐교(기본 명부 id)
  edited: Record<string, Partial<Pick<EduSchool, 'name' | 'region' | 'office' | 'level' | 'lat' | 'lon' | 'tel' | 'enroll'>>>
}

const EMPTY: Overlay = { added: [], removed: [], edited: {} }

function load(): Overlay {
  try {
    const o = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (o && typeof o === 'object') return { added: o.added ?? [], removed: o.removed ?? [], edited: o.edited ?? {} }
  } catch {
    /* ignore */
  }
  return EMPTY
}

function save(o: Overlay) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o))
  } catch {
    /* ignore */
  }
}

// 오버레이 영속: 클라우드 모드면 Supabase app_state(모든 기기 공유), 아니면 localStorage.
function persistOverlay(o: Overlay) {
  if (SUPABASE_ENABLED && supabase) {
    void supabase.from('app_state').upsert({ key: APP_STATE_KEY, value: o, updated_at: new Date().toISOString() })
    save(o) // 로컬 캐시(오프라인/즉시 복원)
  } else {
    save(o)
  }
}

function applyOverlay(o: Overlay): EduSchool[] {
  const removed = new Set(o.removed)
  const list = eduSchools
    .filter((s) => !removed.has(s.id))
    .map((s) => (o.edited[s.id] ? { ...s, ...o.edited[s.id] } : s))
  const added = o.added.filter((s) => !removed.has(s.id))
  return [...list, ...added]
}

interface SchoolsCtx {
  schools: EduSchool[]
  baseCount: number // 기본 명부 수
  addedCount: number
  removedCount: number
  isCustom: (id: string) => boolean
  addSchool: (input: NewSchoolInput) => void
  updateSchool: (id: string, patch: Partial<NewSchoolInput>) => void
  removeSchool: (id: string) => void
  restoreSchool: (id: string) => void // 폐교 취소(기본 명부 복원)
  resetAll: () => void
}

const Ctx = createContext<SchoolsCtx | null>(null)

export function SchoolsProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<Overlay>(() => load())

  // 클라우드 모드: 공유 오버레이를 Supabase에서 불러와 모든 기기에서 동일하게.
  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) return
    let ok = true
    supabase
      .from('app_state')
      .select('value')
      .eq('key', APP_STATE_KEY)
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.value as Overlay | undefined
        if (ok && v) setOverlay({ added: v.added ?? [], removed: v.removed ?? [], edited: v.edited ?? {} })
      })
    return () => {
      ok = false
    }
  }, [])

  const mutate = useCallback((fn: (o: Overlay) => Overlay) => {
    setOverlay((prev) => {
      const next = fn(prev)
      persistOverlay(next)
      return next
    })
  }, [])

  const addedIds = useMemo(() => new Set(overlay.added.map((s) => s.id)), [overlay.added])

  const api = useMemo<SchoolsCtx>(() => {
    const schools = applyOverlay(overlay)
    return {
      schools,
      baseCount: eduSchools.length - overlay.removed.filter((id) => !addedIds.has(id)).length,
      addedCount: overlay.added.length,
      removedCount: overlay.removed.length,
      isCustom: (id) => addedIds.has(id),
      addSchool: (input) =>
        mutate((o) => ({ ...o, added: [...o.added, makeEduSchool(input)] })),
      updateSchool: (id, patch) =>
        mutate((o) => {
          // 추가한 학교면 added 안에서 직접 수정
          if (addedIds.has(id)) {
            return { ...o, added: o.added.map((s) => (s.id === id ? makeEduSchool({ ...s, ...patch, id }) : s)) }
          }
          return { ...o, edited: { ...o.edited, [id]: { ...o.edited[id], ...patch } } }
        }),
      removeSchool: (id) =>
        mutate((o) => {
          if (addedIds.has(id)) return { ...o, added: o.added.filter((s) => s.id !== id) }
          return { ...o, removed: o.removed.includes(id) ? o.removed : [...o.removed, id] }
        }),
      restoreSchool: (id) => mutate((o) => ({ ...o, removed: o.removed.filter((r) => r !== id) })),
      resetAll: () => mutate(() => EMPTY),
    }
  }, [overlay, addedIds, mutate])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useSchools(): SchoolsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSchools must be used within SchoolsProvider')
  return ctx
}
