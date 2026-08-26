// Supabase Realtime 공용 유틸 — relay(supabaseRelay)와 visits/edu 구독이 함께 쓴다.

// 채널 토픽은 구독마다 고유해야 한다. 고정 이름을 재사용하면(StrictMode 재마운트·이전
// removeChannel 완료 전 재구독) Supabase가 이미 subscribe된 동일 토픽 채널을 돌려주고,
// 거기에 .on()을 다시 붙여 "cannot add postgres_changes callbacks after subscribe()" 에러가 난다.
let chanSeq = 0
export const uniqTopic = (base: string) => `${base}#${chanSeq++}`

/** 소켓이 조용히 멈춘 경우(절전·네트워크 전환)까지 대비해, 온라인 복귀·탭 활성화 시 재조회 트리거. */
export function onWake(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const wake = () => {
    const online = typeof navigator === 'undefined' || navigator.onLine
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
    if (online && visible) cb()
  }
  window.addEventListener('online', wake)
  document.addEventListener('visibilitychange', wake)
  return () => {
    window.removeEventListener('online', wake)
    document.removeEventListener('visibilitychange', wake)
  }
}
