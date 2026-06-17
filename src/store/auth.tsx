// 역할 로그인 — 두 가지 모드:
//  · demo(로컬/연수): 역할 4탭 + PIN 1234. 세션은 localStorage.
//  · supabase(클라우드): 이메일+비밀번호(Supabase Auth) 단일 폼. 역할/소속은 profiles 테이블에서.
//    (향후 휴대폰 OTP 전환 시 loginPassword → signInWithOtp 로만 교체하면 됨.)
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SCHOOL } from '../data/location'
import { students } from '../data/mock'
import { supabase, SUPABASE_ENABLED } from '../data/supabaseClient'

export { SUPABASE_ENABLED }

export type Role = 'nurse' | 'edu' | 'teacher' | 'parent'
export interface Session {
  role: Role
  name: string
  org: string // 학교명 또는 교육청
  grade?: number // 교사: 담당 학년
  classNo?: number // 교사: 담당 반
  childId?: string // 학부모: 자녀 학생 id
  childName?: string // 학부모: 자녀 이름
}

const LS_KEY = 'naum.session'

function load(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    return s && (s.role === 'nurse' || s.role === 'edu') ? s : null
  } catch {
    return null
  }
}

interface AuthCtx {
  session: Session | null
  authMode: 'supabase' | 'demo'
  authLoading: boolean // supabase 모드: 최초 세션 복원 중이면 true(보호 라우트가 튕기지 않게)
  // 클라우드(supabase) 모드 — 이메일+비밀번호. 역할/소속은 profiles에서 로드.
  loginPassword: (email: string, password: string) => Promise<string | null>
  // 데모(로컬) 모드 — 역할별 PIN 1234.
  loginNurse: (name: string, pin: string) => string | null
  loginEdu: (id: string, pw: string) => string | null
  loginTeacher: (name: string, grade: number, classNo: number, pin: string) => string | null
  loginParent: (childName: string, pin: string) => string | null
  logout: () => void
}

/** profiles 행 → Session 매핑(supabase 모드). */
async function loadProfileSession(userId: string): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('role,name,org,grade,class_no,child_id,child_name')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  const r = data as {
    role: Role; name: string; org: string
    grade: number | null; class_no: number | null; child_id: string | null; child_name: string | null
  }
  return {
    role: r.role,
    name: r.name,
    org: r.org,
    grade: r.grade ?? undefined,
    classNo: r.class_no ?? undefined,
    childId: r.child_id ?? undefined,
    childName: r.child_name ?? undefined,
  }
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // supabase 모드는 Supabase가 세션을 관리(아래 useEffect에서 하이드레이트), 데모는 localStorage.
  const [session, setSession] = useState<Session | null>(() => (SUPABASE_ENABLED ? null : load()))
  // supabase 모드: 최초 세션 복원 전까지 true(딥링크/새로고침 시 보호 라우트가 성급히 튕기는 것 방지).
  const [authLoading, setAuthLoading] = useState<boolean>(SUPABASE_ENABLED)

  const persist = (s: Session | null) => {
    setSession(s)
    try {
      if (s) localStorage.setItem(LS_KEY, JSON.stringify(s))
      else localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }

  // [supabase] 기존 세션 복원 + 인증 상태 변화 구독 → profiles에서 역할 로드.
  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) return
    let ok = true
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id
      const s = uid ? await loadProfileSession(uid) : null
      if (ok) {
        setSession(s)
        setAuthLoading(false)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, sess) => {
      const s = sess?.user ? await loadProfileSession(sess.user.id) : null
      if (ok) {
        setSession(s)
        setAuthLoading(false)
      }
    })
    return () => {
      ok = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const api = useMemo<AuthCtx>(
    () => ({
      session,
      authMode: SUPABASE_ENABLED ? 'supabase' : 'demo',
      authLoading,
      // [supabase] 이메일+비밀번호 로그인 → 세션은 onAuthStateChange가 profiles로 채움.
      loginPassword: async (email, password) => {
        if (!supabase) return '클라우드 인증이 설정되지 않았습니다.'
        if (!email.trim() || !password) return '이메일과 비밀번호를 입력하세요.'
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) return '이메일 또는 비밀번호가 올바르지 않습니다.'
        const s = data.user ? await loadProfileSession(data.user.id) : null
        if (!s) return '계정에 역할(프로필)이 설정되어 있지 않습니다. 관리자에게 문의하세요.'
        setSession(s)
        return null
      },
      // 데모: PIN 1234
      loginNurse: (name, pin) => {
        if (!name.trim()) return '이름을 입력하세요.'
        if (pin !== '1234') return 'PIN이 올바르지 않습니다. (데모: 1234)'
        persist({ role: 'nurse', name: name.trim(), org: SCHOOL.name })
        return null
      },
      // 데모: edu / 1234
      loginEdu: (id, pw) => {
        const ok = (id === 'edu' || id === '교육청') && pw === '1234'
        if (!ok) return '아이디 또는 비밀번호가 올바르지 않습니다. (데모: edu / 1234)'
        persist({ role: 'edu', name: '교육청 담당자', org: '부산광역시교육청' })
        return null
      },
      // 교사(담임) — 데모 PIN 1234. 담당 학년·반의 학생 알림만 본다.
      loginTeacher: (name, grade, classNo, pin) => {
        if (!name.trim()) return '이름을 입력하세요.'
        if (pin !== '1234') return 'PIN이 올바르지 않습니다. (데모: 1234)'
        persist({ role: 'teacher', name: name.trim(), org: SCHOOL.name, grade, classNo })
        return null
      },
      // 학부모 — 자녀 이름으로 매칭(데모). 실제: 등록 토큰/휴대폰 OTP. 자녀 알림만 본다.
      loginParent: (childName, pin) => {
        const q = childName.trim()
        if (!q) return '자녀 이름을 입력하세요.'
        if (pin !== '1234') return '인증번호가 올바르지 않습니다. (데모: 1234)'
        const child = students.find((s) => s.name === q)
        if (!child) return '명부에서 해당 자녀를 찾지 못했습니다.'
        persist({ role: 'parent', name: `${child.name} 보호자`, org: SCHOOL.name, childId: child.id, childName: child.name })
        return null
      },
      logout: () => {
        if (SUPABASE_ENABLED && supabase) {
          void supabase.auth.signOut()
          setSession(null)
        } else {
          persist(null)
        }
      },
    }),
    [session, authLoading],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
