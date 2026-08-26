// 교육청 학교 등록부 — 실제 부산 학교 명단(busanSchools) 기반. (구 데모 합성 지표는 전부 제거 —
//  방문 수치는 이제 실데이터 계층 eduLive.ts가 실제 접수 방문으로 계산한다.)
import { BUSAN_OFFICES, BUSAN_REGIONS, busanSchools, type SchoolLevel } from './busanSchools'

export type { SchoolLevel }

/** 학교 등록부 항목 — 실측 필드만(방문 통계는 EduSchoolStats(eduLive)가 실데이터로 얹음). */
export interface EduSchool {
  id: string
  name: string
  region: string
  office: string
  level: SchoolLevel
  lat: number
  lon: number
  tel: string // 학교 전화번호 (실제 데이터)
  enroll?: number // 재학생 수 — 교육청이 입력(선택). 율(per-1000) 지표에 사용, 없으면 생략
  temp?: boolean // 임시 학교(사용자가 추가한 연수/테스트용 — 실제 학교 아님)
}

export const EDU_REGIONS = BUSAN_REGIONS
export const EDU_OFFICES = BUSAN_OFFICES
export const EDU_LEVELS: SchoolLevel[] = ['초', '중', '고', '특', '기타']
export const EDU_PERIODS = ['오늘', '이번 주', '이번 달'] as const
export type EduPeriod = (typeof EDU_PERIODS)[number]

export const eduSchools: EduSchool[] = busanSchools.map((s) => ({
  id: s.id,
  name: s.name,
  region: s.region,
  office: s.office,
  level: s.level,
  lat: s.lat,
  lon: s.lon,
  tel: s.tel,
}))

/** 사용자가 새로 추가/증설한 학교 — 입력 그대로(합성 없음). */
export interface NewSchoolInput {
  id: string
  name: string
  region: string
  office: string
  level: SchoolLevel
  lat: number
  lon: number
  tel?: string
  enroll?: number
  temp?: boolean
}

export function makeEduSchool(input: NewSchoolInput): EduSchool {
  return {
    id: input.id,
    name: input.name,
    region: input.region,
    office: input.office,
    level: input.level,
    lat: input.lat,
    lon: input.lon,
    tel: input.tel ?? '',
    enroll: input.enroll && input.enroll > 0 ? input.enroll : undefined,
    temp: input.temp,
  }
}
