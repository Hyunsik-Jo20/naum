// 로컬 담임 명부 — 보건교사가 업로드(엑셀/CSV)하면 이 브라우저(localStorage)에만 저장.
//  (학년·반) → 담임 이름·연락처 매핑. 담임 이름 표시 + 향후 문자(SMS) 발송용.
//  연락처는 PII라 로컬에만 두고 서버로 보내지 않는다.
import { decodeBuffer } from './localRoster'

const LS_KEY = 'naum.teacherRoster'

export interface TeacherRow {
  grade: number
  classNo: number
  name: string
  phone?: string
}

function load(): TeacherRow[] {
  try {
    const a = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (Array.isArray(a)) return a as TeacherRow[]
  } catch {
    /* ignore */
  }
  return []
}

// 앱 시작 시 1회 확정(업로드 적용은 새로고침으로 반영 — 학생 명부와 동일)
export const teacherRoster: TeacherRow[] = load()

/** (학년,반) 담임 조회. */
export function teacherOf(grade: number, classNo: number): TeacherRow | undefined {
  return teacherRoster.find((t) => t.grade === grade && t.classNo === classNo)
}

export function saveTeacherRoster(list: TeacherRow[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
export function clearTeacherRoster() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
export function isCustomTeacherRoster(): boolean {
  try {
    return !!localStorage.getItem(LS_KEY)
  } catch {
    return false
  }
}

export interface TeacherParseResult {
  teachers: TeacherRow[]
  error?: string
}

/** 2차원 셀 배열(머리글 포함) → 담임 명부. CSV·엑셀 공용. */
export function parseTeacherRows(rows: string[][]): TeacherParseResult {
  const cleaned = rows.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c))
  if (cleaned.length < 2) return { teachers: [], error: '데이터가 없습니다. (머리글 + 1행 이상 필요)' }
  const header = cleaned[0]
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)))
  const col = {
    grade: find('학년', 'grade'),
    cls: find('반', '학급', 'class'),
    name: find('담임', '성명', '이름', 'name', 'teacher'),
    phone: find('연락처', '전화', '휴대폰', 'phone', 'tel'),
  }
  if (col.grade < 0 || col.cls < 0 || col.name < 0)
    return { teachers: [], error: '필수 열(학년·반·담임명)을 찾지 못했습니다. 머리글을 확인하세요.' }

  const teachers: TeacherRow[] = []
  for (let i = 1; i < cleaned.length; i++) {
    const c = cleaned[i].map((x) => x.replace(/^"|"$/g, ''))
    const grade = Number(c[col.grade])
    const classNo = Number(c[col.cls])
    const name = c[col.name]
    if (!name || Number.isNaN(grade) || Number.isNaN(classNo)) continue
    const phone = col.phone >= 0 ? c[col.phone] : ''
    teachers.push({ grade, classNo, name, phone: phone || undefined })
  }
  if (!teachers.length) return { teachers: [], error: '읽을 수 있는 담임 행이 없습니다.' }
  return { teachers }
}

export function parseTeacherCsv(text: string): TeacherParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (!lines.length) return { teachers: [], error: '빈 파일' }
  const delim = lines[0].includes('\t') ? '\t' : ','
  return parseTeacherRows(lines.map((l) => l.split(delim)))
}

export { decodeBuffer }

export const TEACHER_TEMPLATE =
  '학년,반,담임명,연락처\n' +
  '1,1,김담임,010-1234-5678\n' +
  '1,2,이담임,010-2345-6789\n' +
  '2,3,박담임,010-3456-7890\n'
