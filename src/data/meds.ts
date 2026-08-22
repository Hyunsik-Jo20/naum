// 보건실 비치 의약품 목록 — 처치 "투약" 팝업에서 고르는 약. 보건교사가 설정창에서 편집.
//  이 기기(보건실 콘솔) localStorage에 저장. 기본값은 학교 보건실 흔한 비치약 9종.
const LS = 'naum.meds'

// 기본 보건실 비치 의약품 9종(보건교사가 자유롭게 추가·삭제·순서변경 가능).
export const DEFAULT_MEDS: string[] = [
  '타이레놀',            // 해열·진통(아세트아미노펜)
  '부루펜',              // 해열·진통·소염(이부프로펜)
  '소화제',              // 소화불량
  '지사제',              // 설사
  '제산제',              // 속쓰림·위장
  '화상연고',            // 경미한 화상
  '상처연고(후시딘)',    // 찰과상·상처
  '인공눈물',            // 눈 불편·이물감
  '멀미약',              // 멀미·어지러움
]

export function loadMeds(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(LS) || 'null')
    if (Array.isArray(a)) {
      const list = a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
      if (list.length) return list
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_MEDS]
}

export function saveMeds(list: string[]): void {
  try {
    // 공백 제거 + 중복 제거(순서 유지)
    const seen = new Set<string>()
    const clean = list.map((x) => x.trim()).filter((x) => x && !seen.has(x) && seen.add(x))
    localStorage.setItem(LS, JSON.stringify(clean))
  } catch {
    /* ignore */
  }
}
