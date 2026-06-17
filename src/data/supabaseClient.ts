// Supabase 클라이언트 — 환경변수가 있을 때만 생성된다.
//  · VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 모두 있으면 클라우드 모드.
//  · 없으면 null → 앱은 기존 로컬(in-browser / Node 백엔드) 모드로 동작(연수용 데모 무변경).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** 클라우드 모드 사용 가능 여부. */
export const SUPABASE_ENABLED = Boolean(url && anon)

/** 설정돼 있을 때만 실제 클라이언트, 아니면 null. */
export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
