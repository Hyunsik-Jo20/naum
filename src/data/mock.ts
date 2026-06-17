import type { DiseaseCategory, Disease, Student, SymptomTile } from '../types'
import { roster } from './localRoster'

/* ───────────── 로컬(보건실)에만 있는 학생 명부(PII) ───────────── */

export const students: Student[] = roster

export function classLabel(s: Student): string {
  return `${s.grade}-${s.classNo}`
}

export const classes = Array.from(
  new Set(students.map((s) => `${s.grade}-${s.classNo}`)),
).sort((a, b) => {
  const [ga, ca] = a.split('-').map(Number)
  const [gb, cb] = b.split('-').map(Number)
  return ga - gb || ca - cb
})

export function studentsInClass(cls: string): Student[] {
  return students
    .filter((s) => `${s.grade}-${s.classNo}` === cls)
    .sort((a, b) => a.number - b.number)
}

export function findStudent(id: string): Student | undefined {
  return students.find((s) => s.id === id)
}

/* ───────────── 증상·병명·처치 코드 (서버에도 가는 비식별) ───────────── */

/** 12 통계 계통 (고정) */
export const DISEASE_CATEGORIES: DiseaseCategory[] = [
  '호흡기계',
  '소화기계',
  '순환기계',
  '정신신경계',
  '근골격계',
  '피부피하계',
  '비뇨생식기계',
  '구강치아계',
  '이비인후과계',
  '안과계',
  '감염병',
  '기타',
]

/** 학생 화면 타일 = 흔한 8개 + "잘 모르겠어요" (설계 7.4) */
export const symptomTiles: SymptomTile[] = [
  { id: 'hurt', label: '다쳤어요', icon: 'ti-bandage', category: '피부피하계', disease: '찰과상' },
  { id: 'tummy', label: '배 아파요', icon: 'ti-mood-sick', category: '소화기계', disease: '복통' },
  { id: 'head', label: '머리 아파요', icon: 'ti-mood-sad', category: '정신신경계', disease: '두통' },
  { id: 'fever', label: '열이 나요', icon: 'ti-temperature', category: '호흡기계', disease: '발열' },
  { id: 'dizzy', label: '어지러워요', icon: 'ti-rotate-360', category: '정신신경계', disease: '어지러움' },
  { id: 'nose', label: '코피 나요', icon: 'ti-droplet', category: '이비인후과계', disease: '비출혈' },
  { id: 'limb', label: '팔다리 아파요', icon: 'ti-bone', category: '근골격계', disease: '근육통' },
  { id: 'eye', label: '눈이 아파요', icon: 'ti-eye', category: '안과계', disease: '충혈' },
  { id: 'unknown', label: '잘 모르겠어요', icon: 'ti-help-circle', category: '기타', disease: '' },
]

export function tileById(id: string): SymptomTile | undefined {
  return symptomTiles.find((t) => t.id === id)
}

/** 선택한 증상 타일 → 추천 병명(계통 포함). "잘 모르겠어요"는 제외. */
export function suggestDiseases(tileIds: string[]): Disease[] {
  const out: Disease[] = []
  tileIds.forEach((id) => {
    const t = tileById(id)
    if (!t || !t.disease) return
    if (out.some((d) => d.name === t.disease)) return
    out.push({ name: t.disease, category: t.category, isPrimary: out.length === 0 })
  })
  return out
}

/** 자주 쓰는 처치 템플릿 (설계 7.5) */
export const treatmentTemplates: string[] = [
  '안정·휴식',
  '투약',
  '체온 측정',
  '냉·온 찜질',
  '지혈',
  '밴드·소독',
  '안약 점안',
  '경과 관찰',
  '보호자 연락',
  '기타',
]

export const ESCORTS = ['보건교사', '담임', '교감', '교장', '보호자', '119']

/* ───────────── 학생 부가정보 (로컬 PII) ───────────── */

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** 학부모 연락처 — 업로드 명부에 있으면 그 값, 없으면 결정적 합성(데모). */
export function guardianPhone(s: Student): string {
  if (s.guardianPhone) return s.guardianPhone
  const h = hashId(s.id)
  const mid = String(1000 + (h % 9000))
  const last = String(1000 + ((h >> 5) % 9000))
  return `010-${mid}-${last}`
}

const RECENT_DISEASES = ['두통', '복통', '찰과상', '발열', '근육통', '비출혈', '충혈', '타박상', '소화불량']
const RECENT_OUTCOMES = ['교실 복귀', '교실 복귀', '교실 복귀', '귀가', '관찰']

/** 학생의 최근 보건실 방문 요약 — 결정적 합성(데모). 일부 학생은 기록 없음(null). */
export function recentVisitHint(s: Student, now: Date = new Date()): string | null {
  const h = hashId(s.id + '·r')
  if (h % 10 < 2) return null // 약 20% 이전 방문 없음
  const daysAgo = 2 + (h % 38)
  const d = new Date(now)
  d.setDate(d.getDate() - daysAgo)
  const dis = RECENT_DISEASES[h % RECENT_DISEASES.length]
  const out = RECENT_OUTCOMES[(h >> 3) % RECENT_OUTCOMES.length]
  return `${d.getMonth() + 1}/${d.getDate()} ${dis} · ${out}`
}
