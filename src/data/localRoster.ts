// 로컬 학생 명부 — 보건교사가 업로드(CSV)하면 이 브라우저(localStorage)에만 저장.
// 학생 PII는 로컬을 벗어나지 않는다.
//  · 데모 학교('demo'): 미업로드 시 내장 데모 명부(연수·시연용).
//  · 실학교(멀티테넌트): 미업로드 시 빈 명부 — 데모 학생이 실학교 화면에 나오면 안 됨.
import type { Sex, Student } from '../types'
import { roster as DEFAULT_ROSTER } from './roster'
import { schoolId } from './school'
import { getSecureRaw, setSecureRaw, removeSecure, hasStored } from './secureStore'

// 저장은 secureStore(학교 키 AES-GCM 암호화) 경유 — localStorage에는 암호문만 남는다.
const LS_KEY = 'naum.roster'

function load(): Student[] {
  try {
    const a = JSON.parse(getSecureRaw(LS_KEY) || 'null')
    if (Array.isArray(a) && a.length) return a as Student[]
  } catch {
    /* ignore */
  }
  return schoolId() === 'demo' ? DEFAULT_ROSTER : []
}

export function saveRoster(list: Student[]) {
  setSecureRaw(LS_KEY, JSON.stringify(list))
}

export function clearRoster() {
  removeSecure(LS_KEY)
}

export function isCustomRoster(): boolean {
  return hasStored(LS_KEY)
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

/** 성별 텍스트 해석 — 남/여, 남자/여자, M/F, male/female, boy/girl. 못 읽으면 null. */
function parseSexText(raw: string): Sex | null {
  const v = (raw ?? '').toString().trim().toLowerCase()
  if (!v) return null
  if (v.includes('여') || v.startsWith('f') || v.startsWith('w') || v.includes('girl')) return '여'
  if (v.includes('남') || v.startsWith('m') || v.includes('boy')) return '남'
  return null
}
/** 성별 값 해석(지정된 성별 열 전용) — 텍스트 + NEIS식 숫자 코드(1=남, 2=여). */
function parseSexValue(raw: string): Sex | null {
  const t = parseSexText(raw)
  if (t) return t
  const v = (raw ?? '').toString().trim()
  if (v === '1') return '남'
  if (v === '2') return '여'
  return null
}

/** 2차원 셀 배열(머리글 포함) → 학생 명부. CSV·엑셀 공용. */
export function parseRosterRows(rows: string[][]): ParseResult {
  const cleaned = rows.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c))
  if (cleaned.length < 2) return { students: [], error: '데이터가 없습니다. (머리글 + 1행 이상 필요)' }
  const header = cleaned[0]
  // 머리글 정규화 — "성 별", "성별(남/여)", "남/여" 같은 변형도 인식
  const norm = (s: string) => s.replace(/[\s()[\]/·.\-_]+/g, '').toLowerCase()
  const find = (...keys: string[]) =>
    header.findIndex((h) => {
      const n = norm(h)
      return keys.some((k) => n.includes(k))
    })
  const col = {
    grade: find('학년', 'grade'),
    cls: find('반', '학급', 'class'),
    no: find('번호', 'number'),
    name: find('이름', '성명', 'name'),
    sex: find('성별', 'sex', '남녀', '남여'),
    phone: find('보호자', '연락처', '전화', 'phone'),
  }
  if (col.grade < 0 || col.cls < 0 || col.name < 0)
    return { students: [], error: '필수 열(학년·반·이름)을 찾지 못했습니다. 머리글을 확인하세요.' }

  // 성별 열을 머리글로 못 찾으면 값으로 탐지 — 비어있지 않은 값의 90% 이상이
  //  남/여류 텍스트인 열(숫자 1/2는 학년·반 오탐 위험이 있어 탐지에선 제외).
  if (col.sex < 0) {
    const used = new Set([col.grade, col.cls, col.no, col.name, col.phone])
    const body = cleaned.slice(1)
    const width = Math.max(header.length, ...body.map((r) => r.length))
    for (let j = 0; j < width; j++) {
      if (used.has(j)) continue
      let hit = 0
      let tot = 0
      for (const r of body) {
        const v = (r[j] ?? '').trim()
        if (!v) continue
        tot++
        if (parseSexText(v)) hit++
      }
      if (tot > 0 && hit / tot >= 0.9) {
        col.sex = j
        break
      }
    }
  }

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
    const sex: Sex = parseSexValue(sexRaw) ?? '남'
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
