// 감염병 심층 분석용 브리프 — 교육청 대시보드가 AI에 보내는 "깊은" 비식별 입력. 요청 2026-09-22.
//
// 왜 따로 만드나: 기존 AI 보고 요약(Edu.tsx aiSummary)은 증후군별 배수와 지역 경보 정도만 담아서,
//  AI가 "발열·호흡기 2.3배"를 되풀이하는 것 이상을 못 했다. 역학적으로 감별하려면
//  ① 며칠째인지(시간 추이) ② 어느 학년에 몰렸는지 ③ 몇 시에 몰렸는지
//  ④ 얼마나 중한지(귀가·이송 비율) ⑤ 같은 지역 학교들이 같은 증후군인지 — 가 필요하다.
//  전부 이미 수집된 비식별 값이라 새로 모으는 정보는 없고, 있는 걸 정리해서 보낼 뿐이다.
//
// 개인정보 경계(사용자 결정 2026-09-22):
//  · 학생 단위 정보는 애초에 서버에 없다(이름·반·번호 없음). 여기서도 개인 단위는 만들지 않는다.
//  · **학교명은 외부 AI로 보내지 않는다.** A교·B교 같은 익명 코드로 바꿔 보내고,
//    화면에 답을 보여줄 때 코드를 실명으로 되돌린다(`codeMap`). 장학사는 실명으로 본다.
//  · 소규모 노출을 막기 위해 학교 단위 줄은 최소 건수를 넘은 학교만 싣는다.
import { isOperatingDay } from './holidays'
import { SYNDROMES, type SurvParams, type Syndrome } from './surveillance'
import type { EduSchoolStats, EduVisitRow } from './eduLive'

const DAY = 86400000
const BRIEF_DAYS = 14 // 시간 추이 창 — 잠복기·주말 효과를 보려면 2주는 있어야 한다
const SCHOOL_MIN = 3 // 학교 단위 줄에 실을 최소 건수(소규모 노출·노이즈 차단)

const dk = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 학교 익명 코드 — A, B, … Z, AA, AB … */
function codeOf(i: number): string {
  let n = i
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `${out}교`
}

export interface InfectionBrief {
  /** AI에 그대로 보내는 본문(학교명 없음) */
  text: string
  /** 익명 코드 → 실제 학교명. 화면 표시용이며 AI로 나가지 않는다. */
  codeMap: Map<string, string>
  /** 본문에 실제로 등장한 수치 — AI 출력 검증(없는 숫자를 지어냈는지)에 쓴다. */
  numbers: Set<string>
}

interface DayPoint {
  key: string
  operating: boolean
  total: number
  bySyn: number[] // SYNDROMES 순서
}

/** 최근 14일 일자별 총 방문 + 증후군별 */
function dailySeries(rows: EduVisitRow[], now: number): DayPoint[] {
  const out: DayPoint[] = []
  for (let d = BRIEF_DAYS - 1; d >= 0; d--) {
    const t = now - d * DAY
    out.push({ key: dk(t), operating: isOperatingDay(new Date(t)), total: 0, bySyn: SYNDROMES.map(() => 0) })
  }
  const index = new Map(out.map((p, i) => [p.key, i]))
  const start = now - BRIEF_DAYS * DAY
  for (const r of rows) {
    if (r.createdAt < start) continue
    const i = index.get(dk(r.createdAt))
    if (i == null) continue
    out[i].total++
    SYNDROMES.forEach((sy, k) => {
      if (sy.idx === r.catIdx) out[i].bySyn[k]++
    })
  }
  return out
}

/** 증후군별 학년 분포 — 수족구·수두는 저학년 집중, 인플루엔자는 전학년. 감별의 핵심 단서. */
function gradeBySyndrome(rows: EduVisitRow[], now: number, days: number): Map<string, Record<number, number>> {
  const start = now - days * DAY
  const m = new Map<string, Record<number, number>>()
  for (const r of rows) {
    if (r.createdAt < start) continue
    for (const sy of SYNDROMES) {
      if (sy.idx !== r.catIdx) continue
      const g = m.get(sy.key) ?? m.set(sy.key, {}).get(sy.key)!
      g[r.grade] = (g[r.grade] ?? 0) + 1
    }
  }
  return m
}

