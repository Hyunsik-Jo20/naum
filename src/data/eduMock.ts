// 교육청 대시보드 데이터 — 실제 부산 학교 명단(busanSchools) + 데모 보건 지표(합성).
// cat[] 순서는 DISEASE_CATEGORIES와 동일.
import { BUSAN_OFFICES, BUSAN_REGIONS, busanSchools, type SchoolLevel } from './busanSchools'

export type { SchoolLevel }

export interface EduSchool {
  id: string
  name: string
  region: string
  office: string
  level: SchoolLevel
  lat: number
  lon: number
  tel: string // 학교 전화번호 (실제 데이터)
  cat: number[] // 주간 계통별 방문 수 (len 12) — 현재값(급증 포함). 데모 합성
  base: number[] // 평소(baseline) 계통별 주간 기대치 (len 12) — cat/base로 증가배수 산출
  enroll: number // 재학생 수 — 율(per-1000) 정규화용. 데모 합성
  anomaly?: string
}

export const EDU_REGIONS = BUSAN_REGIONS
export const EDU_OFFICES = BUSAN_OFFICES
export const EDU_LEVELS: SchoolLevel[] = ['초', '중', '고', '특', '기타']
export const EDU_PERIODS = ['오늘', '이번 주', '이번 달'] as const
export type EduPeriod = (typeof EDU_PERIODS)[number]

export const PERIOD_MULT: Record<EduPeriod, number> = {
  오늘: 0.2,
  '이번 주': 1,
  '이번 달': 4,
}

// 학교 index → 평소(baseline) 계통별 주간 기대치 (결정적 합성, 데모용)
// 실제 운영 시: 이동 4주 평균 / 전년 동기로 대체.
function synthBase(i: number): number[] {
  const cat = new Array(12).fill(0)
  cat[0] = 8 + ((i * 3) % 14) // 호흡기계
  cat[1] = 5 + ((i * 2) % 10) // 소화기계
  cat[5] = 4 + (i % 8) // 피부피하계
  cat[4] = 3 + ((i * 5) % 6) // 근골격계
  cat[3] = 2 + (i % 5) // 정신신경계
  cat[9] = 1 + ((i * 7) % 4) // 안과계
  cat[8] = 1 + (i % 3) // 이비인후과계
  cat[11] = 2 + (i % 3) // 기타
  cat[10] = i % 5 === 0 ? 2 : 1 // 감염병 풍토(endemic) 평소 수준 1~2
  return cat
}

// 학교급별 대략 재학생 규모 + 결정적 변동 (데모용)
const ENROLL_BAND: Record<SchoolLevel, number> = { 초: 540, 중: 760, 고: 940, 특: 180, 기타: 320 }
function synthEnroll(level: SchoolLevel, i: number): number {
  return ENROLL_BAND[level] + ((i * 37) % 360) - 120
}

const ANOMALY_TEXTS = [
  '호흡기계 전주 대비 급증',
  '감염병 의심 신고 증가',
  '소화기계 급증',
]

export const eduSchools: EduSchool[] = busanSchools.map((s, i) => {
  const base = synthBase(i)
  const cat = base.slice() // 현재값 = 평소 + 급증(spike)
  let anomaly: string | undefined
  if (i % 137 === 13) {
    anomaly = ANOMALY_TEXTS[i % ANOMALY_TEXTS.length]
    if (anomaly.includes('감염병')) cat[10] += 16
    else if (anomaly.includes('소화기')) cat[1] += 22
    else cat[0] += 28
  }
  // 지역 클러스터(데모: 사하구 핫스팟) — 평소 대비 감염병 급증
  if (s.region === '사하구') cat[10] += 3 + (i % 3)
  const enroll = Math.max(80, synthEnroll(s.level, i))
  return { id: s.id, name: s.name, region: s.region, office: s.office, level: s.level, lat: s.lat, lon: s.lon, tel: s.tel, cat, base, enroll, anomaly }
})

export function schoolTotal(s: EduSchool): number {
  return s.cat.reduce((a, b) => a + b, 0)
}

function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** 사용자가 새로 추가/증설한 학교 생성 — cat/base/enroll 자동 채움(평소 수준, 급증 없음). */
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
}

export function makeEduSchool(input: NewSchoolInput): EduSchool {
  const seed = hashStr(input.id)
  const base = synthBase(seed)
  return {
    id: input.id,
    name: input.name,
    region: input.region,
    office: input.office,
    level: input.level,
    lat: input.lat,
    lon: input.lon,
    tel: input.tel ?? '',
    enroll: input.enroll && input.enroll > 0 ? input.enroll : Math.max(80, synthEnroll(input.level, seed)),
    cat: base.slice(),
    base,
  }
}
