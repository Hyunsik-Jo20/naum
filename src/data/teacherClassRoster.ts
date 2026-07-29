// 교사 로컬 반 명부 — 교사가 자기 반 엑셀(번호·이름)을 업로드하면 이 기기(localStorage)에만 저장.
//  · 보건교사 명부(naum.roster)와 완전 별개. 교사 화면에서 번호↔이름 매칭 표시용(교사 기기 로컬 PII).
//  · 미업로드면 교사 화면은 번호만 표시.
export interface TClassStudent { number: number; name: string; sex?: '남' | '여' }

const LS = 'naum.teacherclassroster'
type Store = Record<string, TClassStudent[]> // key "grade-classNo"

const key = (g: number, c: number) => `${g}-${c}`

function load(): Store {
  try {
    const o = JSON.parse(localStorage.getItem(LS) || '{}')
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}
function save(s: Store) {
  try { localStorage.setItem(LS, JSON.stringify(s)) } catch { /* ignore */ }
}

/** 반 명부 조회(번호 오름차순). */
export function classRoster(grade: number, classNo: number): TClassStudent[] {
  return (load()[key(grade, classNo)] ?? []).slice().sort((a, b) => a.number - b.number)
}
export function hasRoster(grade: number, classNo: number): boolean {
  return (load()[key(grade, classNo)] ?? []).length > 0
}
/** 번호 → 이름(없으면 undefined). */
export function nameOf(grade: number, classNo: number, number: number): string | undefined {
  return (load()[key(grade, classNo)] ?? []).find((s) => s.number === number)?.name
}
/** 반 명부 통째 저장(엑셀 업로드). */
export function setClassRoster(grade: number, classNo: number, students: TClassStudent[]) {
  const s = load()
  s[key(grade, classNo)] = students
  save(s)
}
/** 한 명 추가·갱신(전학생 등). */
export function upsertOne(grade: number, classNo: number, student: TClassStudent) {
  const s = load()
  const list = s[key(grade, classNo)] ?? []
  const i = list.findIndex((x) => x.number === student.number)
  if (i >= 0) list[i] = student
  else list.push(student)
  s[key(grade, classNo)] = list
  save(s)
}
