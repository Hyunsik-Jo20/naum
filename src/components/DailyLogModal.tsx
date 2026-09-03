// 보건 일일업무 기록 창 — 캘린더에서 날짜를 고르고 보건교육·보건업무·학교행사·기타(비공개)를
//  기록한다. 앞 세 칸은 보건일지 엑셀 출력 시 해당 날짜 상단 칸에 자동 반영, 기타는 미출력.
//  날짜를 옮기면 현재 내용은 자동 저장된다(유실 방지).
import { useMemo, useState } from 'react'
import {
  clearOffRange,
  dailyKey,
  dailyLogOf,
  dailyLogDates,
  offDates,
  saveDailyLog,
  setOffRange,
  type DailyLog,
} from '../data/dailyLog'
import { holidayName } from '../data/holidays'

const MAX = 600
const FIELDS: { key: keyof DailyLog; label: string; hint?: string }[] = [
  { key: 'work', label: '업무 및 학교행사', hint: "보건일지의 '보건업무' 칸에 인쇄돼요." },
  { key: 'edu', label: '보건교육', hint: "보건일지의 '보건교육' 칸에 인쇄돼요." },
  { key: 'memo', label: '기타', hint: '이 메모는 보건일지 출력 시에 나오지 않아요. 보건 선생님만 볼 수 있어요.' },
]

