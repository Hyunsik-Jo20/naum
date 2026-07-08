// 알림 대상 설정 — 학생 접수/종료 시 담임/학부모 중 누구에게 알림을 보낼지 보건교사가 선택.
//  이 기기(보건실 콘솔)에 저장. 기본값은 둘 다 발송.
const LS = 'naum.notifyTargets'

export interface NotifyTargets {
  teacher: boolean
  parent: boolean
}

export function loadNotifyTargets(): NotifyTargets {
  try {
    const o = JSON.parse(localStorage.getItem(LS) || 'null')
    if (o && typeof o === 'object') return { teacher: o.teacher !== false, parent: o.parent !== false }
  } catch {
    /* ignore */
  }
  return { teacher: true, parent: true }
}

export function saveNotifyTargets(t: NotifyTargets) {
  try {
    localStorage.setItem(LS, JSON.stringify(t))
  } catch {
    /* ignore */
  }
}
