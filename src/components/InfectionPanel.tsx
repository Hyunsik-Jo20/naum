import { useMemo, useState } from 'react'
import type { EduSchool } from '../data/eduMock'
import { buildMonthly } from '../data/monthly'
import {
  INF_CAT,
  regionSignals,
  schoolSignal,
  syndromeSignals,
  type SignalLevel,
  type SurvParams,
} from '../data/surveillance'
import { useNotices } from '../store/notices'
import TrendChart from './TrendChart'

const LEVEL_COLOR: Record<SignalLevel, string> = {
  normal: 'var(--info)',
  watch: '#c98a2b',
  alert: 'var(--danger)',
}
const LEVEL_LABEL: Record<SignalLevel, string> = { normal: '정상', watch: '주의', alert: '경보' }

function fmtX(x: number): string {
  if (!Number.isFinite(x)) return '—'
  return `${x.toFixed(1)}×`
}

export default function InfectionPanel({ schools }: { schools: EduSchool[] }) {
  const { openCompose, thresholds, setThreshold } = useNotices()
  const [showCfg, setShowCfg] = useState(false)
  const [selDay, setSelDay] = useState<number | null>(null)

  const params: SurvParams = {
    excessAlert: thresholds.inf_excess_alert,
    excessWatch: thresholds.inf_excess_watch,
    minCount: thresholds.inf_min,
    regionMinCount: thresholds.inf_region_min,
  }

  const monthly = useMemo(() => buildMonthly(schools), [schools])

  // 증후군별 조기신호(평소 대비 증가배수) — 확진 전에 증상 단위로 본다.
  const syndromes = useMemo(() => syndromeSignals(schools, params), [schools, params])

  // 감염병 계통 신호
  const regions = useMemo(() => regionSignals(schools, params), [schools, params])
  const schoolSigs = useMemo(
    () =>
      schools
        .map((s) => schoolSignal(s, params))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.excess - a.excess || b.count - a.count),
    [schools, params],
  )
  const alertRegions = regions.filter((r) => r.level !== 'normal')
  const alertSchools = schoolSigs.filter((x) => x.level !== 'normal')

  // 감염병 계통 월간 추이
  const curLine = monthly.cur.map((d) => d[INF_CAT])
  const prevLine = monthly.prev.map((d) => d[INF_CAT])
  const lyLine = monthly.lastYear.map((d) => d[INF_CAT])

  // 선택 날짜 → 표시 건수 배분 계수 (증가배수/경보는 주간 기준이라 영향 없음)
  const mult = selDay != null ? (monthly.curFactors[selDay] ?? 0) / 5 : 1
  const dayLabel = selDay != null ? `${monthly.labels[selDay]}일` : '주간'
  const dayCount = (weekly: number) => Math.round(weekly * mult)

  const weekTotal = schoolSigs.reduce((a, x) => a + dayCount(x.count), 0)
  const regionMax = Math.max(1, ...regions.map((r) => r.count))

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="sec-label">
          <i className="ti ti-alert-triangle" style={{ verticalAlign: -2 }} aria-hidden="true" /> 이상 신호 · 감염병 모니터링{' '}
          <span className="muted-inline">· 평소(baseline) 대비 급증 조기탐지</span>
        </div>
        <button className="btn ghost small" onClick={() => setShowCfg((v) => !v)}>
          <i className="ti ti-settings" aria-hidden="true" /> 임계치
        </button>
      </div>

      {showCfg && (
        <div className="cfg-box">
          <div className="cfg-row">
            <span>경보 — 평소 대비 증가배수</span>
            <span>
              <input
                type="number"
                step="0.1"
                className="th-input"
                value={params.excessAlert}
                onChange={(e) => setThreshold('inf_excess_alert', Number(e.target.value))}
              />{' '}
              배 이상
            </span>
          </div>
          <div className="cfg-row">
            <span>주의 — 평소 대비 증가배수</span>
            <span>
              <input
                type="number"
                step="0.1"
                className="th-input"
                value={params.excessWatch}
                onChange={(e) => setThreshold('inf_excess_watch', Number(e.target.value))}
              />{' '}
              배 이상
            </span>
          </div>
          <div className="cfg-row">
            <span>학교 최소 건수(노이즈 차단)</span>
            <span>
              <input
                type="number"
                className="th-input"
                value={params.minCount}
                onChange={(e) => setThreshold('inf_min', Number(e.target.value))}
              />{' '}
              건/주 이상
            </span>
          </div>
          <div className="cfg-row">
            <span>지역 최소 건수</span>
            <span>
              <input
                type="number"
                className="th-input"
                value={params.regionMinCount}
                onChange={(e) => setThreshold('inf_region_min', Number(e.target.value))}
              />{' '}
              건/주 이상
            </span>
          </div>
          <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
            고정 합계가 아니라 <b>평소 대비 증가배수</b>로 판정합니다. 설정은 이 브라우저에 저장됩니다.
          </p>
        </div>
      )}

      {/* 증후군별 조기신호 */}
      <div className="sub-label">
        증후군별 조기신호 <span className="muted-inline">· 확진 전 증상 단위 · 평소 대비 배수</span>
      </div>
      <div className="synd-grid" style={{ marginBottom: 14 }}>
        {syndromes.map((sy) => (
          <div key={sy.key} className="synd-cell" style={{ borderColor: LEVEL_COLOR[sy.level] }}>
            <div className="synd-top">
              <span className="synd-name">{sy.name}</span>
              {sy.level !== 'normal' && (
                <span className="synd-tag" style={{ background: LEVEL_COLOR[sy.level] }}>
                  {LEVEL_LABEL[sy.level]}
                </span>
              )}
            </div>
            <div className="synd-x" style={{ color: LEVEL_COLOR[sy.level] }}>{fmtX(sy.excess)}</div>
            <div className="synd-sub">
              {sy.count}건 <span className="muted-inline">(평소 {sy.base})</span>
            </div>
            <div className="synd-hint">{sy.hint}</div>
          </div>
        ))}
      </div>

      {/* 감염병 지역 확산 경보 */}
      <div className="sub-label">감염병 지역 확산 경보 <span className="muted-inline">· 같은 구 동시 상승(공간 군집)</span></div>
      {alertRegions.length === 0 ? (
        <div className="dz-item ok" style={{ marginBottom: 12 }}>
          <i className="ti ti-circle-check" aria-hidden="true" />
          <span>평소 대비 비정상 상승 지역이 없습니다.</span>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {alertRegions.map((r) => (
            <div key={r.region} className="alert-box" style={{ marginBottom: 6 }}>
              <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: LEVEL_COLOR[r.level] }} />
              <div>
                <div className="alert-title">
                  {r.region} 감염병 {LEVEL_LABEL[r.level]} · 평소 {fmtX(r.excess)}
                </div>
                <div className="alert-sub">
                  감염병 {r.count}건 (평소 {r.base}건 · {r.schools}개교) — 역학 확인·예방 안내 권고
                </div>
              </div>
              <button
                className="btn small"
                style={{ marginLeft: 'auto' }}
                onClick={() =>
                  openCompose({
                    title: `[감염병 ${LEVEL_LABEL[r.level]}] ${r.region}`,
                    body: `${r.region} 관내 감염병 의심 ${r.count}건(평소 대비 ${fmtX(r.excess)}) 확인. 손씻기·환기 등 예방수칙 준수 및 의심 증상 시 등교중지 협조 바랍니다.`,
                    region: r.region,
                  })
                }
              >
                {r.region} 공지 발송
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 학교 경보 */}
      <div className="sub-label">학교 경보 <span className="muted-inline">· 평소 대비 급증 + 율(재학생 1000명당)</span></div>
      {alertSchools.length === 0 ? (
        <div className="dz-item ok" style={{ marginBottom: 14 }}>
          <i className="ti ti-circle-check" aria-hidden="true" />
          <span>경보 수준 학교가 없습니다.</span>
        </div>
      ) : (
        <div className="alert-list" style={{ marginBottom: 14 }}>
          {alertSchools.slice(0, 8).map((x) => (
            <div key={x.school.id} className="alert-box">
              <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: LEVEL_COLOR[x.level] }} />
              <div>
                <div className="alert-title">
                  {x.school.region} · {x.school.name}
                  <span className="inf-tag" style={{ background: LEVEL_COLOR[x.level] }}>{LEVEL_LABEL[x.level]}</span>
                </div>
                <div className="alert-sub">
                  감염병 {x.count}건 · 평소 {fmtX(x.excess)} · {x.rate.toFixed(1)}건/천명
                  {x.school.anomaly ? ` — ${x.school.anomaly}` : ''}
                </div>
              </div>
              <button
                className="btn small"
                style={{ marginLeft: 'auto' }}
                onClick={() =>
                  openCompose({
                    title: `[예방] ${x.school.name} 감염병 ${LEVEL_LABEL[x.level]}`,
                    body: `${x.school.name} — 감염병 의심 ${x.count}건(평소 대비 ${fmtX(x.excess)}). 예방수칙 안내 및 확인 협조 바랍니다.`,
                    region: x.school.region,
                    school: x.school.name,
                  })
                }
              >
                공지 발송
              </button>
            </div>
          ))}
        </div>
      )}

      {/* KPI */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-label">감염병 방문({dayLabel})</div>
          <div className="kpi-val">{weekTotal.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">발생 지역</div>
          <div className="kpi-val">{regions.length}곳</div>
        </div>
        <div className={`kpi ${alertRegions.length ? 'warn' : ''}`}>
          <div className="kpi-label">확산 주의 지역</div>
          <div className="kpi-val">{alertRegions.length}곳</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">최다 증가 지역</div>
          <div className="kpi-val sm">{regions[0] ? `${regions[0].region} ${fmtX(regions[0].excess)}` : '-'}</div>
        </div>
      </div>

      {/* 감염병 추이 */}
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="sub-label">감염병 추이 <span className="muted-inline">· 이번 달/전월/전년 동월 · 날짜 클릭 시 건수 연동</span></div>
        {selDay != null && (
          <button className="btn ghost small" onClick={() => setSelDay(null)}>
            <i className="ti ti-x" aria-hidden="true" /> {dayLabel} 해제
          </button>
        )}
      </div>
      <TrendChart
        labels={monthly.labels}
        lines={[
          { name: '이번 달', color: '#a32d2d', values: curLine },
          { name: '전월', color: '#888780', values: prevLine, dashed: true },
          { name: '전년 동월', color: '#0f6e56', values: lyLine, dashed: true },
        ]}
        selected={selDay}
        onSelect={(i) => setSelDay((prev) => (prev === i ? null : i))}
      />

      {/* 지역별 감염병 */}
      <div className="sub-label" style={{ marginTop: 12 }}>지역별 감염병 현황 <span className="muted-inline">· 평소 대비 배수 표시</span></div>
      {regions.length === 0 ? (
        <div className="col-empty">감염병 발생이 없어요.</div>
      ) : (
        <div className="bars" style={{ marginBottom: 14 }}>
          {regions.slice(0, 6).map((r) => (
            <div key={r.region} className={`bar-row ${r.level === 'alert' ? 'hl-danger' : ''}`}>
              <span className="bar-label">{r.region}</span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{ width: `${(dayCount(r.count) / regionMax) * 100}%`, background: LEVEL_COLOR[r.level] }}
                />
              </span>
              <span className="bar-val">
                {dayCount(r.count)}
                {r.level !== 'normal' && <span className="muted-inline"> · {fmtX(r.excess)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 감염병 상위 학교 */}
      <div className="sub-label">감염병 상위 학교 <span className="muted-inline">· 증가배수 순</span></div>
      {schoolSigs.length === 0 ? (
        <div className="col-empty">해당 학교가 없어요.</div>
      ) : (
        <div className="inf-schools">
          {schoolSigs.slice(0, 6).map((x) => (
            <div key={x.school.id} className={`inf-school ${x.level === 'alert' ? 'over' : ''}`}>
              <span>
                {x.school.name} <span className="muted-inline">· {x.school.region}</span>
                {x.level !== 'normal' && (
                  <span className="inf-tag" style={{ background: LEVEL_COLOR[x.level] }}>{LEVEL_LABEL[x.level]}</span>
                )}
              </span>
              <span className="inf-count">
                {dayCount(x.count)}건 <span className="muted-inline">{fmtX(x.excess)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
