// 로컬 스테이션(클라우드 모드용) — visit_id ↔ student_id 링크를 브라우저에만 보관.
//  클라우드(Supabase)에는 절대 올리지 않는 재식별 키. 이름 복원은 이 링크 + 로컬 명부로만.
//  저장은 secureStore(학교 키 AES-GCM 암호화) 경유 — localStorage에는 암호문만 남는다.
//  (Node 백엔드 모드에서는 station 서버가 이 역할을 하고, 여기는 Supabase 모드 전용.)
import { getSecureRaw, setSecureRaw } from './secureStore'

const LS_LINKS = 'naum.station.links'

export type LinkMap = Record<string, string> // visitId → studentId

export function loadLinks(): LinkMap {
  try {
    const o = JSON.parse(getSecureRaw(LS_LINKS) || '{}')
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

export function saveLink(visitId: string, studentId: string): void {
  const m = loadLinks()
  m[visitId] = studentId
  setSecureRaw(LS_LINKS, JSON.stringify(m))
}
