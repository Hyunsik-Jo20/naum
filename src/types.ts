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
  /** 활력징후 측정값 — 항목 id → 값 배열(단일 [값], 혈압 [수축기, 이완기]) */
  vitals?: Vitals
  isStaff?: boolean // 교직원 방문(별도 집계 — 학생 통계·담임/학부모 알림 제외). grade=0으로 기록.
}

/** 활력징후 측정값. 항목 id는 vitals.ts의 VitalItem.id와 같다.
 *  단일 항목은 [값], 혈압처럼 두 값을 재는 항목은 [수축기, 이완기]로 담는다. */
export type Vitals = Record<string, number[]>

/** 활력징후 항목 정의 — 학교가 편집할 수 있다(항목 추가·삭제·정상범위 조정). */
export interface VitalItem {
  id: string
  label: string          // 체온 · 혈압 · 맥박 …
  unit: string           // ℃ · mmHg · 회/분 · %
  type: 'number' | 'pair' // pair = 혈압처럼 두 칸(수축기/이완기)
  decimals: number       // 소수 자릿수 (체온 1, 나머지 0)
  /** 정상 참고범위 — 벗어나면 화면에 강조된다. 진단 기준이 아니라 확인용 표시. */
  low?: number
  high?: number
  low2?: number          // pair의 둘째 값(이완기) 범위
  high2?: number
  /** 입력 허용 범위(오타 방지) */
  hardMin: number
  hardMax: number
}
