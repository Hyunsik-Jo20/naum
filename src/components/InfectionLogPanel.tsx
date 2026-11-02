// 감염병 현황 — 보건 일일업무 기록 창에 끼워 넣는 패널(새 페이지 없음).
//  상단: 발생 추이 세로막대(주별/월별 · 병명 필터)  ① 보건실 방문 원클릭 등재
//  ② 명부 빠른 수기 추가(복귀일 자동)  ③ 진행 중 사례 목록  ④ 관리대장 엑셀.
//  (교육청용 InfectionPanel.tsx — 집계 모니터링 — 과는 별개 화면이다.)
import { useMemo, useState, type CSSProperties } from 'react'
import { useVisits } from '../store/visits'
import { roster } from '../data/localRoster'
import { classLabel } from '../data/mock'
import { dailyKey } from '../data/dailyLog'
import { downloadExcelX } from '../data/excel'
import {
  addCase, loadCases, removeCase, updateCase, estReturn, ruleFor, isActiveOn,
  hasActiveFor, infectionSheets, DISEASE_PRESETS, type InfStatus,
} from '../data/infectionRegister'
import type { Student } from '../types'

const STATUSES: InfStatus[] = ['의심', '확진', '복귀']
const INF_COLORS = ['#ea580c', '#2563eb', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#d97706', '#db2777', '#65a30d', '#475569']

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export default function InfectionLogPanel({ date }: { date: Date }) {
  const { visits, studentOf } = useVisits()
  const ymd = dailyKey(date)
  const [tick, setTick] = useState(0)
  const reload = () => setTick((t) => t + 1)
  const cases = useMemo(() => loadCases(), [tick])

  const [showAll, setShowAll] = useState(false)
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week')
  const [metric, setMetric] = useState<'incidence' | 'active'>('active')
  const [dz, setDz] = useState('전체')

  // 빠른 추가 폼
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<Student | null>(null)
  const [disease, setDisease] = useState('')
  const [onset, setOnset] = useState(ymd)
  const [status, setStatus] = useState<InfStatus>('확진')

  const diseaseOpts = useMemo(
    () => ['전체', ...Array.from(new Set(cases.map((c) => c.disease)))],
    [cases],
  )

  // 병명별 색상
  const diseases = useMemo(() => Array.from(new Set(cases.map((c) => c.disease))), [cases])
  const colorOf = (d: string) => INF_COLORS[Math.max(0, diseases.indexOf(d)) % INF_COLORS.length]

  // 발생 추이 — 최근 N개 버킷(주/월). 신규발생=발병일 1회 / 진행=발병~복귀 하루전까지 매 기간 집계.
  const chart = useMemo(() => {
    const N = period === 'month' ? 6 : period === 'day' ? 14 : 8
    const now = new Date()
    const buckets: { key: string; label: string; start: string; end: string }[] = []
    if (period === 'month') {
      for (let i = N - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const y = d.getFullYear(); const mm = String(d.getMonth() + 1).padStart(2, '0')
        const last = new Date(y, d.getMonth() + 1, 0).getDate()
        buckets.push({ key: `${y}-${mm}`, label: `${d.getMonth() + 1}월`, start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` })
      }
    } else if (period === 'day') {
      for (let i = N - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i); const k = dailyKey(d)
        buckets.push({ key: k, label: `${d.getMonth() + 1}/${d.getDate()}`, start: k, end: k })
      }
    } else {
      const mon = mondayOf(now)
      for (let i = N - 1; i >= 0; i--) {
        const d = new Date(mon); d.setDate(d.getDate() - i * 7)
        const e = new Date(d); e.setDate(e.getDate() + 6)
        buckets.push({ key: dailyKey(d), label: `${d.getMonth() + 1}/${d.getDate()}`, start: dailyKey(d), end: dailyKey(e) })
      }
    }
    const dayBefore = (ymd: string) => { const d = parseYmd(ymd); d.setDate(d.getDate() - 1); return dailyKey(d) }
    const hit = (c: (typeof cases)[number], b: (typeof buckets)[number]) => {
      if (metric === 'incidence') {
        const k = period === 'month' ? c.onset.slice(0, 7) : period === 'day' ? c.onset : dailyKey(mondayOf(parseYmd(c.onset)))
        return k === b.key
      }
      const aEnd = c.until ? dayBefore(c.until) : c.onset // 발병 ~ 복귀 하루 전
      return c.onset <= b.end && aEnd >= b.start // 기간과 겹치면 '진행'으로 집계
    }
    const relevant = dz === '전체' ? diseases : [dz]
    return buckets.map((b) => {
      const segs = relevant
        .map((d) => ({ disease: d, count: cases.filter((c) => c.disease === d && hit(c, b)).length, color: colorOf(d) }))
        .filter((s) => s.count > 0)
      return { key: b.key, label: b.label, segs, total: segs.reduce((a, s) => a + s.count, 0) }
    })
  }, [cases, period, dz, diseases, metric])
  const chartMax = Math.max(1, ...chart.map((b) => b.total))

  const matches = useMemo(() => {
    const t = q.trim()
    if (!t || chosen) return []
    return roster
      .filter((s) => s.name.includes(t) || classLabel(s).includes(t) || String(s.number) === t || `${s.grade}-${s.classNo}`.includes(t))
      .slice(0, 6)
  }, [q, chosen])

  // 그날 보건실 방문 중 감염병 → 등재 제안(진행 중 사례 없는 학생만)
  const suggest = useMemo(() => {
    const out: { id: string; name: string; cls: string; sex: string; disease: string; studentId: string; onset: string }[] = []
    for (const v of visits) {
      const d = new Date(v.treatedAt ?? v.createdAt)
      if (dailyKey(d) !== ymd) continue
      const prim = v.diseases.find((x) => ruleFor(x.name)) ?? v.diseases.find((x) => x.category === '감염병') ?? null
      if (!prim) continue
      const s = studentOf(v.id)
      if (!s || hasActiveFor(s.id, ymd)) continue
      if (out.some((o) => o.studentId === s.id)) continue
      out.push({ id: v.id, name: s.name, cls: classLabel(s), sex: s.sex, disease: prim.name, studentId: s.id, onset: ymd })
    }
    return out
  }, [visits, studentOf, ymd, tick])

  const active = useMemo(() => {
    const list = showAll ? cases : cases.filter((c) => isActiveOn(c, ymd))
    return [...list].sort((a, b) => (a.onset < b.onset ? 1 : -1))
  }, [cases, showAll, ymd])

  const stat = useMemo(() => ({
    active: cases.filter((c) => isActiveOn(c, ymd)).length,
    newToday: cases.filter((c) => c.onset === ymd && c.status !== '복귀').length,
  }), [cases, ymd])

  function pick(s: Student) { setChosen(s); setQ('') }

  function add() {
    if (!chosen) { alert('학생을 먼저 선택하세요.'); return }
    if (!disease.trim()) { alert('병명을 입력하세요.'); return }
    addCase({
      studentId: chosen.id, name: chosen.name, cls: classLabel(chosen), sex: chosen.sex,
      disease: disease.trim(), onset, until: estReturn(disease.trim(), onset), status, source: '수기',
    })
    setChosen(null); setDisease(''); setOnset(ymd); setStatus('확진'); reload()
  }

  function registerFromVisit(s: typeof suggest[number]) {
    addCase({
      studentId: s.studentId, name: s.name, cls: s.cls, sex: s.sex,
      disease: s.disease, onset: s.onset, until: estReturn(s.disease, s.onset), status: '확진', source: '보건실',
    })
    reload()
  }

  function exportExcel() {
    downloadExcelX(`감염병관리대장_${ymd}`, infectionSheets(cases, ymd))
  }

  const card: CSSProperties = { marginTop: 16, border: '1px solid rgba(249,115,22,.45)', borderRadius: 12, padding: '14px 16px', background: 'rgba(249,115,22,.09)' }
  const seg = (on: boolean): CSSProperties => ({ padding: '3px 12px', fontSize: 12, borderRadius: 7, cursor: 'pointer', border: '1px solid ' + (on ? '#ea580c' : 'var(--line)'), background: on ? '#ea580c' : 'transparent', color: on ? '#fff' : 'var(--text-2)', fontWeight: on ? 700 : 500 })
  const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', color: 'var(--text-2)', fontWeight: 600, fontSize: 12, borderBottom: '1px solid var(--line)' }
  const td: CSSProperties = { padding: '5px 8px', fontSize: 13, borderBottom: '1px solid var(--line)', verticalAlign: 'middle' }

  return (
    <div style={card}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="sec-label" style={{ margin: 0 }}>
          <i className="ti ti-virus" style={{ verticalAlign: -2, marginRight: 4, color: 'var(--danger)' }} aria-hidden="true" />
          감염병 현황
          <span className="muted-inline" style={{ marginLeft: 8, fontSize: 12 }}>진행 {stat.active}명 · 오늘 신규 {stat.newToday}명</span>
        </div>
        <button className="btn ghost small" onClick={exportExcel} title="감염병 관리대장을 엑셀로 내보냅니다">
          <i className="ti ti-file-spreadsheet" aria-hidden="true" /> 관리대장 엑셀
        </button>
      </div>

      {/* 발생 추이 대시보드 */}
      <div style={{ border: '1px solid rgba(249,115,22,.25)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: 'rgba(255,255,255,.75)' }}>
        <div className="row between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <b style={{ fontSize: 13 }}>발생 추이 <span className="muted-inline" style={{ fontSize: 11 }}>· {dz === '전체' ? '전체 감염병' : dz} · {metric === 'active' ? '진행(등교중지) 기준' : '신규 발생(발병일) 기준'}</span></b>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 4 }}>
              <button style={seg(metric === 'active')} onClick={() => setMetric('active')} title="발병~복귀 하루 전까지 매 기간 집계">진행</button>
              <button style={seg(metric === 'incidence')} onClick={() => setMetric('incidence')} title="발병일에만 집계(신규 발생)">신규발생</button>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button style={seg(period === 'day')} onClick={() => setPeriod('day')}>일별</button>
              <button style={seg(period === 'week')} onClick={() => setPeriod('week')}>주별</button>
              <button style={seg(period === 'month')} onClick={() => setPeriod('month')}>월별</button>
            </div>
            <select value={dz} onChange={(e) => setDz(e.target.value)} style={{ fontSize: 12, padding: '3px 6px' }}>
              {diseaseOpts.map((d) => <option key={d} value={d}>{d === '전체' ? '전체 감염병' : d}</option>)}
            </select>
          </div>
        </div>
        {dz === '전체' && diseases.length > 0 && (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            {diseases.map((d) => (
              <span key={d} className="muted" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(d), display: 'inline-block' }} aria-hidden="true" />{d}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 128 }}>
          {chart.map((b) => (
            <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ fontSize: 11, color: b.segs.length > 1 ? 'var(--text)' : 'transparent', fontWeight: 700, marginBottom: 2 }}>{b.segs.length > 1 ? b.total : ''}</div>
              <div style={{ width: '74%', maxWidth: 36, height: `${(b.total / chartMax) * 96}px`, borderRadius: '5px 5px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'height .2s' }}>
                {b.segs.map((s) => (
                  <div key={s.disease} title={`${s.disease} ${s.count}명`} style={{ height: `${(s.count / Math.max(b.total, 1)) * 100}%`, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10.5, fontWeight: 700, lineHeight: 1, overflow: 'hidden' }}>
                    {s.count}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 4, whiteSpace: 'nowrap' }}>{b.label}</div>
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>세로축 = {metric === 'active' ? '진행(등교중지) 인원' : '신규 발생 건수'} · 가로축 = {period === 'day' ? '일(최근 14일)' : period === 'week' ? '주(월요일 시작)' : '월'}{metric === 'active' ? ' · 발병~복귀 하루 전까지 집계' : ''}</div>
      </div>

      {/* 보건실 방문 자동 등재 제안 */}
      {suggest.length > 0 && (
        <div style={{ background: 'var(--surface-2, #f4f6fb)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 6 }}>오늘 보건실 방문(감염병):</span>
          {suggest.map((s) => (
            <button key={s.id} className="btn ghost small" style={{ marginRight: 6, marginTop: 4 }} onClick={() => registerFromVisit(s)}>
              <i className="ti ti-plus" aria-hidden="true" /> {s.name} · {s.disease}
            </button>
          ))}
        </div>
      )}

      {/* 빠른 추가 */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 160px', minWidth: 150 }}>
            {chosen ? (
              <div className="pill" style={{ padding: '6px 10px' }}>
                {classLabel(chosen)} {chosen.name}
                <button className="x" style={{ marginLeft: 6 }} onClick={() => setChosen(null)} aria-label="학생 변경"><i className="ti ti-x" aria-hidden="true" /></button>
              </div>
            ) : (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생 검색 (이름 / 3-1 / 번호)" style={{ width: '100%' }} />
            )}
          </div>
          <input value={disease} onChange={(e) => setDisease(e.target.value)} placeholder="병명" list="inf-dz" style={{ flex: '1 1 120px', minWidth: 110 }} />
          <datalist id="inf-dz">{DISEASE_PRESETS.map((d) => <option key={d} value={d} />)}</datalist>
          <label className="muted" style={{ fontSize: 11 }}>발병일<br />
            <input type="date" value={onset} onChange={(e) => setOnset(e.target.value)} />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value as InfStatus)} style={{ alignSelf: 'flex-end' }}>
            {STATUSES.filter((s) => s !== '복귀').map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn small" style={{ alignSelf: 'flex-end' }} onClick={add}><i className="ti ti-plus" aria-hidden="true" /> 추가</button>
        </div>
        {disease.trim() && ruleFor(disease.trim()) && (
          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
            복귀 예정일 자동: <b>{estReturn(disease.trim(), onset)}</b> · 기준: {ruleFor(disease.trim())!.desc} (수정 가능)
          </div>
        )}
        {matches.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 5, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 2, maxWidth: 260, boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
            {matches.map((s) => (
              <button key={s.id} className="btn ghost" style={{ display: 'block', width: '100%', justifyContent: 'flex-start', borderRadius: 0 }} onClick={() => pick(s)}>
                {classLabel(s)} · {s.number}번 · {s.name} · {s.sex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 목록 */}
      {active.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>
          {showAll ? '등록된 감염병 사례가 없습니다.' : '진행 중인 감염병 사례가 없습니다.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>학년반</th><th style={th}>이름</th><th style={th}>병명</th>
                <th style={th}>발병일</th><th style={th}>복귀예정</th><th style={th}>상태</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {active.map((c) => (
                <tr key={c.id} style={{ opacity: c.status === '복귀' ? 0.55 : 1 }}>
                  <td style={td}>{c.cls}</td>
                  <td style={td}>{c.name}{c.source === '보건실' && <i className="ti ti-stethoscope" title="보건실 방문" style={{ marginLeft: 4, color: 'var(--text-2)' }} aria-hidden="true" />}</td>
                  <td style={td}>{c.disease}</td>
                  <td style={td}>{c.onset.slice(5)}</td>
                  <td style={td}>
                    <input type="date" value={c.until ?? ''} onChange={(e) => { updateCase(c.id, { until: e.target.value }); reload() }} style={{ fontSize: 12, padding: '2px 4px' }} />
                  </td>
                  <td style={td}>
                    <select value={c.status} onChange={(e) => { updateCase(c.id, { status: e.target.value as InfStatus }); reload() }} style={{ fontSize: 12, padding: '2px 4px' }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <button className="x" onClick={() => { if (confirm(`${c.name} · ${c.disease} 사례를 삭제할까요?`)) { removeCase(c.id); reload() } }} aria-label="삭제"><i className="ti ti-trash" aria-hidden="true" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <button className="btn ghost small" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '진행 중만 보기' : `전체 보기 (${cases.length})`}
        </button>
        <span className="muted" style={{ fontSize: 11 }}>복귀일·병명은 보건교사 판단으로 수정하세요. 로컬 저장(PII 비공개).</span>
      </div>
    </div>
  )
}