/** 결과 분포 — 귀가·병원 이송 비율이 중증도 대리지표. 건수가 같아도 귀가율이 뛰면 다른 상황이다.
 *  catIdx를 주면 그 계통(증후군)만 센다. 주지 않으면 전체 방문.
 *  ⚠ 전체 분포만 보내면 모델이 그걸 "특정 증후군 환자들의 결과"로 읽는다(2026-09-22 실사용에서 발생).
 *    그래서 전체와 증후군별을 **둘 다, 기준을 밝혀서** 보낸다. */
function outcomeShare(
  rows: EduVisitRow[], from: number, to: number, catIdx?: number,
): { total: number; counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    if (r.createdAt < from || r.createdAt >= to) continue
    if (catIdx != null && r.catIdx !== catIdx) continue
    if (!r.outcome) continue
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1
    total++
  }
  return { total, counts }
}

/** 시간대 분포 — 급식 직후(12~14시) 집중이면 식중독을 의심할 근거가 된다. */
function hourBuckets(rows: EduVisitRow[], now: number, days: number): Record<string, number> {
  const start = now - days * DAY
  const b = { '등교~2교시(08-10)': 0, '3~4교시(10-12)': 0, '급식 전후(12-14)': 0, '5~6교시(14-16)': 0, '방과후(16-)': 0 }
  for (const r of rows) {
    if (r.createdAt < start) continue
    const h = new Date(r.createdAt).getHours()
    if (h < 10) b['등교~2교시(08-10)']++
    else if (h < 12) b['3~4교시(10-12)']++
    else if (h < 14) b['급식 전후(12-14)']++
    else if (h < 16) b['5~6교시(14-16)']++
    else b['방과후(16-)']++
  }
  return b
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const x = (n: number) => n.toFixed(1)

/** 학교 단위 증후군 신호(익명 코드 부여 대상) */
interface SchoolLine {
  code: string
  name: string
  region: string
  enroll?: number
  hits: { sy: Syndrome; count: number; base: number; excess: number }[]
}

function schoolLines(stats: EduSchoolStats[], p: SurvParams): SchoolLine[] {
  const out: SchoolLine[] = []
  for (const s of stats) {
    const hits = SYNDROMES.map((sy) => {
      const count = s.cat[sy.idx] ?? 0
      const base = s.base[sy.idx] ?? 0
      return { sy, count, base, excess: count / Math.max(base, 0.5) }
    }).filter((h) => h.count >= Math.max(SCHOOL_MIN, Math.min(p.minCount, SCHOOL_MIN)) && h.excess >= p.excessWatch)
    if (hits.length) {
      hits.sort((a, b) => b.excess - a.excess)
      out.push({ code: '', name: s.name, region: s.region, enroll: s.enroll, hits })
    }
  }
  out.sort((a, b) => b.hits[0].excess - a.hits[0].excess)
  return out.slice(0, 12).map((l, i) => ({ ...l, code: codeOf(i) }))
}

/** 교육청 감염병 심층 분석 브리프 생성 — 학교명 없는 본문 + 코드 매핑 + 검증용 수치 집합. */
export function buildInfectionBrief(
  rows: EduVisitRow[],
  stats: EduSchoolStats[],
  p: SurvParams,
  scopeLabel: string,
  now: number = Date.now(),
): InfectionBrief {
  const L: string[] = []
  const numbers = new Set<string>()
  const num = (v: string | number) => {
    numbers.add(String(v))
    return String(v)
  }

  L.push('[감염병 심층 분석 입력 — 비식별 집계. 학교는 익명 코드(A교·B교…)로만 표기]')
  L.push(`적용 범위: ${scopeLabel}`)
  L.push(`기준 시각: ${new Date(now).toLocaleString('ko-KR')}`)
  L.push(`탐지 임계치: 경보 ${num(x(p.excessAlert))}배 / 주의 ${num(x(p.excessWatch))}배 · 학교 최소 ${num(p.minCount)}건 · 지역 최소 ${num(p.regionMinCount)}건`)
  L.push('')

  // ① 시간 추이 — "며칠째 오르는가"
  const series = dailySeries(rows, now)
  L.push(`[1) 최근 ${num(BRIEF_DAYS)}일 일자별 방문 — 휴업일은 ×]`)
  L.push('일자 | 총 | ' + SYNDROMES.map((s) => s.name).join(' | '))
  for (const d of series) {
    L.push(
      `${d.key}${d.operating ? '' : '×'} | ${num(d.total)} | ` + d.bySyn.map((n) => num(n)).join(' | '),
    )
  }
  L.push('')

  // ② 증후군별 현재 vs 평소
  L.push('[2) 증후군별 최근 7일 vs 평소(직전 28일 운영일 평균 환산)]')
  for (const sy of SYNDROMES) {
    let count = 0
    let base = 0
    for (const s of stats) {
      count += s.cat[sy.idx] ?? 0
      base += s.base[sy.idx] ?? 0
    }
    const ex = count / Math.max(base, 0.5)
    const level = ex >= p.excessAlert && count >= p.minCount ? '경보' : ex >= p.excessWatch ? '주의' : '정상'
    L.push(`${sy.name}(${sy.hint}): ${num(count)}건 / 평소 ${num(Math.round(base))}건 = ${num(x(ex))}배 · ${level}`)
  }
  L.push('')

  // ③ 학년 분포 — 감별의 핵심
  const gm = gradeBySyndrome(rows, now, 7)
  L.push('[3) 증후군별 학년 분포 (최근 7일) — 저학년 집중이면 수족구·수두 계열, 전학년 고르면 인플루엔자 계열]')
  for (const sy of SYNDROMES) {
    const g = gm.get(sy.key)
    if (!g) continue
    const tot = Object.values(g).reduce((a, b) => a + b, 0)
    if (!tot) continue
    const parts = Object.entries(g)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([gr, n]) => `${gr}학년 ${num(n)}`)
      .join(', ')
    L.push(`${sy.name}(총 ${num(tot)}건): ${parts}`)
  }
  L.push('')

  // ④ 시간대
  const hb = hourBuckets(rows, now, 7)
  L.push('[4) 시간대 분포 (최근 7일) — 급식 전후 집중이면 식중독 의심 근거]')
  L.push(Object.entries(hb).map(([k, v]) => `${k} ${num(v)}건`).join(' · '))
  L.push('')

  // ⑤ 중증도 대리지표 — 전체와 증후군별을 기준을 밝혀서 함께
  const cur = outcomeShare(rows, now - 7 * DAY, now)
  const prev = outcomeShare(rows, now - 35 * DAY, now - 7 * DAY)
  L.push('[5) 처치 결과 분포 — 귀가·병원 이송 비율이 중증도 대리지표]')
  const fmt = (o: { total: number; counts: Record<string, number> }) =>
    o.total === 0
      ? '기록 없음'
      : Object.entries(o.counts).map(([k, v]) => `${k} ${num(v)}건(${num(pct(v, o.total))}%)`).join(', ')
  L.push(`※ 아래 "전체 방문" 두 줄은 모든 증상을 합친 값이다. 특정 증후군 환자의 결과로 읽지 말 것.`)
  L.push(`전체 방문·최근 7일(결과 기록 ${num(cur.total)}건): ${fmt(cur)}`)
  L.push(`전체 방문·직전 4주(결과 기록 ${num(prev.total)}건): ${fmt(prev)}`)
  L.push('증후군별(최근 7일) — 증후군을 지목해 말할 때는 반드시 이 줄을 쓸 것:')
  let anySyn = false
  for (const sy of SYNDROMES) {
    const o = outcomeShare(rows, now - 7 * DAY, now, sy.idx)
    if (o.total === 0) continue
    anySyn = true
    L.push(`  ${sy.name}(결과 기록 ${num(o.total)}건): ${fmt(o)}`)
  }
  if (!anySyn) L.push('  증후군별 결과 기록 없음')
  L.push('')

  // ⑥ 학교 단위 — 익명 코드
  const lines = schoolLines(stats, p)
  const codeMap = new Map<string, string>()
  L.push(`[6) 평소 대비 상승한 학교 (${num(SCHOOL_MIN)}건 이상만, 상위 ${num(12)}개교 · 익명 코드)]`)
  if (!lines.length) L.push('해당 없음')
  for (const l of lines) {
    codeMap.set(l.code, l.name)
    const hit = l.hits
      .map((h) => `${h.sy.name} ${num(h.count)}건(평소 ${num(Math.round(h.base))}건, ${num(x(h.excess))}배)`)
      .join(' / ')
    L.push(`${l.code} · ${l.region}${l.enroll ? ` · 재학 ${num(l.enroll)}명` : ''} — ${hit}`)
  }
  L.push('')

  // ⑦ 공간 군집 — 같은 지역에서 같은 증후군이 동시에 오르는가
  L.push('[7) 같은 지역 동시 상승 (공간 군집 판단용)]')
  const byRegion = new Map<string, Map<string, string[]>>()
  for (const l of lines) {
    const r = byRegion.get(l.region) ?? byRegion.set(l.region, new Map()).get(l.region)!
    for (const h of l.hits) {
      const arr = r.get(h.sy.name) ?? r.set(h.sy.name, []).get(h.sy.name)!
      arr.push(l.code)
    }
  }
  let clustered = false
  byRegion.forEach((synMap, region) => {
    synMap.forEach((codes, syn) => {
      if (codes.length >= 2) {
        clustered = true
        L.push(`${region}: ${syn} — ${codes.join(', ')} ${num(codes.length)}개교 동시 상승`)
      }
    })
  })
  if (!clustered) L.push('같은 지역 2개교 이상이 같은 증후군으로 동시에 오른 사례 없음')

  return { text: L.join('\n'), codeMap, numbers }
}

