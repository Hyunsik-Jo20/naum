// Supabase(클라우드) 데이터 계층 — Node 백엔드(backend.ts)와 동일한 역할.
//  · 비식별 Visit 만 Supabase에 저장/구독(Realtime).
//  · visit↔student 링크(PII)는 클라우드로 보내지 않고 로컬 스테이션(localStation)에 보관.
//  · 화면(VisitsCtx)은 그대로 — visits.tsx 의 supabase 모드에서만 사용.
import type { Disease, Outcome, Sex, Visit, VisitStatus } from '../types'
import { supabase } from '../data/supabaseClient'
import { saveLink } from '../data/localStation'
import { schoolLinkKey, encryptJson, decryptJson, type Enc } from '../data/schoolCrypto'

const SCHOOL_ID = (import.meta.env.VITE_SCHOOL_ID as string | undefined) || 'demo'

// DB(snake_case) ↔ Visit(camelCase) 매핑
interface Row {
  id: string
  grade: number
  sex: Sex
  symptom_tile_ids: string[]
  status: VisitStatus
  ticket: number
  diseases: Disease[]
  treatments: string[]
  outcome: Outcome | null
  escort: string[] | null
  transport: '자가' | '119' | null
  guardian_handoff: boolean | null
  created_at: number
  called_at: number | null
  treated_at: number | null
  observe_until: number | null
}

function fromRow(r: Row): Visit {
  return {
    id: r.id,
    grade: r.grade,
    sex: r.sex,
    symptomTileIds: r.symptom_tile_ids ?? [],
    status: r.status,
    ticket: r.ticket,
    diseases: r.diseases ?? [],
    treatments: r.treatments ?? [],
    outcome: r.outcome ?? undefined,
    escort: r.escort ?? undefined,
    transport: r.transport ?? undefined,
    guardianHandoff: r.guardian_handoff ?? undefined,
    createdAt: r.created_at,
    calledAt: r.called_at ?? undefined,
    treatedAt: r.treated_at ?? undefined,
    observeUntil: r.observe_until ?? undefined,
  }
}

function toRow(v: Visit): Row & { school_id: string } {
  return {
    id: v.id,
    school_id: SCHOOL_ID,
    grade: v.grade,
    sex: v.sex,
    symptom_tile_ids: v.symptomTileIds,
    status: v.status,
    ticket: v.ticket,
    diseases: v.diseases,
    treatments: v.treatments,
    outcome: v.outcome ?? null,
    escort: v.escort ?? null,
    transport: v.transport ?? null,
    guardian_handoff: v.guardianHandoff ?? null,
    created_at: v.createdAt,
    called_at: v.calledAt ?? null,
    treated_at: v.treatedAt ?? null,
    observe_until: v.observeUntil ?? null,
  }
}

// 비식별 patch → 컬럼 patch (PII 키는 매핑 자체가 없어 전송 불가)
function patchToRow(p: Partial<Visit>): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  if (p.status !== undefined) r.status = p.status
  if (p.ticket !== undefined) r.ticket = p.ticket
  if (p.diseases !== undefined) r.diseases = p.diseases
  if (p.treatments !== undefined) r.treatments = p.treatments
  if (p.outcome !== undefined) r.outcome = p.outcome
  if (p.escort !== undefined) r.escort = p.escort
  if (p.transport !== undefined) r.transport = p.transport
  if (p.guardianHandoff !== undefined) r.guardian_handoff = p.guardianHandoff
  if (p.calledAt !== undefined) r.called_at = p.calledAt
  if (p.treatedAt !== undefined) r.treated_at = p.treatedAt
  if (p.observeUntil !== undefined) r.observe_until = p.observeUntil
  return r
}

export async function fetchVisits(): Promise<Visit[]> {
  const sb = supabase!
  const { data, error } = await sb
    .from('visits')
    .select('*')
    .eq('school_id', SCHOOL_ID)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[naum:supabase] fetchVisits', error.message)
    return []
  }
  return (data as Row[]).map(fromRow)
}

/** 방문 생성: 비식별 visit + "암호화된 링크"를 Supabase로.
 *  - visit: 비식별(이름 없음).
 *  - visit_links.enc: studentId를 학교 키로 암호화한 암호문만 → 서버는 못 읽고, 다른 학교 기기는 복호화로 이름 복원.
 *  - 로컬에도 평문 링크 저장(같은 기기 즉시 복원).
 *  insert 사용 — anon은 INSERT 정책만 보유(upsert는 UPDATE까지 요구). 방문 id는 새 난수라 충돌 없음. */
export async function createVisit(visit: Visit, studentId: string): Promise<void> {
  saveLink(visit.id, studentId) // 로컬 평문(같은 기기)
  const sb = supabase!
  const { error } = await sb.from('visits').insert(toRow(visit))
  if (error) console.error('[naum:supabase] createVisit', error.message)
  try {
    const enc = await encryptJson(await schoolLinkKey(), studentId)
    const { error: le } = await sb
      .from('visit_links')
      .insert({ visit_id: visit.id, school_id: SCHOOL_ID, enc, created_at: visit.createdAt })
    if (le) console.error('[naum:supabase] createVisit link', le.message)
  } catch (e) {
    console.error('[naum:supabase] encrypt link', e)
  }
}

/** 암호화 링크 전체를 받아 복호화 → { visitId: studentId } (다기기 이름 복원). */
export async function fetchLinks(): Promise<Record<string, string>> {
  const sb = supabase!
  const { data, error } = await sb
    .from('visit_links')
    .select('visit_id, enc')
    .eq('school_id', SCHOOL_ID)
  if (error || !data) return {}
  const key = await schoolLinkKey()
  const out: Record<string, string> = {}
  for (const row of data as { visit_id: string; enc: Enc }[]) {
    try {
      out[row.visit_id] = await decryptJson<string>(key, row.enc)
    } catch {
      /* 키 불일치 등 — 해당 링크는 건너뜀(이름 미복원) */
    }
  }
  return out
}

/** 암호화 링크 생성 구독 → 복호화하여 콜백(다른 기기 콘솔에서도 이름 복원). */
export function subscribeLinks(onLink: (l: { visitId: string; studentId: string }) => void): () => void {
  const sb = supabase!
  const ch = sb
    .channel('naum-links')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'visit_links', filter: `school_id=eq.${SCHOOL_ID}` },
      async (payload) => {
        const row = payload.new as { visit_id: string; enc: Enc }
        if (!row?.visit_id) return
        try {
          const studentId = await decryptJson<string>(await schoolLinkKey(), row.enc)
          onLink({ visitId: row.visit_id, studentId })
        } catch {
          /* 복호화 실패 시 무시 */
        }
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(ch)
  }
}

/** 방문 수정(비식별 필드만). */
export async function patchVisit(id: string, patch: Partial<Visit>): Promise<void> {
  const sb = supabase!
  const { error } = await sb.from('visits').update(patchToRow(patch)).eq('id', id)
  if (error) console.error('[naum:supabase] patchVisit', error.message)
}

/** 비식별 방문 변경 실시간 구독(Supabase Realtime). 반환값은 구독 해제 함수. */
export function subscribeVisits(onVisit: (v: Visit) => void): () => void {
  const sb = supabase!
  const ch = sb
    .channel('naum-visits')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'visits', filter: `school_id=eq.${SCHOOL_ID}` },
      (payload) => {
        const row = payload.new as Row
        if (row && row.id) onVisit(fromRow(row))
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(ch)
  }
}
