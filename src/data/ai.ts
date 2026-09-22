// 다중 AI 제공자 추상화 — Gemini / OpenAI / Anthropic / 커스텀(OpenAI 호환).
// 키는 브라우저 localStorage에만 저장하고, 호출 시 "비식별 집계"만 프롬프트로 전송한다.
// (개인정보 원칙: 학생 이름·반·번호는 절대 포함하지 않음.)

export type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'custom'

export interface AiProviderInfo {
  id: AiProvider
  name: string
  defaultModel: string
  keyHint: string
  needsBaseUrl?: boolean
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-2.0-flash', keyHint: 'AI Studio API 키' },
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini', keyHint: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-haiku-latest', keyHint: 'sk-ant-...' },
  { id: 'custom', name: '커스텀 (OpenAI 호환)', defaultModel: '', keyHint: 'API 키', needsBaseUrl: true },
]

export interface AiConfig {
  provider: AiProvider
  apiKey: string
  model: string
  baseUrl?: string // custom 전용 (예: https://host/v1)
  morningPrompt: string // 아침 보고 기본 프롬프트(수정 가능)
  eveningPrompt: string // 저녁 보고 기본 프롬프트(수정 가능)
  intervalPrompt: string // 주기(30분·1시간) 보고 기본 프롬프트(수정 가능)
  triagePrompt: string // 보건실 병명·처치 추천 프롬프트(수정 가능)
  infectionPrompt: string // 교육청 감염병 심층 분석 프롬프트(수정 가능)
}

// 보건실 병명·처치 추천 기본 프롬프트(보건교사가 설정창에서 수정 가능).
// ※ 출력 JSON 형식은 코드에서 강제하므로(파싱 안정), 이 프롬프트는 "역할·판단 기준"만 담는다.
export const DEFAULT_TRIAGE_PROMPT =
  '당신은 학교 보건실 보건교사를 돕는 임상 보조입니다. ' +
  '학생이 키오스크에서 고른 증상과 보건교사가 입력한 "기타/특이사항"을 함께 고려하여, ' +
  '가능성 높은 병명과 계통, 감염병 의심 여부, 보건실에서 바로 할 수 있는 기본 처치 3가지를 제안하세요. ' +
  '진단을 확정하지 말고 보수적으로 "추천(확인 필요)" 수준으로 제안하세요. ' +
  '발열+기침/인후통, 구토+설사, 발진+발열, 눈 충혈 등 전염 가능 패턴이면 감염병 의심으로 표시하고 경고를 작성하세요. ' +
  '학생 개인정보(이름·반·번호)는 제공되지 않으며 추정하지 마세요.'

export const DEFAULT_MORNING_PROMPT =
  '당신은 부산시교육청 학교보건 상황실의 분석 담당입니다. 지금은 등교 전 "아침 보고(08:00)"입니다. ' +
  '제공된 비식별 집계와 (있다면) 직전 저녁 보고를 근거로, 장학사가 출근 직후 빠르게 파악할 한국어 브리핑을 작성하세요. ' +
  '구성: ① 오늘 날씨·대기질 요약과 그에 따른 보건 유의사항(미세먼지·폭염·한파 등) ' +
  '② 전날 저녁 보고 이후 새로 발생/지속되는 특이사항(감염병 의심 군집·급증 지역, 평소 대비 배수 근거) ' +
  '③ 장학사가 오늘 챙겨야 할 사항(확인·공지·역학조사 등 권고 조치). ' +
  '데이터에 없는 내용은 추정하지 말고, 특이사항이 없으면 "특이사항 없음"이라고 쓰세요. 학생 개인정보는 데이터에 없으며 언급하지 마세요.'

export const DEFAULT_EVENING_PROMPT =
  '당신은 부산시교육청 학교보건 상황실의 분석 담당입니다. 지금은 일과 종료 "저녁 보고(17:00)"입니다. ' +
  '오늘 17시까지의 비식별 집계를 근거로, 교육청에 제출할 정식 "일일 학교보건 보고서"를 한국어로 작성하세요. ' +
  '구성: ① 종합 요약 ② 오늘의 방문·계통 동향(전월/전년 대비 포함) ③ 감염병 조기탐지 결과(증후군별·지역별 평소 대비 배수, 경보 지역·학교) ' +
  '④ 날씨·대기질 영향 ⑤ 내일 권고 조치. 문서로 출력될 것이므로 소제목과 항목으로 정리하세요. ' +
  '데이터에 없는 내용은 추정하지 말고, 학생 개인정보는 언급하지 마세요.'

