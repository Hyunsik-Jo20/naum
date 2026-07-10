import { useEffect, useMemo, useState } from 'react'
import { DISEASE_CATEGORIES } from '../data/mock'
import {
  EDU_LEVELS,
  EDU_OFFICES,
  EDU_PERIODS,
  EDU_REGIONS,
  type EduPeriod,
  type EduSchool,
} from '../data/eduMock'
import WeatherBar from '../components/WeatherBar'
import EduNurseTokenModal from '../components/EduNurseTokenModal'
import SchoolMap, { type AirAlert } from '../components/SchoolMap'
import type { CurrentWeather } from '../data/weatherApi'
import { deriveAlerts, type DisasterAlert } from '../data/disasters'
import DisasterStrip from '../components/DisasterStrip'
import { useOfficialAlerts } from '../data/useOfficialAlerts'
import TrendChart from '../components/TrendChart'
import SchoolDetail from '../components/SchoolDetail'
import InfectionPanel from '../components/InfectionPanel'
import GradeSexChart from '../components/GradeSexChart'
import HourlyChart from '../components/HourlyChart'
import SideRail from '../components/SideRail'
import SchoolAdminPanel from '../components/SchoolAdminPanel'
import AiReportPanel from '../components/AiReportPanel'
import { regionSignals, syndromeSignals } from '../data/surveillance'
import { useSchools } from '../store/schools'
import { useNotices } from '../store/notices'
import {
  PM_GRADES,
  RAIN_CLASSES,
  TEMP_BANDS,
  pmGrade,
  rainClass,
  tempBand,
  weatherSeries,
  type WeatherDay,
} from '../data/weather'
import { fetchHistory } from '../data/weatherApi'
import { buildMonthly } from '../data/monthly'
import { EDU_WEATHER_SCHOOL_NAME, schoolCoord } from '../data/location'

const EDU_WX = schoolCoord(EDU_WEATHER_SCHOOL_NAME)

