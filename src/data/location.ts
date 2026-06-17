// 학교 위치(동네 기상 기준 좌표). 좌표는 업로드된 학교 명부(busanSchools)에서 자동 조회.
// 학교는 좌표를 따로 입력하지 않고 "학교명"만 지정하면 됨.
import { busanSchools } from './busanSchools'

// 운영(보건교사) 학교명 — 실제 운영 시 설정값으로 교체
export const OPERATING_SCHOOL_NAME = '부산정보고등학교'

// 교육청 대시보드 상단 날씨 기준 학교(교육청과 가장 가까운 학교)
export const EDU_WEATHER_SCHOOL_NAME = '부산정보고등학교'

function coordOf(name: string) {
  return busanSchools.find((s) => s.name === name)
}

const op = coordOf(OPERATING_SCHOOL_NAME)

export const SCHOOL = {
  name: op?.name ?? '데모학교',
  sido: '부산',
  lat: op?.lat ?? 35.1796,
  lon: op?.lon ?? 129.0756,
}

export function schoolCoord(name: string): { lat: number; lon: number; name: string } {
  const s = coordOf(name)
  return { name, lat: s?.lat ?? SCHOOL.lat, lon: s?.lon ?? SCHOOL.lon }
}
