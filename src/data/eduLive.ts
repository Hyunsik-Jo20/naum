// 교육청 대시보드 실데이터 계층 — 전 학교 비식별 방문(visits)을 조회·실시간 구독·집계.
//  · RLS(0012): edu 계정은 전 학교 SELECT 허용 → 필터 없는 Realtime 구독도 RLS가 스코프.
//  · 목데이터(eduMock 합성 지표) 대체 — 모든 수치는 실제 접수 방문에서만 계산(비식별: 학교·학년·성별·계통·시각).
//  · 창: 최근 90일(이번 달 추이 + 전월 비교 + 주간 조기탐지 baseline까지 커버).
import { useEffect, useMemo, useState } from 'react'
import { DISEASE_CATEGORIES, tileById } from './mock'
import { supabase, SUPABASE_ENABLED } from './supabaseClient'
import { uniqTopic, onWake } from './realtimeUtil'
import { holidayName, isOperatingDay } from './holidays'
import { INF_CAT, SYNDROMES, DEFAULT_SURV } from './surveillance'
import type { EduSchool } from './eduMock'
import type { Disease, Sex, VisitStatus } from '../types'

export interface EduVisitRow {
  schoolId: string
  createdAt: number
  grade: number
  sex: Sex
  catIdx: number // 주병명 계통(DISEASE_CATEGORIES index). 미확정이면 첫 증상타일 계통, 없으면 11(기타)
  status: VisitStatus
}

/** 실데이터 집계를 얹은 학교(등록부 + 주간 통계) — surveillance 함수들의 입력. */
export interface EduSchoolStats extends EduSchool {
  cat: number[] // 최근 7일 계통별 방문 수
  base: number[] // 평소 기대치 = 직전 28일 운영일 평균 × 이번 주 운영일수
  anomaly?: string // 증후군 급증(기본 임계치) 자동 문구
}

export const EDU_WINDOW_DAYS = 90
const DAY = 86400000
const zeros = () => new Array(12).fill(0)

function catIdxOf(diseases: Disease[] | null, tiles: string[] | null): number {
  const prim = diseases?.find((d) => d.isPrimary) ?? diseases?.[0]
  if (prim) {
    const i = DISEASE_CATEGORIES.indexOf(prim.category)
    if (i >= 0) return i
  }
  for (const t of tiles ?? []) {
    const tl = tileById(t)
    if (tl) {
      const i = DISEASE_CATEGORIES.indexOf(tl.category)
      if (i >= 0) return i
    }
  }
  return 11 // 기타
}

interface RawRow {
  school_id: string
  grade: number
  sex: Sex
  symptom_tile_ids: string[] | null
  diseases: Disease[] | null
  status: VisitStatus
  created_at: number
}

/** 최근 90일 전 학교 비식별 방문 — supabase 기본 1000행 제한 때문에 range 페이징. demo(시연 학교)는 실집계 제외. */
export async function fetchEduVisits(): Promise<EduVisitRow[]> {
  if (!supabase) return []
  const since = Date.now() - EDU_WINDOW_DAYS * DAY
  const out: EduVisitRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('visits')
      .select('school_id,grade,sex,symptom_tile_ids,diseases,status,created_at')
      .gte('created_at', since)
      .neq('school_id', 'demo')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data) break
    for (const r of data as RawRow[]) {
      out.push({
        schoolId: r.school_id,
        createdAt: r.created_at,
        grade: r.grade,
        sex: r.sex,
        catIdx: catIdxOf(r.diseases, r.symptom_tile_ids),
        status: r.status,
      })
    }
    if (data.length < PAGE) break
  }
  return out
}

