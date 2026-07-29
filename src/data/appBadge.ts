// 앱 아이콘 배지(설치형 PWA) — 실행 아이콘 우측 상단에 미확인 알림 개수를 숫자로.
//  · Web App Badging API. 설치된 PWA(홈 화면/작업표시줄 아이콘)에서 동작.
//    설치 안 됐거나 미지원 브라우저면 조용히 무시(no-op).
//  · 앱이 실행 중(포그라운드/백그라운드 탭)일 때 갱신됨. 완전히 종료된 상태에서의
//    갱신은 Web Push + 서비스워커가 필요(후속 — 현재는 솔라피 SMS/알림톡이 그 역할).
type BadgeNav = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export function setBadge(count: number): void {
  try {
    const n = navigator as BadgeNav
    if (count > 0) n.setAppBadge?.(count)?.catch(() => {})
    else n.clearAppBadge?.()?.catch(() => {})
  } catch {
    /* 미지원 → 무시 */
  }
}

export function clearBadge(): void {
  try {
    ;(navigator as BadgeNav).clearAppBadge?.()?.catch(() => {})
  } catch {
    /* 미지원 → 무시 */
  }
}
