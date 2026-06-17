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
}