/** 실시간 훅 — 초기 조회 + visits 변경 구독(재조회 디바운스) + 재연결/탭복귀 catch-up. */
export function useEduVisits(): { rows: EduVisitRow[]; loading: boolean; activeSchoolIds: Set<string> } {
  const [rows, setRows] = useState<EduVisitRow[]>([])
  const [loading, setLoading] = useState<boolean>(SUPABASE_ENABLED)

  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) return
    let ok = true
    let timer: number | null = null
    const refresh = async () => {
      try {
        const r = await fetchEduVisits()
        if (ok) setRows(r)
      } finally {
        if (ok) setLoading(false)
      }
    }
    // 이벤트 폭주(연속 접수) 시 재조회 1.2초 디바운스
    const debounced = () => {
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 1200)
    }
    void refresh()
    const sb = supabase
    let once = false
    const ch = sb
      .channel(uniqTopic('edu-visits'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, debounced)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (once) debounced() // 재연결 — 끊긴 사이 catch-up
          once = true
        }
      })
    const offWake = onWake(debounced)
    return () => {
      ok = false
      offWake()
      if (timer != null) window.clearTimeout(timer)
      void sb.removeChannel(ch)
    }
  }, [])

  const activeSchoolIds = useMemo(() => {
    const s = new Set<string>()
    rows.forEach((r) => s.add(r.schoolId))
    return s
  }, [rows])

  return { rows, loading, activeSchoolIds }
}

/* ───────────── 순수 집계 함수 ───────────── */

export interface DayMeta {
  operating: boolean
  holiday?: string
  weekend: boolean
}
export interface MonthAgg {
  labels: string[] // 1..오늘
  cur: number[][] // 이번 달: days × 12 (실측)
  prev: number[][] // 전월(실측)
  lastYear: number[][] // 전년 동월 — 90일 창 밖이라 보통 0(합계 0이면 화면에서 숨김)
  meta: DayMeta[]
}

/** 이번 달/전월/전년 동월 일자×계통 실측 집계. */
export function buildMonthlyReal(rows: EduVisitRow[], now: Date = new Date()): MonthAgg {
  const y = now.getFullYear()
  const m = now.getMonth()
  const today = now.getDate()
  const prevRef = new Date(y, m - 1, 1)
  const py = prevRef.getFullYear()
  const pm = prevRef.getMonth()
  const daysPrev = new Date(py, pm + 1, 0).getDate()
  const daysLy = new Date(y - 1, m + 1, 0).getDate()
  const mk = (n: number) => Array.from({ length: n }, () => zeros())
  const cur = mk(today)
  const prev = mk(Math.min(today, daysPrev))
  const lastYear = mk(Math.min(today, daysLy))
  for (const r of rows) {
    const d = new Date(r.createdAt)
    const idx = d.getDate() - 1
    if (d.getFullYear() === y && d.getMonth() === m) {
      if (idx < cur.length) cur[idx][r.catIdx]++
    } else if (d.getFullYear() === py && d.getMonth() === pm) {
      if (idx < prev.length) prev[idx][r.catIdx]++
    } else if (d.getFullYear() === y - 1 && d.getMonth() === m) {
      if (idx < lastYear.length) lastYear[idx][r.catIdx]++
    }
  }
  const meta: DayMeta[] = Array.from({ length: today }, (_, i) => {
    const date = new Date(y, m, i + 1)
    const w = date.getDay() === 0 || date.getDay() === 6
    return { operating: isOperatingDay(date), holiday: holidayName(date), weekend: w }
  })
  return { labels: Array.from({ length: today }, (_, i) => String(i + 1)), cur, prev, lastYear, meta }
}

/** 학교별 주간 통계 + 평소 baseline(직전 28일 운영일 평균×이번 주 운영일수) + 증후군 급증 자동 문구.
 *  baseline이 없는 신규 학교는 base=0 → 소량 방문도 배수가 커질 수 있으나 minCount 게이트가 노이즈를 막는다. */
