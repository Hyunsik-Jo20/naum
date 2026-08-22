// 위생용품·비품 목록 — 처치 "위생용품·비품" 팝업에서 지급하는 물품(의약품 아님).
//  보건교사가 설정창(팝업 내 목록 편집)에서 편집. 이 기기(보건실 콘솔) localStorage에 저장.
const LS = 'naum.supplies'

// 기본 위생용품·비품(보건교사가 자유롭게 추가·삭제 가능).
export const DEFAULT_SUPPLIES: string[] = [
  '생리대',
  '마스크',
  '얼음팩',
  '손소독제',
  '여벌 옷',
]

export function loadSupplies(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(LS) || 'null')
    if (Array.isArray(a)) {
      const list = a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
      if (list.length) return list
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_SUPPLIES]
}

export function saveSupplies(list: string[]): void {
  try {
    const seen = new Set<string>()
    const clean = list.map((x) => x.trim()).filter((x) => x && !seen.has(x) && seen.add(x))
    localStorage.setItem(LS, JSON.stringify(clean))
  } catch {
    /* ignore */
  }
}
