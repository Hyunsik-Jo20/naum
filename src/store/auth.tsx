// 역할 로그인 — 두 가지 모드:
//  · demo(로컬/연수): 역할 4탭 + PIN 1234. 세션은 localStorage.
//  · supabase(클라우드): 이메일+비밀번호(Supabase Auth) 단일 폼. 역할/소속은 profiles 테이블에서.
//    (향후 휴대폰 OTP 전환 시 loginPassword → signInWithOtp 로만 교체하면 됨.)
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SCHOOL } from '../data/location'
import { students } from '../data/mock'
import { supabase, SUPABASE_ENABLED } from '../data/supabaseClient'
import { decodeLoginToken } from '../data/schoolCrypto'

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
// 오프라인 세션 캐시(supabase 모드) — 인터넷 없이도 로그인 상태 유지(콘솔/키오스크 사용).
const LS_SESSION_CACHE = 'naum.session.cache'
function cacheSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(LS_SESSION_CACHE, JSON.stringify(s))
    else localStorage.removeItem(LS_SESSION_CACHE)
  } catch {
    /* ignore */
  }
}
function loadCachedSession(): Session | null {
  try {
    const o = JSON.parse(localStorage.getItem(LS_SESSION_CACHE) || 'null')
    return o && o.role ? (o as Session) : null
  } catch {
    return null
  }
}

// 토큰 로그인 세션(교사·학부모, Supabase 계정 없이 로컬). 보건교사/교육청 세션과 상호배타.
const LS_TOKEN_SESSION = 'naum.tokensession'
function cacheTokenSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(LS_TOKEN_SESSION, JSON.stringify(s))
    else localStorage.removeItem(LS_TOKEN_SESSION)
  } catch {
    /* ignore */
  }
}
function loadTokenSession(): Session | null {
  try {
    const o = JSON.parse(localStorage.getItem(LS_TOKEN_SESSION) || 'null')
    return o && o.role ? (o as Session) : null
  } catch {
    return null
  }
}

interface TokenPayload { r: 't' | 'p' | 'n'; g?: number; c?: number; sid?: string; n?: string; org?: string }

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
  // 교사·학부모 — 보건교사가 발급한 토큰 + 학반/자녀 정보로 매칭(Supabase 계정 불필요).
  loginToken: (
    token: string,
    info: { grade?: number; classNo?: number; childName?: string; name?: string },
  ) => Promise<string | null>
  // 보건교사 최초 회원가입 — 교육청이 발급한 가입 토큰 + 이메일/비밀번호 등록.
  signupNurse: (
    token: string,
    info: { name: string; email: string; password: string },
  ) => Promise<string | null>
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

  // [supabase] 세션 복원 — 토큰 세션(교사/학부모) 우선, 없으면 Supabase 세션(보건교사/교육청).
  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) return
    let ok = true
    const sb = supabase
    ;(async () => {
      // 로그인 상태 유지 OFF + 새 브라우저 세션 → 모두 만료(세션 한정 로그인)
      try {
        if (localStorage.getItem('naum.persistLogin') === '0' && !sessionStorage.getItem('naum.alive')) {
          cacheTokenSession(null)
          await sb.auth.signOut()
        }
        sessionStorage.setItem('naum.alive', '1')
      } catch {
        /* ignore */
      }
      // 1) 토큰 세션(교사/학부모)
      const tok = loadTokenSession()
      if (tok) {
        if (ok) {
          setSession(tok)
          setAuthLoading(false)
        }
        return
      }
      // 2) Supabase 세션(보건교사/교육청)
      const { data } = await sb.auth.getSession()
      const uid = data.session?.user.id
      let s = uid ? await loadProfileSession(uid) : null
      if (!s && uid) s = loadCachedSession()
      if (ok) {
        setSession(s)
        cacheSession(s)
        setAuthLoading(false)
      }
    })()
    const { data: sub } = sb.auth.onAuthStateChange(async (_e, sess) => {
      if (loadTokenSession()) return // 토큰 세션 중엔 Supabase 상태로 덮지 않음
      let s = sess?.user ? await loadProfileSession(sess.user.id) : null
      if (!s && sess?.user) s = loadCachedSession()
      if (ok) {
        setSession(s)
        cacheSession(s)
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
        cacheSession(s) // 오프라인 복원용
        return null
      },
      // 교사·학부모 토큰 로그인 — 토큰 복호 + 입력 정보 매칭 → 로컬 세션.
      loginToken: async (token, info) => {
        const p = await decodeLoginToken<TokenPayload>(token)
        if (!p || (p.r !== 't' && p.r !== 'p')) return '토큰이 올바르지 않습니다. 보건교사에게 다시 받아주세요.'
        if (p.r === 't') {
          if (info.grade !== p.g || info.classNo !== p.c) return '학년·반이 토큰과 일치하지 않습니다.'
          const s: Session = {
            role: 'teacher',
            name: info.name?.trim() || `${p.g}-${p.c} 담임`,
            org: SCHOOL.name,
            grade: p.g,
            classNo: p.c,
          }
          cacheTokenSession(s)
          setSession(s)
          return null
        }
        const childName = (info.childName ?? '').trim()
        if (!p.sid || !childName || childName !== (p.n ?? '')) return '자녀 이름이 토큰과 일치하지 않습니다.'
        const s: Session = { role: 'parent', name: `${p.n} 보호자`, org: SCHOOL.name, childId: p.sid, childName: p.n }
        cacheTokenSession(s)
        setSession(s)
        return null
      },
      // 보건교사 회원가입 — 교육청 가입 토큰 검증 후 Supabase 계정 생성(role=nurse 프로필 자동).
      signupNurse: async (token, info) => {
        if (!supabase) return '클라우드 인증이 설정되지 않았습니다.'
        const p = await decodeLoginToken<TokenPayload>(token)
        if (!p || p.r !== 'n') return '가입 토큰이 올바르지 않습니다. 교육청에서 받은 토큰을 확인하세요.'
        if (!info.email.trim() || !info.password) return '이메일과 비밀번호를 입력하세요.'
        if (info.password.length < 6) return '비밀번호는 6자 이상으로 설정하세요.'
        const { error } = await supabase.auth.signUp({
          email: info.email.trim(),
          password: info.password,
          options: { data: { role: 'nurse', name: info.name.trim() || '보건교사', org: p.org || SCHOOL.name } },
        })
        if (error) {
          return /registered|already/i.test(error.message)
            ? '이미 가입된 이메일입니다. 로그인하세요.'
            : `가입 실패: ${error.message}`
        }
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
          cacheTokenSession(null) // 교사/학부모 토큰 세션
          cacheSession(null)
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