export function buildSchoolStats(rows: EduVisitRow[], registry: EduSchool[], now: Date = new Date()): EduSchoolStats[] {
  const end = now.getTime()
  const winStart = end - 7 * DAY
  const baseStart = winStart - 28 * DAY
  let winOp = 0
  for (let t = winStart; t < end; t += DAY) if (isOperatingDay(new Date(t))) winOp++
  let baseOp = 0
  for (let t = baseStart; t < winStart; t += DAY) if (isOperatingDay(new Date(t))) baseOp++

  const catBy = new Map<string, number[]>()
  const baseBy = new Map<string, number[]>()
  for (const r of rows) {
    if (r.createdAt >= winStart) {
      const c = catBy.get(r.schoolId) ?? catBy.set(r.schoolId, zeros()).get(r.schoolId)!
      c[r.catIdx]++
    } else if (r.createdAt >= baseStart) {
      const b = baseBy.get(r.schoolId) ?? baseBy.set(r.schoolId, zeros()).get(r.schoolId)!
      b[r.catIdx]++
    }
  }

  return registry.map((s) => {
    const cat = catBy.get(s.id) ?? zeros()
    const raw = baseBy.get(s.id) ?? zeros()
    const base = raw.map((v) => (baseOp > 0 ? (v / baseOp) * Math.max(1, winOp) : 0))
    // 지도 별표·KPI용 자동 이상신호 — 기본 임계치(DEFAULT_SURV). 상세 판정은 InfectionPanel의 사용자 임계치.
    let anomaly: string | undefined
    for (const sy of SYNDROMES) {
      const cnt = cat[sy.idx]
      if (cnt >= DEFAULT_SURV.minCount && cnt / Math.max(base[sy.idx], 0.5) >= DEFAULT_SURV.excessAlert) {
        anomaly = `${sy.name} 평소 대비 급증`
        break
      }
    }
    return { ...s, cat, base, anomaly }
  })
}

/** 시간대별(07~21시) 방문 수. */
export const HOURLY_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
export function buildHourly(rows: EduVisitRow[]): number[] {
  const vals = new Array(HOURLY_HOURS.length).fill(0)
  for (const r of rows) {
    const h = new Date(r.createdAt).getHours()
    const i = HOURLY_HOURS.indexOf(h)
    if (i >= 0) vals[i]++
  }
  return vals
}

/** 학교급(초/중/고)별 학년·성별 실측 집계. */
export interface GradeSexAgg {
  byGrade: Record<number, number>
  bySex: { 남: number; 여: number }
  total: number
}
export function buildGradeSex(
  rows: EduVisitRow[],
  levelOf: (schoolId: string) => string | undefined,
): Record<'초' | '중' | '고', GradeSexAgg> {
  const mk = (): GradeSexAgg => ({ byGrade: {}, bySex: { 남: 0, 여: 0 }, total: 0 })
  const out = { 초: mk(), 중: mk(), 고: mk() }
  for (const r of rows) {
    const lv = levelOf(r.schoolId)
    if (lv !== '초' && lv !== '중' && lv !== '고') continue
    const g = out[lv]
    g.byGrade[r.grade] = (g.byGrade[r.grade] ?? 0) + 1
    if (r.sex === '남' || r.sex === '여') g.bySex[r.sex]++
    g.total++
  }
  return out
}

const dk = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 일자(YYYY-MM-DD)별 계통 집계 — 날씨 연계 분석의 실측 방문 조인용. */
export function dailyCatMap(rows: EduVisitRow[]): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (const r of rows) {
    const k = dk(r.createdAt)
    const c = m.get(k) ?? m.set(k, zeros()).get(k)!
    c[r.catIdx]++
  }
  return m
}

/** 오늘 감염병 계통 방문 학교별 집계 — "받은 보고(학교→교육청)" 실데이터. */
export function todayInfectionReports(
  rows: EduVisitRow[],
  registry: EduSchool[],
  now: Date = new Date(),
): { school: EduSchool; count: number }[] {
  const todayKey = dk(now.getTime())
  const bySchool = new Map<string, number>()
  for (const r of rows) {
    if (r.catIdx !== INF_CAT) continue
    if (dk(r.createdAt) !== todayKey) continue
    bySchool.set(r.schoolId, (bySchool.get(r.schoolId) ?? 0) + 1)
  }
  const out: { school: EduSchool; count: number }[] = []
  bySchool.forEach((count, id) => {
    const school = registry.find((s) => s.id === id)
    if (school) out.push({ school, count })
  })
  return out.sort((a, b) => b.count - a.count)
}
