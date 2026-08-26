// 런타임 학교 아이덴티티(멀티테넌트) — 이 기기(브라우저)가 어느 학교 소속인지.
//  · 보건교사 로그인 시 profiles.school_id 로 설정, 교사·학부모 토큰 로그인 시 토큰의 sch 로 설정.
//  · 키오스크(anon)는 같은 브라우저의 이 값을 읽는다(보건교사 로그인 1회로 바인딩).
//  · 테넌트 id = busanSchools id('b###'). 'demo' = 시연용 데모 학교(실집계 제외).
//  기존 빌드타임 VITE_SCHOOL_ID 상수를 대체한다.
import { busanSchools } from './busanSchools'
import { SCHOOL as DEMO_SCHOOL } from './location'

export interface SchoolIdent {
  id: string
  name: string
}

const LS = 'naum.school'
const DEMO: SchoolIdent = { id: 'demo', name: DEMO_SCHOOL.name }

export function getSchool(): SchoolIdent {
  try {
    const o = JSON.parse(localStorage.getItem(LS) || 'null')
    if (o && typeof o.id === 'string' && o.id) return { id: o.id, name: String(o.name || schoolNameById(o.id)) }
  } catch {
    /* ignore */
  }
  return { ...DEMO }
}

export function setSchool(s: SchoolIdent): void {
  try {
    localStorage.setItem(LS, JSON.stringify({ id: s.id, name: s.name }))
  } catch {
    /* ignore */
  }
}

/** 이 기기에 학교가 바인딩됐는지(키오스크 안내용). */
export function hasSchool(): boolean {
  try {
    const o = JSON.parse(localStorage.getItem(LS) || 'null')
    return !!(o && typeof o.id === 'string' && o.id)
  } catch {
    return false
  }
}

/** 현재 학교 id — visits.school_id·키 캐시·relay 스코프에 쓰는 테넌트 식별자. */
export const schoolId = (): string => getSchool().id

/** 학교 id → 이름(busanSchools 명부 조회. 명부는 번들에 있어 토큰에 이름을 실을 필요 없음). */
export function schoolNameById(id: string): string {
  if (id === 'demo') return DEMO.name
  return busanSchools.find((s) => s.id === id)?.name ?? id
}

/** 현재 학교의 이름+좌표(날씨·재난 거리 기준). 명부에 없으면 데모 좌표 폴백. */
export function operatingSchool(): { id: string; name: string; lat: number; lon: number } {
  const s = getSchool()
  const b = busanSchools.find((x) => x.id === s.id)
  return { id: s.id, name: s.name, lat: b?.lat ?? DEMO_SCHOOL.lat, lon: b?.lon ?? DEMO_SCHOOL.lon }
}