export default function Edu() {
  const [period, setPeriod] = useState<EduPeriod>('이번 주')
  const [region, setRegion] = useState<string>('전체')
  const [office, setOffice] = useState<string>('전체')
  const [level, setLevel] = useState<string>('전체')
  const [category, setCategory] = useState<string>('전체')
  const [tempSel, setTempSel] = useState<string>('전체')
  const [pmSel, setPmSel] = useState<string>('전체')
  const [rainSel, setRainSel] = useState<string>('전체')
  const [series, setSeries] = useState<WeatherDay[]>(weatherSeries)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedSchool, setSelectedSchool] = useState<EduSchool | null>(null)
  const [refAir, setRefAir] = useState<CurrentWeather | null>(null)
  const [showNurseToken, setShowNurseToken] = useState(false)
  const { schools: allSchools } = useSchools()
  const { openCompose, sent, autoEvaluate, thresholds } = useNotices()
  const official = useOfficialAlerts()

  const alerts: DisasterAlert[] = useMemo(
    () => [...official, ...(refAir ? deriveAlerts(refAir, `${EDU_WX.name} 인근`, thresholds) : [])],
    [official, refAir, thresholds],
  )

  // 자동 공지 규칙 평가(경보 발생 시 자동 발송)
  useEffect(() => {
    autoEvaluate(alerts)
  }, [alerts, autoEvaluate])

  function fmt(ts: number) {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function exportCsv() {
    const now = new Date()
    const ds = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const scope = `지역=${region} 교육청=${office} 학교급=${level} 계통=${category} 기간=${selDateLabel ?? period}`
    const L: string[] = []
    L.push('나음 보건 대시보드 현황')
    L.push(`생성일,${now.toLocaleString('ko-KR')}`)
    L.push(`적용범위,"${scope}"`)
    L.push('')
    L.push('지표,값')
    L.push(`총 방문,${totalVisits}`)
    L.push(`학교 수,${schools.length}`)
    L.push(`최다 계통,${topCat}`)
    L.push(`이상 신호,${anomalies.length}`)
    L.push('')
    L.push('계통,방문수')
    DISEASE_CATEGORIES.forEach((c, i) => L.push(`${c},${agg[i]}`))
    L.push('')
    L.push('학교명,지역,교육청,학교급,주간방문,감염병')
    schools.forEach((s) => {
      const tot = s.cat.reduce((a, b) => a + b, 0)
      L.push(`${s.name},${s.region},${s.office},${s.level},${tot},${s.cat[10]}`)
    })
    const blob = new Blob(['﻿' + L.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `naum_dashboard_${ds}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 초미세먼지 나쁨/매우나쁨 → 지도 위 반투명 경보 오버레이 (설정 임계치 사용)
  let airAlert: AirAlert | null = null
  if (refAir) {
    if (refAir.pm25 >= thresholds.pm25_verybad)
      airAlert = { label: '매우나쁨', color: 'rgba(224,75,74,0.34)', pm25: refAir.pm25 }
    else if (refAir.pm25 >= thresholds.pm25_bad)
      airAlert = { label: '나쁨', color: 'rgba(234,159,39,0.30)', pm25: refAir.pm25 }
  }

  useEffect(() => {
    let ok = true
    fetchHistory()
      .then((h) => ok && h.length && setSeries(h))
      .catch(() => {})
    return () => {
      ok = false
    }
  }, [])

  // 지역·학교급 필터된 학교
  const schools = useMemo(
    () =>
      allSchools.filter(
        (s) =>
          (region === '전체' || s.region === region) &&
          (office === '전체' || s.office === office) &&
          (level === '전체' || s.level === level),
      ),
    [allSchools, region, office, level],
  )

  const trendCatIdx = category === '전체' ? -1 : DISEASE_CATEGORIES.indexOf(category as never)

  // 월간 데이터(이번 달/전월/전년 동월) — 학교 × 일자 × 계통
  const monthly = useMemo(() => buildMonthly(schools), [schools])
  const curAgg = monthly.cur

  // 집계 창: 선택 날짜 우선, 없으면 기간(오늘/주/이번달 전체)
  const windowIdx = useMemo(() => {
    const n = curAgg.length
    if (selectedDay != null && selectedDay >= 0 && selectedDay < n) return [selectedDay]
    const days = period === '오늘' ? 1 : period === '이번 주' ? 7 : n
    return Array.from({ length: Math.min(days, n) }, (_, k) => n - 1 - k)
  }, [selectedDay, period, curAgg.length])

  const agg = useMemo(() => {
    const cat = new Array(12).fill(0)
    windowIdx.forEach((d) => curAgg[d]?.forEach((n, i) => (cat[i] += n)))
    return cat
  }, [windowIdx, curAgg])

  const totalVisits = agg.reduce((a, b) => a + b, 0)
  // 학년/시간대 차트와 공유하는 집계 총량(전체 또는 선택 계통, 현재 기간·선택일 반영)
  const chartTotal = trendCatIdx < 0 ? totalVisits : agg[trendCatIdx] ?? 0
  const anomalies = schools.filter((s) => s.anomaly)
  const topCat = totalVisits > 0 ? DISEASE_CATEGORIES[agg.indexOf(Math.max(...agg))] : '-'
  const selMeta = selectedDay != null ? monthly.meta[selectedDay] : null
  const selDateLabel =
    selectedDay != null
      ? `${monthly.labels[selectedDay]}일${selMeta && !selMeta.operating ? ` (${selMeta.holiday ?? '주말'} · 미운영)` : ''}`
      : null

  // 추이 라인(이번 달/전월/전년 동월) — 전체 또는 선택 계통
  const lineOf = (mm: number[][]) =>
    trendCatIdx < 0 ? mm.map((c) => c.reduce((a, b) => a + b, 0)) : mm.map((c) => c[trendCatIdx])
  const curLine = lineOf(monthly.cur)
  const prevLine = lineOf(monthly.prev)
  const lyLine = lineOf(monthly.lastYear)
  const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const curSum = sumOf(curLine)
  const moM = sumOf(prevLine) ? Math.round((curSum / sumOf(prevLine) - 1) * 100) : 0
  const yoY = sumOf(lyLine) ? Math.round((curSum / sumOf(lyLine) - 1) * 100) : 0

  const bars = DISEASE_CATEGORIES.map((c, i) => ({ c, n: agg[i] }))
    .filter((b) => b.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
  const barMax = Math.max(1, ...bars.map((b) => b.n))

  // 날씨 연계 분석 — 최근 14일 날씨(series) 기준
  const wMatchedIdx = series
    .map((d, i) => ({ d, i }))
    .filter(
      ({ d }) =>
        (tempSel === '전체' || tempBand(d.tempC).label === tempSel) &&
        (pmSel === '전체' || pmGrade(d.pm10).label === pmSel) &&
        (rainSel === '전체' || rainClass(d.rainMm).label === rainSel),
    )
    .map(({ i }) => i)
  const overallAvg = series.reduce((a, d) => a + d.visits, 0) / (series.length || 1)
  const matchedAvg = wMatchedIdx.length
    ? wMatchedIdx.reduce((a, i) => a + series[i].visits, 0) / wMatchedIdx.length
    : 0
  const deltaPct = overallAvg ? Math.round((matchedAvg / overallAvg - 1) * 100) : 0
  const wcat = new Array(12).fill(0)
  wMatchedIdx.forEach((i) => series[i].cat.forEach((n, c) => (wcat[c] += n)))
  const wTop = wMatchedIdx.length ? DISEASE_CATEGORIES[wcat.indexOf(Math.max(...wcat))] : '-'

  // AI 특이사항 보고용 비식별 집계 요약 (학생 개인정보 미포함)
  const aiSummary = useMemo(() => {
    const scope = `지역=${region} · 교육청=${office} · 학교급=${level} · 계통=${category} · 기간=${selDateLabel ?? period}`
    const catLines = DISEASE_CATEGORIES.map((c, i) => ({ c, n: agg[i] }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map((x) => `${x.c} ${x.n}건`)
      .join(', ')
    const synd = syndromeSignals(schools, {
      excessAlert: thresholds.inf_excess_alert,
      excessWatch: thresholds.inf_excess_watch,
      minCount: thresholds.inf_min,
      regionMinCount: thresholds.inf_region_min,
    })
    const syndLine = synd
      .map((s) => `${s.name} ${s.excess.toFixed(1)}배(${s.count}건${s.level !== 'normal' ? `·${s.level === 'alert' ? '경보' : '주의'}` : ''})`)
      .join(', ')
    const regs = regionSignals(schools, {
      excessAlert: thresholds.inf_excess_alert,
      excessWatch: thresholds.inf_excess_watch,
      minCount: thresholds.inf_min,
      regionMinCount: thresholds.inf_region_min,
    })
    const alertRegLine =
      regs.filter((r) => r.level !== 'normal').map((r) => `${r.region} ${r.excess.toFixed(1)}배(${r.count}건·${r.schools}개교)`).join(', ') || '없음'
    const wxLine = refAir
      ? `기온 ${refAir.tempC}°C, PM2.5 ${refAir.pm25}㎍/㎥, PM10 ${refAir.pm10}㎍/㎥, 강수 ${refAir.rainMm}mm`
      : '기상 데이터 없음'
    const alertLine = alerts.length ? alerts.map((a) => a.title).join(', ') : '없음'
    return [
      '[부산시교육청 학교보건 — 비식별 집계]',
      `적용 범위: ${scope}`,
      `총 방문(${selDateLabel ?? period}): ${totalVisits}건 · 대상 학교: ${schools.length}개교 · 최다 계통: ${topCat}`,
      `계통별 상위: ${catLines || '없음'}`,
      `추세: 전월 대비 ${moM >= 0 ? '+' : ''}${moM}%, 전년 동월 대비 ${yoY >= 0 ? '+' : ''}${yoY}%`,
      `이상 신호 학교: ${anomalies.length}개교`,
      '',
      '[감염병 조기탐지 — 평소(baseline) 대비 증가배수]',
      `증후군별: ${syndLine}`,
      `지역 확산 경보: ${alertRegLine}`,
      '',
      '[기상·재난]',
      `현재 기상(${EDU_WX.name} 인근): ${wxLine}`,
      `재난·기상 경보: ${alertLine}`,
    ].join('\n')
  }, [
    region, office, level, category, period, selDateLabel, agg, schools, totalVisits, topCat,
    moM, yoY, anomalies.length, refAir, alerts, thresholds,
  ])

  return (
    <div>
      <SideRail side="left" title="학교 설정" icon="ti-school">
        <SchoolAdminPanel />
      </SideRail>
      <SideRail side="right" title="AI 특이사항 보고" icon="ti-robot">
        <AiReportPanel summary={aiSummary} />
      </SideRail>

      <WeatherBar
        lat={EDU_WX.lat}
        lon={EDU_WX.lon}
        label={`${EDU_WX.name} 인근 (교육청)`}
        onData={setRefAir}
      />
      <DisasterStrip
        alerts={alerts}
        onNotify={(a) => openCompose({ title: `[긴급] ${a.title}`, body: a.detail, to: '학교' })}
      />
      <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>부산시교육청 보건 현황</h2>
        <div className="row" style={{ gap: 8 }}>
          <span className="muted no-print" style={{ fontSize: 12 }}>
            <i className="ti ti-lock" style={{ verticalAlign: -2 }} aria-hidden="true" /> 비식별 · 5명 미만 숨김
          </span>
          <button className="btn small no-print" onClick={exportCsv}>
            <i className="ti ti-download" aria-hidden="true" /> CSV
          </button>
          <button className="btn small no-print" onClick={() => window.print()}>
            <i className="ti ti-printer" aria-hidden="true" /> 보고서(PDF)
          </button>
          <button className="btn small no-print" onClick={() => setShowNurseToken(true)} title="보건교사 회원가입 토큰 발급">
            <i className="ti ti-id-badge-2" aria-hidden="true" /> 보건교사 가입 토큰
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="filters">
        <label className="field">
          기간
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as EduPeriod)
              setSelectedDay(null)
            }}
          >
            {EDU_PERIODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="field">
          지역
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option>전체</option>
            {EDU_REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="field">
          교육청
          <select value={office} onChange={(e) => setOffice(e.target.value)}>
            <option>전체</option>
            {EDU_OFFICES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="field">
          학교급
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option>전체</option>
            {EDU_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="field">
          계통
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>전체</option>
            {DISEASE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 적용 범위 표시 */}
      <div className="scope-bar">
        <span>
          <i className="ti ti-filter" aria-hidden="true" /> 적용 범위:{' '}
          <strong>{region}</strong> · <strong>{level}</strong> · <strong>{category}</strong> ·{' '}
          <strong>{selDateLabel ? `${selDateLabel} (선택일)` : period}</strong>
        </span>
        {selDateLabel && (
          <button className="btn small" onClick={() => setSelectedDay(null)}>
            <i className="ti ti-x" aria-hidden="true" /> 날짜 해제
          </button>
        )}
      </div>

      {/* KPI */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">총 방문 {selDateLabel ? `(${selDateLabel})` : `(${period})`}</div>
          <div className="kpi-val">{totalVisits.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">학교 수</div>
          <div className="kpi-val">{schools.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">최다 계통</div>
          <div className="kpi-val sm">{topCat}</div>
        </div>
        <div className={`kpi ${anomalies.length ? 'warn' : ''}`}>
          <div className="kpi-label">이상 신호</div>
          <div className="kpi-val">{anomalies.length}건</div>
        </div>
      </div>

      {/* 지도 (카카오맵 — 키 없으면 자리 모형) */}
      <div style={{ marginBottom: 16 }}>
        <SchoolMap schools={schools} onSelect={setSelectedSchool} airAlert={airAlert} />
      </div>

      {selectedSchool && (
        <SchoolDetail school={selectedSchool} onClose={() => setSelectedSchool(null)} />
      )}

      {/* 날씨 연계 분석 (4단계 미리보기) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-label" style={{ marginBottom: 10 }}>
          날씨 연계 분석 <span className="muted-inline">· 기온·미세먼지·강수 등급으로 필터 (4단계 미리보기)</span>
        </div>
        <div className="filters" style={{ marginBottom: 14 }}>
          <label className="field">
            기온 구간
            <select value={tempSel} onChange={(e) => setTempSel(e.target.value)}>
              <option>전체</option>
              {TEMP_BANDS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="field">
            미세먼지 등급
            <select value={pmSel} onChange={(e) => setPmSel(e.target.value)}>
              <option>전체</option>
              {PM_GRADES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="field">
            강수
            <select value={rainSel} onChange={(e) => setRainSel(e.target.value)}>
              <option>전체</option>
              {RAIN_CLASSES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>

        {wMatchedIdx.length === 0 ? (
          <div className="col-empty">해당 날씨 조건의 날이 최근 14일 내 없어요.</div>
        ) : (
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            <div className="kpi">
              <div className="kpi-label">해당 일수</div>
              <div className="kpi-val">{wMatchedIdx.length}일</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">일평균 방문</div>
              <div className="kpi-val">{Math.round(matchedAvg)}건</div>
            </div>
            <div className={`kpi ${deltaPct > 0 ? 'warn' : ''}`}>
              <div className="kpi-label">전체 평균 대비</div>
              <div className="kpi-val">{deltaPct >= 0 ? '+' : ''}{deltaPct}%</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">최다 계통</div>
              <div className="kpi-val sm">{wTop}</div>
            </div>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          예: <strong>추움 + 미세먼지 나쁨</strong>인 날엔 호흡기계 방문이 늘어나는 경향을 볼 수 있어요. (최근 14일 데모 데이터)
        </p>
      </div>

      {/* 방문 추이 (월간 · 전월/전년 동월 비교) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div className="sec-label">
            방문 추이 <span className="muted-inline">· 이번 달(일자별) · {category === '전체' ? '전체 방문' : category} · 날짜 클릭 시 아래 연동</span>
          </div>
          <div className="trend-delta">
            <span>전월 대비 <strong className={moM >= 0 ? 'up' : 'down'}>{moM >= 0 ? '+' : ''}{moM}%</strong></span>
            <span>전년 동월 대비 <strong className={yoY >= 0 ? 'up' : 'down'}>{yoY >= 0 ? '+' : ''}{yoY}%</strong></span>
          </div>
        </div>
        <TrendChart
          labels={monthly.labels}
          lines={[
            { name: '이번 달', color: '#185fa5', values: curLine },
            { name: '전월', color: '#888780', values: prevLine, dashed: true },
            { name: '전년 동월', color: '#0f6e56', values: lyLine, dashed: true },
          ]}
          selected={selectedDay}
          onSelect={(i) => setSelectedDay((prev) => (prev === i ? null : i))}
        />
      </div>

      {/* 학교급·학년/남녀별 방문 (방문 추이·기간·선택일·계통과 동일 집계) */}
      <GradeSexChart
        schools={schools}
        catIdx={trendCatIdx}
        total={chartTotal}
        categoryLabel={category === '전체' ? '전체 방문' : category}
      />

      {/* 시간대별 방문 */}
      <HourlyChart total={chartTotal} categoryLabel={category === '전체' ? '전체 방문' : category} />

      {/* 계통별 현황 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-label" style={{ marginBottom: 12 }}>
          병명 계통별 현황 <span className="muted-inline">· 막대 클릭 시 해당 계통으로 차트 연동</span>
        </div>
        {bars.length === 0 ? (
          <div className="col-empty">표시할 데이터가 없어요.</div>
        ) : (
          <div className="bars">
            {bars.map((b) => (
              <button
                key={b.c}
                className={`bar-row clickable ${category === b.c ? 'hl' : ''}`}
                onClick={() => setCategory((prev) => (prev === b.c ? '전체' : b.c))}
              >
                <span className="bar-label">{b.c}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(b.n / barMax) * 100}%` }} />
                </span>
                <span className="bar-val">{b.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 이상 신호 · 감염병 모니터링 (통합) */}
      <InfectionPanel schools={schools} />

      {/* 공지 (양방향) */}
      <div className="notice-grid">
        <div className="card">
          <div className="row between" style={{ marginBottom: 8 }}>
            <div className="sec-label">
              <i className="ti ti-send" style={{ verticalAlign: -2 }} aria-hidden="true" /> 보낸 공지 (교육청 → 학교)
            </div>
            <button className="btn small" onClick={() => openCompose({ to: '학교' })}>
              <i className="ti ti-plus" aria-hidden="true" /> 공지 작성
            </button>
          </div>
          {sent.length === 0 ? (
            <div className="notice-meta">발송한 공지가 없습니다.</div>
          ) : (
            sent.map((n, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div className="notice-line">{n.title}</div>
                <div className="notice-meta">
                  {n.auto && <span style={{ color: 'var(--danger)' }}>[자동] </span>}
                  {n.to === '교육청' ? '교육청 보고' : `${n.region}·${n.level} ${n.count}개교 발송`} · {fmt(n.ts)}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <div className="sec-label" style={{ marginBottom: 8 }}>
            <i className="ti ti-inbox" style={{ verticalAlign: -2 }} aria-hidden="true" /> 받은 보고 (학교 → 교육청)
          </div>
          <div className="notice-line">사하초 감염병 의심 7건 보고</div>
          <div className="notice-meta">미확인 1건 · 오늘</div>
        </div>
      </div>

      {showNurseToken && <EduNurseTokenModal onClose={() => setShowNurseToken(false)} />}
    </div>
  )
}