export default function DailyLogModal({ onClose }: { onClose: () => void }) {
  const today = new Date()
  const [sel, setSel] = useState<Date>(today)
  const [month, setMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1))
  const [log, setLog] = useState<DailyLog>(() => dailyLogOf(today))
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const marked = useMemo(() => dailyLogDates(), [savedAt]) // 저장 후 점 갱신

  // 방학·휴업일 지정
  const [offTick, setOffTick] = useState(0)
  const off = useMemo(() => offDates(), [offTick])
  const [offOpen, setOffOpen] = useState(false)
  const [offStart, setOffStart] = useState('')
  const [offEnd, setOffEnd] = useState('')
  const [offLabel, setOffLabel] = useState('방학')
  function parseD(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  }
  function applyOff(clear: boolean) {
    const s = parseD(offStart)
    const e = parseD(offEnd || offStart)
    if (!s || !e) { alert('시작일(과 종료일)을 선택하세요.'); return }
    if (e.getTime() < s.getTime()) { alert('종료일이 시작일보다 빠릅니다.'); return }
    if (clear) {
      const n = clearOffRange(s, e)
      alert(n ? `휴업 지정 ${n}일을 해제했습니다.` : '해당 기간에 지정된 휴업일이 없습니다.')
    } else {
      const label = offLabel.trim() || '휴업일'
      const n = setOffRange(s, e, label)
      alert(`${label} ${n}일을 지정했습니다. 보건일지에서 미운영일로 표시됩니다.`)
    }
    setOffTick((t) => t + 1)
  }

  function setField(key: keyof DailyLog, v: string) {
    setLog((p) => ({ ...p, [key]: v.slice(0, MAX) }))
  }

  function persist(target: Date, data: DailyLog) {
    saveDailyLog(target, data)
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  }

  function pickDate(d: Date) {
    persist(sel, log) // 날짜 이동 전 자동 저장(유실 방지)
    setSel(d)
    setLog(dailyLogOf(d))
  }

  function save(close: boolean) {
    persist(sel, log)
    if (close) onClose()
  }

  // 캘린더 격자
  const weeks = useMemo(() => {
    const y = month.getFullYear()
    const m = month.getMonth()
    const first = new Date(y, m, 1)
    const days: (Date | null)[] = Array(first.getDay()).fill(null)
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) days.push(new Date(y, m, d))
    while (days.length % 7) days.push(null)
    const out: (Date | null)[][] = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [month])

  const selKey = dailyKey(sel)
  const todayKey = dailyKey(today)

  return (
    <div className="modal-overlay" onClick={() => save(true)}>
      <div className="modal dlg-wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-notebook" style={{ verticalAlign: -2 }} aria-hidden="true" /> 보건 일일업무 기록
          </h3>
          <button className="x" onClick={() => save(true)} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        <div className="dl-grid">
          {/* 캘린더 */}
          <div className="dl-cal">
            <div className="dl-cal-head">
              <button className="x" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="이전 달">
                <i className="ti ti-chevron-left" aria-hidden="true" />
              </button>
              <b>{month.getFullYear()}년 {month.getMonth() + 1}월</b>
              <button className="x" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="다음 달">
                <i className="ti ti-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <div className="dl-cal-grid">
              {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                <div key={w} className={`dl-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>
              ))}
              {weeks.flat().map((d, i) => {
                if (!d) return <div key={`e${i}`} />
                const k = dailyKey(d)
                const hol = !!holidayName(d)
                const offName = off[k]
                const tone = hol || d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''
                return (
                  <button
                    key={k}
                    className={`dl-day ${tone} ${offName ? 'off' : ''} ${k === selKey ? 'sel' : ''} ${k === todayKey ? 'today' : ''}`}
                    onClick={() => pickDate(d)}
                    title={holidayName(d) ?? (offName ? `휴업 · ${offName}` : undefined)}
                  >
                    {d.getDate()}
                    {marked.has(k) && <span className="dl-dot" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '10px 2px 0' }}>
              보건업무·학교행사와 보건교육은 <b>보건일지 엑셀 출력 시 해당 날짜 상단 칸</b>에 자동으로 들어가요.
              날짜를 옮기면 쓰던 내용은 자동 저장됩니다.
            </p>

            {/* 방학·휴업일 지정 */}
            <button className="btn ghost small" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => setOffOpen((v) => !v)}>
              <i className={`ti ${offOpen ? 'ti-chevron-up' : 'ti-calendar-off'}`} aria-hidden="true" /> 방학·휴업일 지정
            </button>
            {offOpen && (
              <div className="dl-off">
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <label className="login-field" style={{ flex: 1, minWidth: 118 }}>시작일
                    <input type="date" value={offStart} onChange={(e) => setOffStart(e.target.value)} />
                  </label>
                  <label className="login-field" style={{ flex: 1, minWidth: 118 }}>종료일(생략=하루)
                    <input type="date" value={offEnd} onChange={(e) => setOffEnd(e.target.value)} />
                  </label>
                </div>
                <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <label className="login-field" style={{ flex: 1, minWidth: 110 }}>명칭
                    <input value={offLabel} placeholder="예: 여름방학, 재량휴업일" onChange={(e) => setOffLabel(e.target.value)} list="dl-off-presets" />
                  </label>
                  <datalist id="dl-off-presets">
                    <option value="여름방학" /><option value="겨울방학" /><option value="봄방학" />
                    <option value="재량휴업일" /><option value="개교기념일" /><option value="단기방학" />
                  </datalist>
                  <button className="btn small" style={{ alignSelf: 'flex-end' }} onClick={() => applyOff(false)}>지정</button>
                  <button className="btn ghost small" style={{ alignSelf: 'flex-end' }} onClick={() => applyOff(true)}>해제</button>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: '6px 0 0', lineHeight: 1.5 }}>
                  지정한 날은 달력에 빗금으로 표시되고, 보건일지에는 날짜 옆에 명칭이 붙으며 미운영일로 처리됩니다.
                </p>
              </div>
            )}
          </div>

          {/* 입력 칸 */}
          <div className="dl-fields">
            <div className="sec-label" style={{ marginBottom: 2 }}>
              {sel.getMonth() + 1}월 {sel.getDate()}일 ({['일', '월', '화', '수', '목', '금', '토'][sel.getDay()]})
              {holidayName(sel) && <span className="muted-inline"> · {holidayName(sel)}</span>}
              {off[selKey] && <span className="muted-inline" style={{ color: 'var(--danger)' }}> · {off[selKey]}</span>}
              {savedAt && <span className="muted-inline" style={{ float: 'right' }}>저장됨 {savedAt}</span>}
            </div>
            {FIELDS.map((f) => (
              <div key={f.key} className="dl-field">
                <div className="row between" style={{ marginBottom: 4 }}>
                  <b style={{ fontSize: 14 }}>{f.label}</b>
                  <span className="muted-inline" style={{ fontSize: 11 }}>{(log[f.key] ?? '').length}/{MAX}</span>
                </div>
                <textarea
                  value={log[f.key] ?? ''}
                  placeholder="내용을 입력해주세요."
                  onChange={(e) => setField(f.key, e.target.value)}
                  rows={f.key === 'memo' ? 2 : 3}
                />
                {f.hint && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{f.hint}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>닫기</button>
          <button className="btn" onClick={() => save(false)}><i className="ti ti-device-floppy" aria-hidden="true" /> 저장</button>
          <button className="btn primary" onClick={() => save(true)}><i className="ti ti-check" aria-hidden="true" /> 저장 후 닫기</button>
        </div>
      </div>
    </div>
  )
}
