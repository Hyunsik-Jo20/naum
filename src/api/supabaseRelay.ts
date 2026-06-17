// 클라우드 relay(교사·학부모 알림) — Supabase relay_class_inbox / relay_student_inbox.
//  서버에는 "토큰 + 암호문"만. 키(학교 결정적 파생)는 클라이언트에만 → 서버는 누구·내용 모름.
//  로컬 데모 모드는 기존 relay.ts(localStorage)를 그대로 쓰고, 이 모듈은 supabase 모드 전용.
import { supabase } from '../data/supabaseClient'
import {
  schoolClassKey,
  schoolStudentKey,
  schoolClassToken,
  schoolStudentToken,
  encryptJson,
  decryptJson,
  type Enc,
} from '../data/schoolCrypto'
import type { ClassPayload } from '../data/station'

export type { ClassPayload }
export interface RelayEvent { studentToken: string; enc: Enc; ts: number }

// ── 발신(스테이션/키오스크 측) ──
/** 반 채널로 한 이벤트 발신(암호화). */
export async function emitClass(grade: number, classNo: number, studentId: string, payload: ClassPayload, ts: number) {
  const sb = supabase!
  const [classToken, studentToken, enc] = await Promise.all([
    schoolClassToken(grade, classNo),
    schoolStudentToken(studentId),
    schoolClassKey(grade, classNo).then((k) => encryptJson(k, payload)),
  ])
  const { error } = await sb.from('relay_class_inbox').insert({ class_token: classToken, student_token: studentToken, enc, ts })
  if (error) console.error('[naum:relay] emitClass', error.message)
}

/** 학생(보호자) 채널로 한 이벤트 발신(암호화). */
export async function emitStudent(studentId: string, payload: ClassPayload, ts: number) {
  const sb = supabase!
  const [studentToken, enc] = await Promise.all([
    schoolStudentToken(studentId),
    schoolStudentKey(studentId).then((k) => encryptJson(k, payload)),
  ])
  const { error } = await sb.from('relay_student_inbox').insert({ student_token: studentToken, enc, ts })
  if (error) console.error('[naum:relay] emitStudent', error.message)
}

// ── 수신(교사/학부모 측) ──
type DecEvent = { studentToken: string; ts: number; payload: ClassPayload | null }

/** 담임: 우리 반 채널 수신 + 반 키로 복호화. */
export async function loadClassEvents(grade: number, classNo: number): Promise<DecEvent[]> {
  const sb = supabase!
  const [classToken, key] = await Promise.all([schoolClassToken(grade, classNo), schoolClassKey(grade, classNo)])
  const { data, error } = await sb
    .from('relay_class_inbox')
    .select('student_token, enc, ts')
    .eq('class_token', classToken)
    .order('ts', { ascending: false })
  if (error || !data) return []
  return Promise.all(
    (data as { student_token: string; enc: Enc; ts: number }[]).map(async (r) => ({
      studentToken: r.student_token,
      ts: r.ts,
      payload: await decryptJson<ClassPayload>(key, r.enc).catch(() => null),
    })),
  )
}

/** 학부모: 자녀 채널 수신 + 학생 키로 복호화. */
export async function loadStudentEvents(studentId: string): Promise<DecEvent[]> {
  const sb = supabase!
  const [studentToken, key] = await Promise.all([schoolStudentToken(studentId), schoolStudentKey(studentId)])
  const { data, error } = await sb
    .from('relay_student_inbox')
    .select('enc, ts')
    .eq('student_token', studentToken)
    .order('ts', { ascending: false })
  if (error || !data) return []
  return Promise.all(
    (data as { enc: Enc; ts: number }[]).map(async (r) => ({
      studentToken,
      ts: r.ts,
      payload: await decryptJson<ClassPayload>(key, r.enc).catch(() => null),
    })),
  )
}

/** 반 채널 신규 이벤트 실시간 구독(콜백은 재조회 트리거용). */
export async function subscribeClass(grade: number, classNo: number, onChange: () => void): Promise<() => void> {
  const sb = supabase!
  const classToken = await schoolClassToken(grade, classNo)
  const ch = sb
    .channel(`relay-class-${classToken}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'relay_class_inbox', filter: `class_token=eq.${classToken}` }, onChange)
    .subscribe()
  return () => { void sb.removeChannel(ch) }
}

/** 학생 채널 신규 이벤트 실시간 구독. */
export async function subscribeStudent(studentId: string, onChange: () => void): Promise<() => void> {
  const sb = supabase!
  const studentToken = await schoolStudentToken(studentId)
  const ch = sb
    .channel(`relay-student-${studentToken}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'relay_student_inbox', filter: `student_token=eq.${studentToken}` }, onChange)
    .subscribe()
  return () => { void sb.removeChannel(ch) }
}

/** 토큰 → 학생 매핑(담임용): 우리 반 학생들의 결정적 토큰을 계산해 역참조 테이블 구성. */
export async function buildClassTokenMap(students: { id: string; name: string; number: number }[]): Promise<Record<string, { name: string; number: number }>> {
  const out: Record<string, { name: string; number: number }> = {}
  await Promise.all(
    students.map(async (s) => {
      out[await schoolStudentToken(s.id)] = { name: s.name, number: s.number }
    }),
  )
  return out
}
