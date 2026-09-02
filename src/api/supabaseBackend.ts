// Supabase(클라우드) 데이터 계층 — Node 백엔드(backend.ts)와 동일한 역할.
//  · 비식별 Visit 만 Supabase에 저장/구독(Realtime).
//  · visit↔student 링크(PII)는 클라우드로 보내지 않고 로컬 스테이션(localStation)에 보관.
//  · 화면(VisitsCtx)은 그대로 — visits.tsx 의 supabase 모드에서만 사용.
import type { Disease, Outcome, Sex, SymptomTile, Visit, VisitStatus } from '../types'
import { supabase } from '../data/supabaseClient'
import { saveLink } from '../data/localStation'
import { schoolLinkKey, encryptJson, decryptJson, type Enc } from '../data/schoolCrypto'
import { schoolId } from '../data/school'
import { uniqTopic } from '../data/realtimeUtil'

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
  is_staff?: boolean | null // 0015 — 교직원 방문(별도 집계). 구버전 행은 null(=학생).
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
    isStaff: r.is_staff ?? undefined,
  }
}

function toRow(v: Visit, sch: string): Row & { school_id: string } {
  return {
    id: v.id,
    school_id: sch,
    // is_staff는 교직원일 때만 포함 — 0015 미적용 DB에서도 학생 접수는 계속 동작
    ...(v.isStaff ? { is_staff: true } : {}),
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
    .eq('school_id', schoolId())
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
// unique_violation — 오프라인 큐 재시도로 같은 방문을 다시 넣으면 이미 존재. 성공으로 간주(멱등).
const DUP = '23505'

export async function createVisit(visit: Visit, studentId: string, sch: string = schoolId()): Promise<void> {
  saveLink(visit.id, studentId) // 로컬 평문(같은 기기)
  const sb = supabase!
  const { error } = await sb.from('visits').insert(toRow(visit, sch))
  if (error && error.code !== DUP) throw new Error(`createVisit: ${error.message}`) // 재시도 위해 전파
  // 암호화 링크(다기기 이름 복원) — 베스트에포트: 실패해도 방문은 저장됨(+로컬 링크 존재).
  try {
    const enc = await encryptJson(await schoolLinkKey(), studentId)
    const { error: le } = await sb
      .from('visit_links')
      .insert({ visit_id: visit.id, school_id: sch, enc, created_at: visit.createdAt })
    if (le && le.code !== DUP) console.error('[naum:supabase] createVisit link', le.message)
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
    .eq('school_id', schoolId())
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
    .channel(uniqTopic('naum-links'))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'visit_links', filter: `school_id=eq.${schoolId()}` },
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

/** 방문 수정(비식별 필드만). school_id 조건 = RLS(0012)와 이중 방어(타 학교 행 오수정 방지). */
export async function patchVisit(id: string, patch: Partial<Visit>): Promise<void> {
  const sb = supabase!
  const { error } = await sb.from('visits').update(patchToRow(patch)).eq('id', id).eq('school_id', schoolId())
  if (error) throw new Error(`patchVisit: ${error.message}`) // 재시도 위해 전파
}

/** 방문 삭제(교실로 가버린 경우 등) — 방문 + 암호화 링크 모두 제거. 자기 학교 행만. */
export async function deleteVisit(id: string): Promise<void> {
  const sb = supabase!
  const { error } = await sb.from('visits').delete().eq('id', id).eq('school_id', schoolId())
  if (error) throw new Error(`deleteVisit: ${error.message}`) // 재시도 위해 전파(삭제는 멱등)
  const { error: le } = await sb.from('visit_links').delete().eq('visit_id', id).eq('school_id', schoolId())
  if (le) console.error('[naum:supabase] deleteVisit link', le.message) // 베스트에포트
}

// ── 학교 공유 설정(0014 school_settings) — 증상 타일 목록 다기기 동기화 ──
/** 클라우드의 학교 증상 목록. 없으면 null(기본 목록 사용). */
export async function fetchCloudSymptoms(): Promise<SymptomTile[] | null> {
  const sb = supabase!
  const { data, error } = await sb
    .from('school_settings')
    .select('symptoms')
    .eq('school_id', schoolId())
    .maybeSingle()
  if (error || !data?.symptoms) return null
  const a = data.symptoms as SymptomTile[]
  return Array.isArray(a) && a.length ? a : null
}

/** 증상 목록을 클라우드에 저장(보건교사 전용 — RLS). 편집 기기 외 다른 기기 반영용. */
export async function saveCloudSymptoms(tiles: SymptomTile[]): Promise<void> {
  const sb = supabase!
  const { error } = await sb
    .from('school_settings')
    .upsert({ school_id: schoolId(), symptoms: tiles, updated_at: new Date().toISOString() })
  if (error) throw new Error(`saveCloudSymptoms: ${error.message}`)
}

/** 비식별 방문 변경 실시간 구독(Supabase Realtime). 반환값은 구독 해제 함수.
 *  DELETE는 old 레코드에 PK(id)만 남아 school_id 필터에 안 걸리므로 무필터로 따로 받는다
 *  (id는 비식별 난수 — 수신 측은 로컬에 있는 id만 제거하므로 타 학교 이벤트는 무해). */
export function subscribeVisits(onVisit: (v: Visit) => void, onDelete?: (id: string) => void): () => void {
  const sb = supabase!
  const ch = sb
    .channel(uniqTopic('naum-visits'))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'visits', filter: `school_id=eq.${schoolId()}` },
      (payload) => {
        const row = payload.new as Row
        if (row && row.id) onVisit(fromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'visits', filter: `school_id=eq.${schoolId()}` },
      (payload) => {
        const row = payload.new as Row
        if (row && row.id) onVisit(fromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'visits' },
      (payload) => {
        const old = payload.old as { id?: string } | null
        if (old?.id && onDelete) onDelete(old.id)
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(ch)
  }
}
