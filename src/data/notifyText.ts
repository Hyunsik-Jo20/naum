// 학부모·담임 알림 문구 생성 — 처치 내용/기타를 반영한 친절·상세 구조화 메시지.
//  payload(ClassPayload)에서 증상·병명·처치·결과를 받아 자연스러운 안내문을 만든다.
import type { ClassPayload } from './station'

const OUTCOME_GUIDE: Record<string, string> = {
  '교실 복귀': '처치 후 안정되어 교실로 복귀했습니다. 가정에서도 상태를 살펴봐 주세요.',
  '귀가': '안정이 필요해 귀가 조치되었습니다. 가정에서 충분히 쉬게 해주시고, 증상이 지속되면 진료를 받아보세요.',
  '병원 이송': '추가 진료가 필요해 병원으로 이송되었습니다. 자세한 사항은 보건실로 연락 부탁드립니다.',
  '관찰': '보건실에서 경과를 관찰하고 있습니다. 변화가 있으면 다시 안내드리겠습니다.',
}

/** 학부모용 — 여러 줄의 친절한 안내문. */
export function buildParentMessage(p: ClassPayload, childName?: string): string {
  const who = childName ? `${childName} 학생이` : '자녀가'
  if (p.kind === '접수') {
    const sym = p.sym ? ` 증상은 '${p.sym}' 입니다.` : ''
    return `${who} 보건실에 접수되었습니다.${sym} 보건교사가 살펴본 뒤 처치 결과를 다시 안내드리겠습니다.`
  }
  // 종료
  const lines: string[] = [`${who} 보건실 처치를 마쳤습니다.`]
  if (p.sym) lines.push(`· 증상: ${p.sym}`)
  if (p.disease) lines.push(`· 추정 병명: ${p.disease} (보건교사 확인)`)
  const treats = (p.treatments ?? []).filter(Boolean)
  if (treats.length) lines.push(`· 시행한 처치: ${treats.join(', ')}`)
  if (p.outcome) lines.push(`· 결과: ${p.outcome}`)
  const guide = p.outcome ? OUTCOME_GUIDE[p.outcome] : undefined
  if (guide) lines.push('', guide)
  return lines.join('\n')
}

/** 담임용 — 한 줄 요약(처치 포함). */
export function buildTeacherLine(p: ClassPayload): string {
  if (p.kind === '접수') return `접수 · ${p.sym || '증상 확인 중'}`
  const parts = [`처치 종료 · ${p.outcome ?? '교실 복귀'}`]
  if (p.disease) parts.push(p.disease)
  const treats = (p.treatments ?? []).filter(Boolean)
  if (treats.length) parts.push(`처치: ${treats.join(', ')}`)
  return parts.join(' · ')
}
