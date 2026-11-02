// 업데이트 안내(What's New) — 새 버전 배포 시 다음 로그인/시작 때 1회 안내.
//  버전 문자열을 올리면 전 사용자에게 다시 1회 표시된다(로컬에 '본 버전' 저장).
export const UPDATE_VERSION = '2026-11-02'
export const UPDATE_TITLE = '업데이트 안내'

export interface UpdateItem { icon: string; title: string; text: string }

export const UPDATE_ITEMS: UpdateItem[] = [
  {
    icon: 'ti-history',
    title: '방문 기록 전체 보기',
    text: '처치 화면에서 학생 이름을 누르면 그 학생의 전체 방문 기록(증상·병명·처치·결과)을 한눈에 볼 수 있어요.',
  },
  {
    icon: 'ti-virus',
    title: '감염병 현황 관리',
    text: '보건 일일업무 기록 창에 “감염병 현황”이 생겼어요. 발생 추이 차트(일·주·월 · 진행/신규발생 · 병명별 색상·누적), 등교중지 복귀일 자동 계산, 진행 사례 목록을 한 곳에서 관리해요.',
  },
  {
    icon: 'ti-file-spreadsheet',
    title: '감염병 관리대장 엑셀(대시보드)',
    text: '관리대장을 대시보드형 엑셀로 내보내요 — 전체 현황 요약 + 종류·학년·남녀·학급·추이 등 다각도 차트 + 원본데이터 시트.',
  },
]

const LS = 'naum.seenUpdate'

/** 아직 이 버전 안내를 안 본 사용자면 true. */
export function shouldShowUpdate(): boolean {
  try {
    return localStorage.getItem(LS) !== UPDATE_VERSION
  } catch {
    return false
  }
}

/** 안내를 봤다고 저장(다음부터 안 뜸). */
export function markUpdateSeen(): void {
  try {
    localStorage.setItem(LS, UPDATE_VERSION)
  } catch {
    /* ignore */
  }
}
