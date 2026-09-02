// 증상 타일 목록 다기기 동기화 — 편집(콘솔)은 클라우드(school_settings)에 저장되고,
//  각 기기는 부팅·키오스크 대기화면 복귀 시 클라우드와 localStorage를 비교해
//  다르면 갱신한다(true 반환 → 호출측이 새로고침해 모듈 초기화에 반영).
//  배경: 기존에는 localStorage에만 저장되어 편집한 기기 외(키오스크 태블릿 등)에 반영되지 않았다.
import { SUPABASE_ENABLED } from './supabaseClient'
import { fetchCloudSymptoms } from '../api/supabaseBackend'

const LS = 'naum.symptoms'

/** 클라우드 증상 목록을 로컬로 동기화. 갱신했으면 true(호출측에서 새로고침 필요). */
export async function syncSymptomsFromCloud(): Promise<boolean> {
  if (!SUPABASE_ENABLED) return false
  try {
    const cloud = await fetchCloudSymptoms()
    if (!cloud) return false
    const next = JSON.stringify(cloud)
    const cur = localStorage.getItem(LS)
    if (cur === next) return false
    localStorage.setItem(LS, next)
    return true
  } catch {
    return false
  }
}
