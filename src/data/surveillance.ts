// 감염병 의심 조기탐지(syndromic surveillance).
// 핵심: 확진 병명이 아니라 "증상 증후군의 시·공간 군집"을 평소(baseline) 대비로 탐지한다.
// 신호 = ① 율(재학생 1000명당) ② 평소 대비 증가배수(excess) ③ 절대건수 게이트(노이즈 차단).
import type { EduSchool } from './eduMock'

export const INF_CAT = 10 // 감염병 계통 인덱스

/** 증상 증후군 → 통계 계통 인덱스 매핑. 확진을 기다리지 않고 증후군 단위로 본다. */
export interface Syndrome {
  key: string
  name: string
  idx: number // 계통 인덱스
  hint: string // 대표 질환(역학 해석 힌트)
}

export const SYNDROMES: Syndrome[] = [
  { key: 'resp', name: '발열·호흡기', idx: 0, hint: '인플루엔자·감기 유행' },
  { key: 'gi', name: '구토·설사', idx: 1, hint: '장염·노로·식중독' },
  { key: 'rash', name: '발진·수포', idx: 5, hint: '수두·수족구' },
  { key: 'eye', name: '눈 충혈', idx: 9, hint: '유행성 결막염' },
  { key: 'inf', name: '감염병(확정 분류)', idx: INF_CAT, hint: '보건교사 감염병 분류' },
]

export type SignalLevel = 'normal' | 'watch' | 'alert'

/** 탐지 파라미터 — 고정 합계가 아니라 "평소 대비 얼마나 비정상인가"로 본다. */
export interface SurvParams {
  excessAlert: number // 평소 대비 증가배수 — 경보
  excessWatch: number // 주의
  minCount: number // 학교 최소 건수(소규모 학교 노이즈 차단)
  regionMinCount: number // 지역 최소 건수
}

export const DEFAULT_SURV: SurvParams = {
  excessAlert: 2.5,
  excessWatch: 1.6,
  minCount: 4,
  regionMinCount: 10,
}

const EPS = 0.5 // baseline 평활(0으로 나눔 방지)

function classify(count: number, excess: number, minCount: number, p: SurvParams): SignalLevel {
  if (count >= minCount && excess >= p.excessAlert) return 'alert'
  if (count >= Math.max(2, minCount - 2) && excess >= p.excessWatch) return 'watch'
  return 'normal'
}

export interface SchoolSignal {
  school: EduSchool
  count: number // 현재 건수
  base: number // 평소 기대치
  excess: number // 평소 대비 배수
  rate: number // 재학생 1000명당
  level: SignalLevel
}

/** 학교 단위 신호(기본: 감염병 계통). idx로 증후군별 적용 가능. */
export function schoolSignal(s: EduSchool, p: SurvParams = DEFAULT_SURV, idx = INF_CAT): SchoolSignal {
  const count = s.cat[idx]
  const base = s.base[idx]
  const excess = count / Math.max(base, EPS)
  const rate = s.enroll > 0 ? (count / s.enroll) * 1000 : 0
  return { school: s, count, base, excess, rate, level: classify(count, excess, p.minCount, p) }
}

export interface RegionSignal {
  region: string
  count: number
  base: number
  excess: number
  schools: number // 발생 학교 수
  level: SignalLevel
}

/** 지역 단위 신호 — 같은 구 학교들의 평소 대비 동시 상승(공간 군집)을 본다. */
export function regionSignals(schools: EduSchool[], p: SurvParams = DEFAULT_SURV, idx = INF_CAT): RegionSignal[] {
  const m: Record<string, { count: number; base: number; schools: number }> = {}
  schools.forEach((s) => {
    const r = (m[s.region] ??= { count: 0, base: 0, schools: 0 })
    r.count += s.cat[idx]
    r.base += s.base[idx]
    if (s.cat[idx] > 0) r.schools++
  })
  return Object.entries(m)
    .map(([region, v]) => {
      const excess = v.count / Math.max(v.base, EPS)
      return {
        region,
        count: v.count,
        base: Math.round(v.base),
        excess,
        schools: v.schools,
        level: classify(v.count, excess, p.regionMinCount, p),
      }
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.excess - a.excess || b.count - a.count)
}

export interface SyndromeSignal extends Syndrome {
  count: number
  base: number
  excess: number
  level: SignalLevel
}

/** 증후군별 신호 — 발열호흡기/위장관/발진/결막염/감염병을 평소 대비로 따로 추적. */
export function syndromeSignals(schools: EduSchool[], p: SurvParams = DEFAULT_SURV): SyndromeSignal[] {
  return SYNDROMES.map((sy) => {
    let count = 0
    let base = 0
    schools.forEach((s) => {
      count += s.cat[sy.idx]
      base += s.base[sy.idx]
    })
    const excess = count / Math.max(base, EPS)
    let level: SignalLevel = 'normal'
    if (excess >= p.excessAlert) level = 'alert'
    else if (excess >= p.excessWatch) level = 'watch'
    return { ...sy, count, base: Math.round(base), excess, level }
  }).sort((a, b) => b.excess - a.excess)
}
