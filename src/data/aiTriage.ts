// AI 임상 보조 — 학생이 키오스크에서 고른 "증상"만 보고 병명·계통·감염병 의심·기본 처치를 추천.
//  · data/ai.ts 의 다중 제공자 callAi 재사용.
//  · 개인정보 원칙: 이름·반·번호는 절대 보내지 않는다(증상 + 학년/성별만).
//  · 진단 확정이 아니라 "추천(확인 필요)" — 보건교사가 최종 판단.
import { callAi, loadAiConfig, isConfigured, DEFAULT_TRIAGE_PROMPT } from './ai'
import type { DiseaseCategory } from '../types'

export interface AiDiseaseSuggestion {
  name: string
  category: DiseaseCategory
  infectious: boolean
}
export interface AiTriageResult {
  diseases: AiDiseaseSuggestion[]
  infectionAlert: string | null // 감염병 의심 경고(없으면 null)
  treatments: string[] // 보건실 기본 처치 3가지
}

const CATEGORIES: DiseaseCategory[] = [
  '호흡기계', '소화기계', '순환기계', '정신신경계', '근골격계', '피부피하계',
  '비뇨생식기계', '구강치아계', '이비인후과계', '안과계', '감염병', '기타',
]

/** 모델이 코드펜스/잡설을 섞어도 JSON 본문만 추출. */
function extractJson(raw: string): unknown {
  let s = raw.trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a >= 0 && b > a) s = s.slice(a, b + 1)
  return JSON.parse(s)
}

function coerceCategory(c: unknown): DiseaseCategory {
  const v = String(c ?? '').trim() as DiseaseCategory
  return CATEGORIES.includes(v) ? v : '기타'
}

export function aiConfigured(): boolean {
  return isConfigured(loadAiConfig())
}

/** 증상 라벨 배열(+ 기타/특이사항) → 추천 결과. AI 미설정 시 예외.
 *  system 프롬프트는 설정창에서 수정 가능(cfg.triagePrompt). JSON 출력 형식은 코드에서 강제(파싱 안정). */
export async function aiTriage(
  symptoms: string[],
  grade: number,
  sex: string,
  notes?: string,
): Promise<AiTriageResult> {
  const cfg = loadAiConfig()
  if (!isConfigured(cfg)) throw new Error('AI 설정(제공자·API 키·모델)이 필요합니다. "AI 설정"에서 키를 입력하세요.')

  const guidance = (cfg.triagePrompt || DEFAULT_TRIAGE_PROMPT).trim()
  const system = `${guidance}\n반드시 아래 사용자 메시지의 JSON 스키마만 출력하세요(설명·코드펜스 금지).`
  const extra = notes && notes.trim() ? `기타/특이사항(보건교사 입력): ${notes.trim()}\n` : ''
  const user =
    `증상: ${symptoms.join(', ') || '(보고된 증상 없음)'}\n학년: ${grade} / 성별: ${sex}\n${extra}\n` +
    `출력 JSON 스키마:\n` +
    `{"diseases":[{"name":"병명","category":"계통","infectious":true|false}],` +
    `"infectionAlert":"감염병 의심 시 한 줄 경고(증상 근거 포함), 아니면 null",` +
    `"treatments":["기본처치1","기본처치2","기본처치3"]}\n` +
    `규칙:\n- diseases 1~3개. category는 반드시 다음 중 하나: ${CATEGORIES.join(' / ')}\n` +
    `- 발열+기침/인후통, 구토+설사, 발진+발열, 눈 충혈 등 전염 가능 패턴이면 infectious=true 로 표시하고 infectionAlert 를 작성.\n` +
    `- treatments 는 보건실에서 즉시 가능한 기본 처치 3가지(예: 안정·휴식, 수분 섭취, 체온 측정, 냉찜질 등).`

  const raw = await callAi(cfg, system, user)
  let parsed: {
    diseases?: { name?: string; category?: string; infectious?: boolean }[]
    infectionAlert?: string | null
    treatments?: string[]
  }
  try {
    parsed = extractJson(raw) as typeof parsed
  } catch {
    throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.')
  }

  const diseases: AiDiseaseSuggestion[] = (parsed.diseases ?? [])
    .filter((d) => d && String(d.name ?? '').trim())
    .slice(0, 3)
    .map((d) => ({ name: String(d.name).trim(), category: coerceCategory(d.category), infectious: Boolean(d.infectious) }))

  const alertRaw = parsed.infectionAlert
  const infectionAlert =
    alertRaw && String(alertRaw).trim() && String(alertRaw).trim().toLowerCase() !== 'null'
      ? String(alertRaw).trim()
      : diseases.some((d) => d.infectious)
        ? '감염병 의심 징후가 있습니다. 격리·등교중지·역학 확인을 검토하세요.'
        : null

  const treatments = (parsed.treatments ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 3)

  return { diseases, infectionAlert, treatments }
}
