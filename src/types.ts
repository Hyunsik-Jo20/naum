export type DiseaseCategory =
  | '호흡기계'
  | '소화기계'
  | '순환기계'
  | '정신신경계'
  | '근골격계'
  | '피부피하계'
  | '비뇨생식기계'
  | '구강치아계'
  | '이비인후과계'
  | '안과계'
  | '감염병'
  | '기타'

export type Sex = '남' | '여'

export interface Student {
  id: string
  name: string
  grade: number
  classNo: number
  number: number
  sex: Sex
  guardianPhone?: string // 보호자 연락처(로컬 전용). 업로드 명부에서 채움.
  care?: string // 요보호 사유(천식·알레르기 등, 로컬 전용). 값이 있으면 요보호 학생.
}

/** 담임 외 교직원(로컬 전용) — 교직원 명부 업로드에서 학년·반이 빈 행. 콘솔 수동 접수 대상. */
export interface Staff {
  id: string
  name: string
  role?: string // 구분(교장·교감·행정·조리 등)
  sex?: Sex
  phone?: string
}

/** 학생 키오스크용 쉬운 말 + 그림 타일. disease/category는 보건교사 확정 시 추천 후보. */
export interface SymptomTile {
  id: string
  label: string
  icon: string
  category: DiseaseCategory
  disease: string
}

export type VisitStatus = 'waiting' | 'treating' | 'done'

export type Outcome = '교실 복귀' | '귀가' | '병원 이송' | '관찰'

export interface Disease {
  name: string
  category: DiseaseCategory
  isPrimary: boolean
}

/** 서버 방문 = 비식별. 학생(이름·반·번호)은 포함하지 않음.
 *  visit_id ↔ 학생 매핑은 로컬에만 존재(useVisits.studentOf). */
export interface Visit {
  id: string
  grade: number
  sex: Sex
  symptomTileIds: string[]
  status: VisitStatus
  ticket: number
  diseases: Disease[]
  treatments: string[]
  outcome?: Outcome
  escort?: string[]
  transport?: '자가' | '119'
  guardianHandoff?: boolean
  createdAt: number
  calledAt?: number
  treatedAt?: number
  observeUntil?: number // 관찰 결과 시, 보건실 관찰 종료 예정 시각(epoch ms)
  isStaff?: boolean // 교직원 방문(별도 집계 — 학생 통계·담임/학부모 알림 제외). grade=0으로 기록.
}
