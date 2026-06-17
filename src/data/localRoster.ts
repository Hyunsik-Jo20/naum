// 로컬 학생 명부 — 보건교사가 업로드(CSV)하면 이 브라우저(localStorage)에만 저장.
// 학생 PII는 로컬을 벗어나지 않는다. 미업로드 시 기본(데모) 명부 사용.
import type { Sex, Student } from '../types'
import { roster as DEFAULT_ROSTER } from './roster'

const LS_KEY = 'naum.roster'

function load(): Student[] {
  try {
    const a = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (Array.isArray(a) && a.length) return a as Student[]
  } catch {
    /* ignore */
  }
  return DEFAULT_ROSTER
}

export function saveRoster(list: Student[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function clearRoster() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

export function isCustomRoster(): boolean {
  try {
    return !!localStorage.getItem(LS_KEY)
  } catch {
    return false
  }
}

// 앱 시작 시 1회 확정되는 유효 명부 (업로드 적용은 새로고침으로 반영 — 로컬 스테이션이므로 적절)
export const roster: Student[] = load()

// ── CSV/TSV 파싱 ──
/** UTF-8 우선, 깨지면 EUC-KR(윈도우 엑셀 기본)로 디코드. */
export function decodeBuffer(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8
  try {
    return new TextDecoder('euc-kr').decode(buf)
  } catch {
    return utf8
  }
}

export interface ParseResult {
  students: Student[]
  error?: string
}

/** 2차원 셀 배열(머리글 포함) → 학생 명부. CSV·엑셀 공용. */
export function parseRosterRows(rows: string[][]): ParseResult {
  const cleaned = rows.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c))
  if (cleaned.length < 2) return { students: [], error: '데이터가 없습니다. (머리글 + 1행 이상 필요)' }
  const header = cleaned[0]
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)))
  const col = {
    grade: find('학년', 'grade'),
    cls: find('반', '학급', 'class'),
    no: find('번호', 'number'),
    name: find('이름', '성명', 'name'),
    sex: find('성별', 'sex'),
    phone: find('보호자', '연락처', '전화', 'phone'),
  }
  if (col.grade < 0 || col.cls < 0 || col.name < 0)
    return { students: [], error: '필수 열(학년·반·이름)을 찾지 못했습니다. 머리글을 확인하세요.' }

  const students: Student[] = []
  let seq = 0
  for (let i = 1; i < cleaned.length; i++) {
    const c = cleaned[i].map((x) => x.replace(/^"|"$/g, ''))
    const grade = Number(c[col.grade])
    const classNo = Number(c[col.cls])
    const name = c[col.name]
    if (!name || Number.isNaN(grade) || Number.isNaN(classNo)) continue
    seq += 1
    const number = col.no >= 0 && c[col.no] ? Number(c[col.no]) || seq : seq
    const sexRaw = col.sex >= 0 ? c[col.sex] ?? '' : ''
    const sex: Sex = /여|f/i.test(sexRaw) ? '여' : '남'
    const phone = col.phone >= 0 ? c[col.phone] : ''
    students.push({
      id: `u_${grade}_${classNo}_${number}_${i}`,
      name,
      grade,
      classNo,
      number,
      sex,
      guardianPhone: phone || undefined,
    })
  }
  if (!students.length) return { students: [], error: '읽을 수 있는 학생 행이 없습니다.' }
  return { students }
}

export function parseRosterCsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (!lines.length) return { students: [], error: '빈 파일' }
  const delim = lines[0].includes('\t') ? '\t' : ','
  return parseRosterRows(lines.map((l) => l.split(delim)))
}

export const ROSTER_TEMPLATE =
  '학년,반,번호,이름,성별,보호자연락처\n' +
  '1,1,1,홍길동,남,010-1234-5678\n' +
  '1,1,2,김영희,여,010-2345-6789\n' +
  '2,3,5,이철수,남,010-3456-7890\n'