// 교육청 감염병 심층 분석 — 요청 2026-09-22.
//  일반 브리핑 프롬프트로는 "발열·호흡기 2.3배"를 되풀이하는 수준을 넘지 못했다.
//  ① 판단 기준(학교 감염병 유행 판단·증후군 감별 단서)을 명시하고
//  ② 출력 형식을 고정해 "판단 → 근거 숫자 → 감별 → 조치 → 확신도"가 반드시 나오게 하며
//  ③ **숫자는 입력에 있는 것만** 쓰게 못 박는다(이 글이 교육청 공문으로 나갈 수 있다).
export const DEFAULT_INFECTION_PROMPT =
  '당신은 시도교육청 학교보건 상황실의 감염병 역학 분석 담당입니다. ' +
  '제공된 비식별 집계(일자별 추이·증후군별 평소 대비 배수·학년 분포·시간대 분포·처치 결과 분포·학교별 상승·지역 동시 상승)만 근거로, ' +
  '지금 무엇이 유행하고 있을 가능성이 있는지 한국어로 분석하세요.\n' +
  '판단에 쓸 단서: ' +
  '(가) 시간 — 하루 튄 것과 3일 이상 연속 상승은 다르다. 휴업일(×) 뒤 급증은 지역사회 유입을 시사한다. ' +
  '(나) 학년 — 저학년 집중은 수족구·수두·유행성이하선염 계열, 전학년 고른 분포는 인플루엔자·코로나 계열을 시사한다. ' +
  '(다) 시간대 — 급식 전후(12~14시) 집중 + 구토·설사 우세는 식중독·노로를 의심할 근거다. ' +
  '(라) 중증도 — 건수가 같아도 귀가·병원 이송 비율이 오르면 상황이 다르다. ' +
  '(마) 공간 — 같은 지역 2개교 이상이 같은 증후군으로 동시에 오르면 학교 내 전파를 넘어선 확산을 의심한다. ' +
  '(바) 단일 학교의 단일 증후군 상승은 학급 단위 사건일 수 있으니 과대 해석하지 마세요.\n' +
  '다음 형식으로만 답하세요:\n' +
  '## 한 줄 판단\n## 의심 상황 (가능성 순, 최대 3개)\n' +
  '각 항목마다 — 의심 질환·증후군 / 그렇게 본 근거(입력의 숫자를 그대로 인용) / 이 판단을 뒤집을 수 있는 반대 근거\n' +
  '## 감별에 필요한 추가 확인\n## 권고 조치 (교육청·학교별로 나눠서)\n## 확신도\n' +
  '확신도는 높음/보통/낮음 중 하나와 그 이유를 한 문장으로. 데이터가 적으면 낮음으로 하세요.\n' +
  '지켜야 할 것: ' +
  '① 입력에 없는 수치를 만들지 마세요. 비율을 새로 계산했다면 "계산값"이라고 밝히세요. ' +
  '② 학교는 입력에 있는 익명 코드(A교·B교…)로만 부르세요. 실제 학교명을 추측하지 마세요. ' +
  '③ 확진 판정을 내리지 말고 "의심·가능성" 수준으로 쓰세요. 확진은 의료기관과 보건소의 몫입니다. ' +
  '④ 데이터가 부족하면 부족하다고 쓰세요. 특이사항이 없으면 "현재 유행을 시사하는 신호 없음"이라고 쓰세요. ' +
  '⑤ 학생 개인정보는 입력에 없으며 추정하지 마세요.'

export const DEFAULT_INTERVAL_PROMPT =
  '당신은 부산시교육청 학교보건 상황실의 분석 담당입니다. 지금은 일과 중 "주기 점검 보고"입니다. ' +
  '현재 시점까지의 비식별 집계를 근거로, 직전 보고 이후 새로 나타나거나 악화된 신호만 골라 한국어로 짧게 보고하세요. ' +
  '구성: ① 한 줄 현황 ② 주의가 필요한 항목(급증 지역·증후군, 평소 대비 배수 근거) ③ 즉시 권고 조치. ' +
  '변동이 없으면 "특이사항 없음"이라고 쓰고, 추정·학생 개인정보 언급은 하지 마세요.'

const LS_KEY = 'naum.ai'

export function loadAiConfig(): AiConfig {
  const base: AiConfig = {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.0-flash',
    morningPrompt: DEFAULT_MORNING_PROMPT,
    eveningPrompt: DEFAULT_EVENING_PROMPT,
    intervalPrompt: DEFAULT_INTERVAL_PROMPT,
    triagePrompt: DEFAULT_TRIAGE_PROMPT,
    infectionPrompt: DEFAULT_INFECTION_PROMPT,
  }
  try {
    const o = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (o && typeof o === 'object' && o.provider) {
      return {
        ...base,
        ...o,
        morningPrompt: o.morningPrompt || base.morningPrompt,
        eveningPrompt: o.eveningPrompt || base.eveningPrompt,
        intervalPrompt: o.intervalPrompt || base.intervalPrompt,
        triagePrompt: o.triagePrompt || base.triagePrompt,
        infectionPrompt: o.infectionPrompt || base.infectionPrompt,
      }
    }
  } catch {
    /* ignore */
  }
  return base
}

export function saveAiConfig(cfg: AiConfig) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

export function isConfigured(cfg: AiConfig): boolean {
  if (!cfg.apiKey || !cfg.model) return false
  if (cfg.provider === 'custom' && !cfg.baseUrl) return false
  return true
}

async function readError(res: Response): Promise<string> {
  let body = ''
  try {
    body = await res.text()
  } catch {
    /* ignore */
  }
  try {
    const j = JSON.parse(body)
    body = j.error?.message || j.error || j.message || body
  } catch {
    /* keep raw */
  }
  return `${res.status} ${res.statusText}${body ? ` — ${String(body).slice(0, 200)}` : ''}`
}

/** 단발 텍스트 생성. system=역할 지시, user=데이터/요청. 반환=생성 텍스트. */
export async function callAi(cfg: AiConfig, system: string, user: string): Promise<string> {
  if (!isConfigured(cfg)) throw new Error('AI 설정(제공자·API 키·모델)이 필요합니다.')

  if (cfg.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      cfg.model,
    )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3 },
      }),
    })
    if (!res.ok) throw new Error(await readError(res))
    const j = await res.json()
    return (j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ?? '').trim() || '(빈 응답)'
  }

  if (cfg.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) throw new Error(await readError(res))
    const j = await res.json()
    return (j.content?.map((c: { text?: string }) => c.text).join('') ?? '').trim() || '(빈 응답)'
  }

  // openai / custom (OpenAI 호환 Chat Completions)
  const base = cfg.provider === 'custom' ? (cfg.baseUrl || '').replace(/\/$/, '') : 'https://api.openai.com/v1'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  const j = await res.json()
  return (j.choices?.[0]?.message?.content ?? '').trim() || '(빈 응답)'
}
