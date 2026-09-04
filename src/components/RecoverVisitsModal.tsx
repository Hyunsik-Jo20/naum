// 잃어버린 접수 찾기 — 접수 순간 담임 알림용으로 남은 암호화 릴레이(relay_class_inbox)를
//  전 학급 키로 복호해, 오늘 접수 이벤트 중 현재 방문 목록에 없는 학생을 찾아 복원한다.
//  (업로드 실패로 유실된 접수의 복구 경로. 페이로드에 반·번호·증상·시각이 남는다)
//  복원은 당시 시각의 '완료(교실 복귀)' 방문으로 추가되며 알림은 재발송되지 않는다.
import { useEffect, useState } from 'react'
import { roster } from '../data/localRoster'
import { symptomTiles } from '../data/mock'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import { loadClassEvents } from '../api/supabaseRelay'
import { useVisits } from '../store/visits'
import type { Student } from '../types'

interface Candidate {
  student: Student
  ts: number
  sym: string
  tileIds: string[]
  checked: boolean
}

function hhmm(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function RecoverVisitsModal({ onClose }: { onClose: () => void }) {
  const { visits, studentOf, restoreVisit } = useVisits()
  const [scanning, setScanning] = useState(true)
  const [progress, setProgress] = useState('')
  const [cands, setCands] = useState<Candidate[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!SUPABASE_ENABLED) { setErr('클라우드 모드에서만 사용할 수 있습니다.'); setScanning(false); return }
      if (roster.length === 0) { setErr('이 기기에 학생 명부가 없습니다. 명부 관리에서 먼저 업로드하세요.'); setScanning(false); return }
      try {
        const t0 = new Date(); t0.setHours(0, 0, 0, 0)
        // 오늘 방문에 이미 있는 학생(학년-반-번호) — 이름 복원된 것 기준
        const have = new Set<string>()
        for (const v of visits) {
          if (v.createdAt < t0.getTime() || v.isStaff) continue
          const s = studentOf(v.id)
          if (s) have.add(`${s.grade}-${s.classNo}-${s.number}`)
        }
        const classes = [...new Map(roster.map((s) => [`${s.grade}-${s.classNo}`, { grade: s.grade, classNo: s.classNo }])).values()]
        const found: Candidate[] = []
        for (let i = 0; i < classes.length; i++) {
          const c = classes[i]
          if (!alive) return
          setProgress(`${c.grade}-${c.classNo} 확인 중… (${i + 1}/${classes.length})`)
          const evs = await loadClassEvents(c.grade, c.classNo).catch(() => [])
          const seenNo = new Set<number>()
          for (const e of evs) {
            const p = e.payload as { kind?: string; sym?: string; number?: number } | null
            if (!p || p.kind !== '접수' || e.ts < t0.getTime() || typeof p.number !== 'number') continue
            if (seenNo.has(p.number)) continue
            seenNo.add(p.number)
            const key = `${c.grade}-${c.classNo}-${p.number}`
            if (have.has(key)) continue
            const st = roster.find((s) => s.grade === c.grade && s.classNo === c.classNo && s.number === p.number)
            if (!st) continue
            const sym = p.sym ?? ''
            const tileIds = sym
              .split(' · ')
              .map((label) => symptomTiles.find((t) => t.label === label)?.id)
              .filter((x): x is string => !!x)
            found.push({ student: st, ts: e.ts, sym, tileIds, checked: true })
          }
        }
        if (!alive) return
        found.sort((a, b) => a.ts - b.ts)
        setCands(found)
      } catch (e) {
        if (alive) setErr(`검색 실패: ${e instanceof Error ? e.message : '오류'}`)
      } finally {
        if (alive) setScanning(false)
      }
    })()
    return () => { alive = false }
    // 스캔은 열릴 때 1회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const picked = cands.filter((c) => c.checked)

  function restore() {
    if (picked.length === 0) return
    if (!confirm(`${picked.length}건을 접수 당시 시각의 '완료(교실 복귀)' 기록으로 복원할까요?\n(알림은 다시 발송되지 않습니다. 병명·처치는 사후 보완으로 입력)`)) return
    picked.forEach((c) => restoreVisit(c.student, c.tileIds, c.ts))
    alert(`${picked.length}건을 복원했습니다. 완료 목록에서 확인하세요.`)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-zoom-question" style={{ verticalAlign: -2 }} aria-hidden="true" /> 잃어버린 접수 찾기 (오늘)
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
          접수 순간 담임 알림용으로 남은 암호화 기록을 되짚어, <b>오늘 접수했지만 현재 목록에 없는 학생</b>을
          찾습니다. (담임 알림이 꺼져 있던 접수는 흔적이 없어 찾을 수 없습니다)
        </p>

        {scanning ? (
          <div className="col-empty"><i className="ti ti-loader-2" aria-hidden="true" /> {progress || '검색 중…'}</div>
        ) : err ? (
          <div className="admin-err">{err}</div>
        ) : cands.length === 0 ? (
          <div className="col-empty">복원할 유실 접수를 찾지 못했습니다. (모든 접수가 목록에 있음)</div>
        ) : (
          <>
            <div style={{ maxHeight: '44vh', overflowY: 'auto', marginBottom: 12 }}>
              {cands.map((c, i) => (
                <label key={`${c.student.id}-${c.ts}`} className="row" style={{ gap: 8, alignItems: 'center', padding: '7px 4px', borderBottom: '1px dashed var(--border)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={() => setCands((p) => p.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
                  />
                  <span className="muted-inline" style={{ width: 44 }}>{hhmm(c.ts)}</span>
                  <b>{c.student.name}</b>
                  <span className="muted-inline">{c.student.grade}-{c.student.classNo} · {c.student.number}번</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}>{c.sym || '—'}</span>
                </label>
              ))}
            </div>
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={picked.length === 0} onClick={restore}>
              <i className="ti ti-restore" aria-hidden="true" /> 선택한 {picked.length}건 복원 (완료·교실 복귀로 추가)
            </button>
          </>
        )}
      </div>
    </div>
  )
}
