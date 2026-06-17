// 보건실 로컬 스테이션 측(시뮬). 방문을 "토큰 이벤트"로 만들어 중계 서버 반 채널로 보낸다.
// 여기서만 PII(이름)를 다루고, 서버/교사 채널에는 토큰만 나간다.
import type { Student, Visit } from '../types'
import { students, tileById } from '../data/mock'
import { getClassToken, getRoutingToken, type ClassMapEntry } from './routingTokens'
import { relaySetClassInbox, relaySetStudentInbox, type ClassEvent, type StudentEvent } from './relay'
import { encryptJson, getClassKey, getStudentKey } from './e2e'

function symText(v: Visit): string {
  return v.symptomTileIds.map((id) => tileById(id)?.label).filter(Boolean).join(' · ')
}

/** 담임에게 프로비저닝되는 "반 한정 식별 매핑"(학생토큰 ↔ 이름·번호). 자기 반만. */
export function classStudentMap(grade: number, classNo: number): ClassMapEntry[] {
  return students
    .filter((s) => s.grade === grade && s.classNo === classNo)
    .sort((a, b) => a.number - b.number)
    .map((s) => ({ token: getRoutingToken(s.id), name: s.name, number: s.number }))
}

/** 알림 내용(복호화 시 보이는 평문). 학부모·담임 친절 문구 생성에 쓰임. */
export interface ClassPayload {
  kind: '접수' | '종료'
  sym?: string // 증상
  outcome?: string // 결과(교실 복귀/귀가/병원 이송/관찰)
  disease?: string // 추정 병명(주증상)
  treatments?: string[] // 시행한 처치(기타 직접입력 포함)
}

/** 스테이션이 해당 반의 현재 방문을 "토큰 + 암호문" 이벤트로 중계에 push(스냅샷). 내용은 반 키로 E2E 암호화. */
export async function stationEmitClass(
  grade: number,
  classNo: number,
  visits: Visit[],
  studentOf: (id: string) => Student | undefined,
): Promise<number> {
  const classToken = getClassToken(grade, classNo)
  const key = await getClassKey(grade, classNo) // 스테이션이 가진 반 키(중계엔 없음)
  const mine = visits.filter((v) => {
    const s = studentOf(v.id)
    return s && s.grade === grade && s.classNo === classNo
  })
  const events: ClassEvent[] = await Promise.all(
    mine.map(async (v) => {
      const s = studentOf(v.id)!
      const done = v.status === 'done'
      const prim = v.diseases.find((d) => d.isPrimary) ?? v.diseases[0]
      const payload: ClassPayload = {
        kind: done ? '종료' : '접수',
        sym: symText(v),
        outcome: done ? v.outcome ?? '교실 복귀' : undefined,
        disease: done ? prim?.name : undefined,
        treatments: done ? v.treatments : undefined,
      }
      return {
        classToken,
        studentToken: getRoutingToken(s.id), // 서버로는 토큰만
        enc: await encryptJson(key, payload), // 내용은 암호문만
        ts: done ? v.treatedAt ?? v.createdAt : v.createdAt,
      }
    }),
  )
  relaySetClassInbox(classToken, events)
  return events.length
}

/** 스테이션이 한 학생의 현재 방문을 "토큰 + 암호문" 이벤트로 보호자 채널에 push. 내용은 학생 키로 E2E 암호화. */
export async function stationEmitStudent(
  studentId: string,
  visits: Visit[],
  studentOf: (id: string) => Student | undefined,
): Promise<number> {
  const studentToken = getRoutingToken(studentId)
  const key = await getStudentKey(studentId) // 스테이션·해당 학부모에게만 있는 학생 키
  const mine = visits.filter((v) => studentOf(v.id)?.id === studentId)
  const events: StudentEvent[] = await Promise.all(
    mine.map(async (v) => {
      const done = v.status === 'done'
      const prim = v.diseases.find((d) => d.isPrimary) ?? v.diseases[0]
      const payload: ClassPayload = {
        kind: done ? '종료' : '접수',
        sym: symText(v),
        outcome: done ? v.outcome ?? '교실 복귀' : undefined,
        disease: done ? prim?.name : undefined,
        treatments: done ? v.treatments : undefined,
      }
      return {
        studentToken, // 서버로는 토큰만
        enc: await encryptJson(key, payload), // 내용은 암호문만
        ts: done ? v.treatedAt ?? v.createdAt : v.createdAt,
      }
    }),
  )
  relaySetStudentInbox(studentToken, events)
  return events.length
}
