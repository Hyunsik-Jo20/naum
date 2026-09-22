// 자주 쓰는 처치 — 전체 순서를 로컬에 저장(드래그 정렬 + 사용자 추가).
import { treatmentTemplates } from './mock'

const LS_KEY = 'naum.treatorder'

/** 저장된 처치 순서(없으면 기본 템플릿). 코드 기본 항목 누락분은 '기타' 앞에 보강. */
export function loadTreatments(): string[] {
  let order: string[] = []
  try {
    const a = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (Array.isArray(a)) order = a.filter((x) => typeof x === 'string')
    // 체온만 재던 시절의 칩 이름을 새 이름으로 읽는다 (요청 9/22 — 활력징후로 확장)
    order = order.map((t) => (t === '체온 측정' ? '활력징후' : t))
  } catch {
    /* ignore */
  }
  if (!order.length) return [...treatmentTemplates]
  treatmentTemplates.forEach((t) => {
    if (order.includes(t)) return
    const etcIdx = order.indexOf('기타')
    if (t === '기타' || etcIdx < 0) order.push(t)
    else order.splice(etcIdx, 0, t)
  })
  return order
}

export function saveTreatments(list: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