/** 익명 코드를 실제 학교명으로 되돌린다 — 화면 표시 전용(장학사는 실명으로 본다). */
export function revealCodes(text: string, codeMap: Map<string, string>): string {
  let out = text
  // 긴 코드(AA교)부터 치환해야 A교가 AA교를 깨뜨리지 않는다
  const codes = [...codeMap.keys()].sort((a, b) => b.length - a.length)
  for (const c of codes) out = out.split(c).join(`${codeMap.get(c)}`)
  return out
}

/** AI 출력 점검 — 보내지 않은 학교명이 나오거나, 브리프에 없는 배수·건수를 지어냈으면 짚어 준다.
 *  교육청 공문으로 나갈 수 있는 글이라 "그럴듯한 숫자"를 그대로 흘려보내면 안 된다. */
export function auditAiOutput(brief: InfectionBrief, out: string, allSchoolNames: string[]): string[] {
  const warn: string[] = []
  const sent = new Set(brief.codeMap.values())
  const leaked = allSchoolNames.filter((n) => n.length >= 3 && !sent.has(n) && out.includes(n))
  if (leaked.length) {
    warn.push(`보내지 않은 학교명이 답변에 있습니다: ${[...new Set(leaked)].slice(0, 5).join(', ')} — 지어낸 내용일 수 있습니다.`)
  }
  // 배수·건수·개교만 본다. **퍼센트는 제외** — 비율은 거의 항상 파생값이라 오탐만 늘린다.
  //  합계·평균·계산값이라고 밝힌 자리도 제외(모델에게 그렇게 표기하라고 지시해 두었다).
  //  오탐이 잦으면 진짜 경고까지 무시하게 되므로 일부러 느슨하게 잡는다.
  const DERIVED = /계산값|합계|합산|평균|비율|총\s*합/
  const bad = new Set<string>()
  for (const m of out.matchAll(/(\d+(?:\.\d+)?)\s*(배|건|개교)/g)) {
    const v = m[1]
    if (brief.numbers.has(v)) continue
    const around = out.slice(Math.max(0, m.index - 40), m.index + 40)
    if (DERIVED.test(around)) continue
    bad.add(v)
  }
  if (bad.size) {
    warn.push(`입력 자료에 없는 수치가 쓰였습니다: ${[...bad].slice(0, 8).join(', ')} — 근거를 확인하세요.`)
  }
  return warn
}
