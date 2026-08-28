// 개인정보 입력 가드 — 처치·기타 등 "클라우드로 올라가는 자유 입력"에 개인정보가 섞이는 것을 차단.
//  배경: 처치/기타 텍스트는 비식별 방문 데이터로 서버에 저장된다. 이메일·전화번호·주민번호가
//  들어가면 비식별 원칙이 깨진다(실사용에서 이메일 혼입 사례 발생 → 차단 가드 도입).
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/ // 휴대폰·유선(010-1234-5678, 051-320-3900 등)
const RRN = /\d{6}[-\s]?[1-4]\d{6}/ // 주민등록번호 형태

/** 개인정보로 보이는 패턴의 종류를 반환(없으면 null). */
export function piiLabel(text: string): string | null {
  const t = text ?? ''
  if (EMAIL.test(t)) return '이메일'
  if (RRN.test(t)) return '주민등록번호'
  if (PHONE.test(t)) return '전화번호'
  return null
}

/** 개인정보 패턴이 있으면 경고하고 true(=차단) 반환. 호출자는 true면 저장을 중단해야 한다. */
export function blockPii(text: string): boolean {
  const kind = piiLabel(text)
  if (!kind) return false
  alert(
    `⚠ ${kind}(으)로 보이는 내용이 있어 저장할 수 없습니다.\n\n` +
      '처치·기타 입력은 비식별 데이터로 클라우드에 저장되므로\n' +
      '이름·연락처·이메일 등 개인정보를 넣으면 안 됩니다.\n' +
      '해당 부분을 지우고 다시 입력해 주세요.',
  )
  return true
}
