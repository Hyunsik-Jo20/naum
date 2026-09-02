// 로컬 교직원 명부(담임 포함) — 보건교사가 업로드(엑셀/CSV)하면 이 브라우저(localStorage)에만 저장.
//  · 학년·반이 있는 행 = 담임((학년·반)→이름·연락처 매핑, 알림·표시용)
//  · 학년·반이 빈 행   = 담임 외 교직원(교장·행정 등, 콘솔 수동 접수 대상)
//  연락처는 PII라 로컬에만 두고 서버로 보내지 않는다.
import type { Sex, Staff } from '../types'
import { decodeBuffer } from './localRoster'
import { getSecureRaw, setSecureRaw, removeSecure, hasStored } from './secureStore'

// 저장은 secureStore(학교 키 AES-GCM 암호화) 경유 — 연락처(PII)가 평문으로 남지 않는다.
const LS_KEY = 'naum.teacherRoster'
const LS_STAFF = 'naum.staff'

export interface TeacherRow {
  grade: number
  classNo: number
  name: string
  phone?: string
}

function load(): TeacherRow[] {
  try {
    const a = JSON.parse(getSecureRaw(LS_KEY) || 'null')
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
  setSecureRaw(LS_KEY, JSON.stringify(list))
}
export function clearTeacherRoster() {
  removeSecure(LS_KEY)
}
export function isCustomTeacherRoster(): boolean {
  return hasStored(LS_KEY)
}

// ── 담임 외 교직원(수동 접수 대상) ──
function loadStaff(): Staff[] {
  try {
    const a = JSON.parse(getSecureRaw(LS_STAFF) || 'null')
    if (Array.isArray(a)) return a as Staff[]
  } catch {
    /* ignore */
  }
  return []
}
export const staffRoster: Staff[] = loadStaff()

export function staffById(id: string): Staff | undefined {
  const s = staffRoster.find((x) => x.id === id)
  if (s) return s
  // 담임을 교직원으로 접수한 경우(StaffVisitModal의 tch_학년-반 id) — 담임 명부에서 복원
  const m = /^tch_(\d+)-(\d+)$/.exec(id)
  if (m) {
    const t = teacherRoster.find((x) => x.grade === Number(m[1]) && x.classNo === Number(m[2]))
    if (t) return { id, name: t.name, role: `${t.grade}-${t.classNo} 담임`, phone: t.phone }
  }
  return undefined
}
export function saveStaffRoster(list: Staff[]) {
  setSecureRaw(LS_STAFF, JSON.stringify(list))
}
export function clearStaffRoster() {
  removeSecure(LS_STAFF)
}

export interface TeacherParseResult {
  teachers: TeacherRow[]
  staff: Staff[]
  error?: string
}

/** 2차원 셀 배열(머리글 포함) → 교직원 명부(담임 + 그 외). CSV·엑셀 공용.
 *  학년·반이 채워진 행은 담임, 빈 행은 담임 외 교직원으로 분류한다. */
export function parseTeacherRows(rows: string[][]): TeacherParseResult {
  const cleaned = rows.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c))
  if (cleaned.length < 2) return { teachers: [], staff: [], error: '데이터가 없습니다. (머리글 + 1행 이상 필요)' }
  const header = cleaned[0]
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)))
  const col = {
    grade: find('학년', 'grade'),
    cls: find('반', '학급', 'class'),
    name: find('담임', '성명', '이름', 'name', 'teacher'),
    phone: find('연락처', '전화', '휴대폰', 'phone', 'tel'),
    role: find('구분', '직위', '담당', '역할'),
    sex: find('성별', 'sex'),
  }
  if (col.name < 0)
    return { teachers: [], staff: [], error: '이름 열을 찾지 못했습니다. 머리글을 확인하세요.' }

  const teachers: TeacherRow[] = []
  const staff: Staff[] = []
  for (let i = 1; i < cleaned.length; i++) {
    const c = cleaned[i].map((x) => x.replace(/^"|"$/g, ''))
    const name = c[col.name]
    if (!name) continue
    const phone = (col.phone >= 0 ? c[col.phone] : '') || undefined
    const grade = col.grade >= 0 ? Number(c[col.grade]) : NaN
    const classNo = col.cls >= 0 ? Number(c[col.cls]) : NaN
    if (c[col.grade] && c[col.cls] && !Number.isNaN(grade) && !Number.isNaN(classNo)) {
      teachers.push({ grade, classNo, name, phone })
    } else {
      const sexRaw = col.sex >= 0 ? (c[col.sex] ?? '') : ''
      const sex: Sex | undefined = /여|^f/i.test(sexRaw) ? '여' : /남|^m/i.test(sexRaw) ? '남' : undefined
      staff.push({
        id: `st_${i}_${name}`,
        name,
        role: (col.role >= 0 ? c[col.role] : '') || undefined,
        sex,
        phone,
      })
    }
  }
  if (!teachers.length && !staff.length) return { teachers: [], staff: [], error: '읽을 수 있는 행이 없습니다.' }
  return { teachers, staff }
}

export function parseTeacherCsv(text: string): TeacherParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (!lines.length) return { teachers: [], staff: [], error: '빈 파일' }
  const delim = lines[0].includes('\t') ? '\t' : ','
  return parseTeacherRows(lines.map((l) => l.split(delim)))
}

export { decodeBuffer }

export const TEACHER_TEMPLATE =
  '학년,반,이름,연락처,구분,성별\n' +
  '1,1,김담임,010-1234-5678,담임,여\n' +
  '1,2,이담임,010-2345-6789,담임,남\n' +
  ',,박교장,010-3456-7890,교장,남\n' +
  ',,최보건,,행정실,여\n'
