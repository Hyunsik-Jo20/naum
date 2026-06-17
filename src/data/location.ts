// 학교 위치(동네 기상 기준 좌표). 좌표는 업로드된 학교 명부(busanSchools)에서 자동 조회.
// 학교는 좌표를 따로 입력하지 않고 "학교명"만 지정하면 됨.
import { busanSchools } from './busanSchools'

// 운영(보건교사) 학교명 — 연수용 데모 학교. 실제 운영 시 설정값으로 교체.
export const OPERATING_SCHOOL_NAME = '테스트초등학교'

// 교육청 대시보드 상단 날씨 기준 학교(교육청과 가장 가까운 학교)
export const EDU_WEATHER_SCHOOL_NAME = '부산정보고등학교'

function coordOf(name: string) {
  return busanSchools.find((s) => s.name === name)
}

// 테스트초등학교는 명부에 좌표가 없으므로, 날씨용 좌표는 부산 기준 학교 좌표를 사용.
const weatherBase = coordOf('부산정보고등학교')

export const SCHOOL = {
  name: OPERATING_SCHOOL_NAME,
  sido: '부산',
  lat: weatherBase?.lat ?? 35.1796,
  lon: weatherBase?.lon ?? 129.0756,
}

export function schoolCoord(name: string): { lat: number; lon: number; name: string } {
  const s = coordOf(name)
  return { name, lat: s?.lat ?? SCHOOL.lat, lon: s?.lon ?? SCHOOL.lon }
}
