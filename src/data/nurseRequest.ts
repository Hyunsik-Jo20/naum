// 교사 → 보건교사 요청(보건실 요청·전학 안내) 진입점 — 클라우드(supabase relay) 또는 로컬 데모 시뮬 자동 분기.
//  · supabase 모드: relay_nurse_inbox(반 키 암호문). 실제 기기 간 전달.
//  · local/demo 모드: localStorage 시뮬(같은 브라우저 데모). 암호화 없이 평문(로컬 전용).
import { SUPABASE_ENABLED } from './supabaseClient'
import * as cloud from '../api/supabaseRelay'
import type { NurseRequest, NurseInboxItem } from '../api/supabaseRelay'

export type { NurseRequest, NurseInboxItem }

const LS = 'naum.relay.nurseinbox'
const EVT = 'naum:nursereq'
let seq = 0

function lload(): NurseInboxItem[] {
  try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function lsave(a: NurseInboxItem[]) {
  try { localStorage.setItem(LS, JSON.stringify(a)) } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT))
}

/** 교사 발신. */
export async function sendNurseRequest(req: NurseRequest): Promise<void> {
  const ts = Date.now()
  if (SUPABASE_ENABLED) return cloud.emitNurseRequest(req, ts)
  const a = lload()
  a.unshift({ id: ts * 1000 + (seq++ % 1000), ts, req })
  lsave(a.slice(0, 100))
}

/** 보건교사 수신. classes=명부의 (grade,classNo) 목록(복호 키 결정용). */
export async function loadRequests(classes: { grade: number; classNo: number }[]): Promise<NurseInboxItem[]> {
  if (SUPABASE_ENABLED) return cloud.loadNurseRequests(classes)
  return lload()
}

/** 보건교사: 처리 완료 요청 제거. */
export async function removeRequest(id: number): Promise<void> {
  if (SUPABASE_ENABLED) return cloud.deleteNurseRequest(id)
  lsave(lload().filter((x) => x.id !== id))
}

/** 보건교사: 인박스 변경 구독(정리 함수 반환). */
export function subscribeRequests(onChange: () => void): () => void {
  if (SUPABASE_ENABLED) {
    let un: (() => void) | null = null
    let dead = false
    void cloud.subscribeNurse(onChange).then((u) => { if (dead) u(); else un = u })
    return () => { dead = true; un?.() }
  }
  const h = () => onChange()
  window.addEventListener(EVT, h)
  window.addEventListener('storage', h)
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h) }
}
