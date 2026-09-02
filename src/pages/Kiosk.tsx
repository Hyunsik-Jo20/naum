import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  classes,
  classLabel,
  students,
  studentsInClass,
  symptomTiles,
} from '../data/mock'
import { useVisits } from '../store/visits'
import { SUPABASE_ENABLED } from '../data/supabaseClient'
import { hasSchool } from '../data/school'
import { sendNurseRequest } from '../data/nurseRequest'
import { syncSymptomsFromCloud } from '../data/symptomsSync'
import { listenOnce, matchSymptomTiles, type VoiceOutcome } from '../data/voiceSymptom'
import type { Student } from '../types'

type Step = 'id' | 'symptom' | 'done'

// 키오스크 화면 배율 — 태블릿에는 브라우저 확대/축소가 없어 앱에서 직접 조절(기기별 저장).
const ZOOM_LS = 'naum.kiosk.zoom'
function loadZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_LS))
    if (z >= 0.6 && z <= 1.6) return z
  } catch { /* ignore */ }
  return 1
}

export default function Kiosk() {
  const { addVisit } = useVisits()
  const [step, setStep] = useState<Step>('id')
  const [zoom, setZoom] = useState<number>(loadZoom)

  function adjustZoom(delta: number) {
    setZoom((z) => {
      const next = Math.round(Math.min(1.6, Math.max(0.6, z + delta)) * 10) / 10
      try { localStorage.setItem(ZOOM_LS, String(next)) } catch { /* ignore */ }
      return next
    })
  }
  const [student, setStudent] = useState<Student | null>(null)
  const [pickedClass, setPickedClass] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [ticket, setTicket] = useState<number>(0)
  const [byQr, setByQr] = useState(false)
  const visualStep = step === 'symptom' ? 'symptom' : step === 'id' && pickedClass ? 'roster' : 'welcome'

  // 콘솔에서 편집한 증상 목록을 키오스크가 상시 반영 — 대기(환영) 화면에 있을 때만
  //  클라우드와 비교해, 바뀌었으면 새로고침(접수 진행 중에는 건드리지 않음).
  useEffect(() => {
    if (visualStep !== 'welcome') return
    void syncSymptomsFromCloud().then((changed) => {
      if (changed) window.location.reload()
    })
  }, [visualStep])

  function reset() {
    setStep('id')
    setStudent(null)
    setPickedClass(null)
    setSelected([])
    setTicket(0)
    setByQr(false)
  }

  function chooseStudent(s: Student, viaQr: boolean) {
    setStudent(s)
    setByQr(viaQr)
    setStep('symptom')
  }

  function simulateQr() {
    // 실제로는 QR(로컬 난수 ID)을 스캔 → 로컬에서 학생으로 해석
    if (students.length === 0) return // 명부 없음(실학교 미업로드)
    const s = students[Math.floor(Math.random() * students.length)]
    chooseStudent(s, true)
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // 음성 인식 결과 — 이미 고른 것 위에 추가(중복 제거)
  function pickMany(ids: string[]) {
    setSelected((prev) => [...new Set([...prev, ...ids])])
  }

  function confirmSymptoms() {
    if (selected.length === 0 || !student) return
    const v = addVisit(student, selected)
    setTicket(v.ticket)
    setStep('done')
  }

  return (
    <div className={`kiosk kiosk-${visualStep}`} style={{ zoom }}>
      <div className="kiosk-topbar">
        <Link to="/" className="btn ghost kiosk-exit">
          <i className="ti ti-arrow-left" aria-hidden="true" /> 나가기
        </Link>
        <div className="kiosk-brand" aria-label="보건실 키오스크">
          <span className="kiosk-brand-icon" aria-hidden="true">
            <i className="ti ti-heart-handshake" />
          </span>
          <span>
            <strong>보건실 키오스크</strong>
            <small>천천히 골라도 괜찮아요</small>
          </span>
        </div>
        <div className="kiosk-topbar-right">
          <div className="kiosk-zoom" aria-label="화면 크기 조절">
            <button onClick={() => adjustZoom(-0.1)} aria-label="화면 축소" disabled={zoom <= 0.6}>
              <i className="ti ti-minus" aria-hidden="true" />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => adjustZoom(0.1)} aria-label="화면 확대" disabled={zoom >= 1.6}>
              <i className="ti ti-plus" aria-hidden="true" />
            </button>
          </div>
          <span className="kiosk-calm-tag">
            <i className="ti ti-sparkles" aria-hidden="true" /> 편안하게 알려 주세요
          </span>
        </div>
      </div>

      {/* 멀티테넌트: 이 기기에 학교가 아직 바인딩되지 않음(보건교사 로그인 1회 필요) — 접수는 막지 않되 데모로 기록됨을 안내 */}
      {SUPABASE_ENABLED && !hasSchool() && (
        <div className="route-note" style={{ margin: '0 auto 12px', maxWidth: 720 }}>
          <i className="ti ti-school" aria-hidden="true" /> 이 기기는 아직 학교에 연결되지 않았습니다.
          이 브라우저에서 <b>보건교사 로그인</b>을 1회 하면 우리 학교로 연결됩니다. (지금 접수하면 데모 학교로 기록)
        </div>
      )}

      {/* 실학교 미업로드: 명부가 없으면 접수 불가 — 데모 학생이 실학교 화면에 나오면 안 됨 */}
      {students.length === 0 ? (
        <div className="kiosk-card" style={{ textAlign: 'center' }}>
          <div className="kiosk-eyebrow">
            <i className="ti ti-clipboard-list" aria-hidden="true" /> 준비 중이에요
          </div>
          <p className="kiosk-q">아직 학생 명부가 없어요</p>
          <p className="kiosk-sub">
            보건 선생님이 <b>명부 관리</b>에서 우리 학교 학생 명부(엑셀/CSV)를 올리면,
            <br />이 화면에 우리 학교 학년·반이 자동으로 표시됩니다.
          </p>
        </div>
      ) : step === 'id' && (
        <IdStep
          pickedClass={pickedClass}
          onQr={simulateQr}
          onPickClass={setPickedClass}
          onBack={() => setPickedClass(null)}
          onPickStudent={(s) => chooseStudent(s, false)}
        />
      )}

      {step === 'symptom' && student && (
        <SymptomStep
          student={student}
          byQr={byQr}
          selected={selected}
          onToggle={toggle}
          onPickMany={pickMany}
          onConfirm={confirmSymptoms}
        />
      )}

      {step === 'done' && student && (
        <DoneStep
          student={student}
          ticket={ticket}
          selected={selected}
          onReset={reset}
        />
      )}
    </div>
  )
}

function IdStep({
  pickedClass,
  onQr,
  onPickClass,
  onBack,
  onPickStudent,
}: {
  pickedClass: string | null
  onQr: () => void
  onPickClass: (c: string) => void
  onBack: () => void
  onPickStudent: (s: Student) => void
}) {
  return (
    <div className="kiosk-card">
      <div className="kiosk-eyebrow">
        <i className="ti ti-hand-wave" aria-hidden="true" /> 반가워요!
      </div>
      <p className="kiosk-q">누구인가요?</p>
      <p className="kiosk-sub">학생증 QR을 찍거나, 우리 반에서 이름을 눌러요</p>

      <button
        className="btn primary kiosk-qr"
        onClick={onQr}
      >
        <i className="ti ti-qrcode" aria-hidden="true" /> QR 찍기 (시뮬레이션)
      </button>

      {!pickedClass ? (
        <>
          <p className="kiosk-help">
            <i className="ti ti-school" aria-hidden="true" />
            또는 우리 반을 골라요 <span style={{ color: 'var(--text-3)' }}>· 위=학년, 옆=반</span>
          </p>
          <ClassMatrix onPick={onPickClass} />
        </>
      ) : (
        <>
          <div className="row between kiosk-roster-head">
            <p className="kiosk-help" style={{ margin: 0 }}>
              <i className="ti ti-mood-smile" aria-hidden="true" />
              {pickedClass} — 이름을 눌러요
            </p>
            <button className="btn ghost" onClick={onBack}>
              <i className="ti ti-arrow-left" aria-hidden="true" /> 반 다시
            </button>
          </div>
          {(() => {
            const roster = studentsInClass(pickedClass)
            const boys = roster.filter((s) => s.sex === '남')
            const girls = roster.filter((s) => s.sex === '여')
            const section = (label: string, cls: 'boy' | 'girl', list: Student[]) =>
              list.length > 0 && (
                <div key={cls}>
                  <div className={`id-sex-head ${cls}`}>
                    <span className="id-sex-dot" aria-hidden="true" />
                    {label} <span className="muted-inline">{list.length}명</span>
                  </div>
                  <div className="id-grid">
                    {list.map((s) => (
                      <button key={s.id} className={`id-btn ${cls}`} onClick={() => onPickStudent(s)}>
                        {s.number}. {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            return (
              <>
                {section('남학생', 'boy', boys)}
                {section('여학생', 'girl', girls)}
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}

function ClassMatrix({ onPick }: { onPick: (c: string) => void }) {
  const grades = [...new Set(classes.map((c) => Number(c.split('-')[0])))].sort((a, b) => a - b)
  const classNos = [...new Set(classes.map((c) => Number(c.split('-')[1])))].sort((a, b) => a - b)
  const classSet = new Set(classes)

  return (
    <div className="class-matrix" style={{ gridTemplateColumns: `auto repeat(${grades.length}, minmax(0, 1fr))` }}>
      <div className="cm-corner">반＼학년</div>
      {grades.map((g) => (
        <div key={`h${g}`} className="cm-head">{g}학년</div>
      ))}
      {classNos.flatMap((no) => [
        <div key={`r${no}`} className="cm-rowhead">{no}반</div>,
        ...grades.map((g) => {
          const cls = `${g}-${no}`
          return classSet.has(cls) ? (
            <button key={cls} className="cm-cell" onClick={() => onPick(cls)} aria-label={`${g}학년 ${no}반`}>
              {cls}
            </button>
          ) : (
            <div key={cls} className="cm-empty" aria-hidden="true" />
          )
        }),
      ])}
    </div>
  )
}

type VoiceState =
  | { s: 'idle' }
  | { s: 'listening' }
  | { s: 'matched'; text: string; labels: string }
  | { s: 'nomatch'; text: string }
  | { s: 'silent' }
  | { s: 'denied' }
  | { s: 'unsupported' }
  | { s: 'error' }

function SymptomStep({
  student,
  byQr,
  selected,
  onToggle,
  onPickMany,
  onConfirm,
}: {
  student: Student
  byQr: boolean
  selected: string[]
  onToggle: (id: string) => void
  onPickMany: (ids: string[]) => void
  onConfirm: () => void
}) {
  const [voice, setVoice] = useState<VoiceState>({ s: 'idle' })
  const [called, setCalled] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  // 화면을 떠나면 듣던 것 중단
  useEffect(() => () => abortRef.current?.(), [])

  function startVoice() {
    if (voice.s === 'listening') return
    setVoice({ s: 'listening' })
    abortRef.current = listenOnce((r: VoiceOutcome) => {
      abortRef.current = null
      if (r.kind === 'heard') {
        const ids = matchSymptomTiles(r.text)
        if (ids.length > 0) {
          onPickMany(ids)
          const labels = ids.map((id) => symptomTiles.find((t) => t.id === id)?.label).filter(Boolean).join(' · ')
          setVoice({ s: 'matched', text: r.text, labels })
        } else {
          setVoice({ s: 'nomatch', text: r.text })
        }
      } else {
        setVoice({ s: r.kind === 'silent' ? 'silent' : r.kind === 'denied' ? 'denied' : r.kind === 'unsupported' ? 'unsupported' : 'error' })
      }
    })
  }

  function callNurse() {
    if (called) return
    setCalled(true)
    // 콘솔 "보건실 요청" 인박스로 전달(클라우드=암호화 릴레이, 로컬=탭 간 브로드캐스트)
    void sendNurseRequest({
      kind: '키오스크호출',
      grade: student.grade,
      classNo: student.classNo,
      number: student.number,
      symIds: selected,
    }).catch(() => {})
  }

  const voiceMsg: string | null =
    voice.s === 'listening' ? '듣고 있어요 — 어디가 아픈지 말해 보세요'
    : voice.s === 'matched' ? `"${voice.text}" → ${voice.labels} 선택했어요`
    : voice.s === 'nomatch' ? `"${voice.text}" — 아픈 곳을 못 찾았어요. 버튼을 직접 눌러 주세요`
    : voice.s === 'silent' ? '목소리를 못 들었어요. 버튼을 누르고 다시 말해 보세요'
    : voice.s === 'denied' ? '마이크가 막혀 있어요. 보건 선생님께 알려 주세요'
    : voice.s === 'unsupported' ? '이 기기에서는 음성 입력을 쓸 수 없어요'
    : voice.s === 'error' ? '잘 안 들렸어요. 한 번 더 눌러 보세요'
    : null

  return (
    <div className="kiosk-card">
      <div className="row between kiosk-student-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="avatar">{student.name[0]}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{student.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {classLabel(student)}
            </div>
          </div>
        </div>
        <span className={`pill ${byQr ? 'success' : 'info'}`}>
          <i className={`ti ${byQr ? 'ti-qrcode' : 'ti-hand-finger'}`} aria-hidden="true" />
          {byQr ? 'QR 인식 완료' : '이름 선택'}
        </span>
      </div>

      <div className="kiosk-empathy">
        <img
          src="/images/kiosk-symptom-empathy.webp"
          alt="배가 불편한 곰의 이야기를 토끼가 곁에서 들어주는 모습"
        />
        <div>
          <strong>아프거나 불편하면 걱정될 수 있어요.</strong>
          <span>지금 느끼는 것과 가장 비슷한 그림을 천천히 골라요.</span>
        </div>
      </div>

      <div className="kiosk-eyebrow">
        <i className="ti ti-heart" aria-hidden="true" /> 선생님에게 잘 알려 줄게요
      </div>
      <p className="kiosk-q">어디가 아파요?</p>
      <p className="kiosk-sub">아픈 곳을 모두 눌러요</p>

      <div className="tile-grid">
        {symptomTiles.map((t) => {
          const on = selected.includes(t.id)
          return (
            <button
              key={t.id}
              className={`tile${on ? ' selected' : ''}`}
              onClick={() => onToggle(t.id)}
              aria-pressed={on}
            >
              {on && (
                <span className="check">
                  <i className="ti ti-check" aria-hidden="true" />
                </span>
              )}
              <i className={`ti ${t.icon}`} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      <div className="row between kiosk-selection-bar">
        <span style={{ fontSize: 16, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--info)' }}>{selected.length}개</strong> 선택했어요
        </span>
        <button className="btn primary" disabled={selected.length === 0} onClick={onConfirm}>
          다 골랐어요 <i className="ti ti-arrow-right" aria-hidden="true" />
        </button>
      </div>

      <div className="row kiosk-help-actions">
        <button
          className={`btn ghost${voice.s === 'listening' ? ' listening' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={startVoice}
          disabled={voice.s === 'listening'}
        >
          <i className="ti ti-microphone" aria-hidden="true" />
          {voice.s === 'listening' ? '듣고 있어요…' : '말로 할래요'}
        </button>
        <button
          className="btn ghost"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={callNurse}
          disabled={called}
        >
          <i className={`ti ${called ? 'ti-bell-check' : 'ti-bell'}`} aria-hidden="true" />
          {called ? '선생님을 불렀어요 — 잠시만요' : '선생님 도와주세요'}
        </button>
      </div>

      {voiceMsg && (
        <p className={`kiosk-voice-note${voice.s === 'listening' ? ' live' : ''}`} role="status">
          <i className={`ti ${voice.s === 'listening' ? 'ti-microphone' : voice.s === 'matched' ? 'ti-check' : 'ti-info-circle'}`} aria-hidden="true" />
          {voiceMsg}
        </p>
      )}
    </div>
  )
}

function DoneStep({
  student,
  ticket,
  selected,
  onReset,
}: {
  student: Student
  ticket: number
  selected: string[]
  onReset: () => void
}) {
  const labels = selected
    .map((id) => symptomTiles.find((t) => t.id === id)?.label)
    .filter(Boolean)
    .join(' · ')

  // 3초 후 자동으로 처음 화면으로 복귀(다음 학생 대기).
  useEffect(() => {
    const t = setTimeout(onReset, 3000)
    return () => clearTimeout(t)
  }, [onReset])

  return (
    <div className="kiosk-card">
      <div className="done-wrap">
        <div className="done-icon">
          <i className="ti ti-check" aria-hidden="true" />
        </div>
        <p style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>
          접수가 끝났어요!
        </p>
        <p className="muted" style={{ margin: 0 }}>
          {student.name} · {labels}
        </p>

        <div className="ticket">{ticket}번</div>
        <p className="muted" style={{ margin: '0 0 16px' }}>대기 번호예요. 자리에 앉아 기다려요.</p>

        <span className="pill success" style={{ marginBottom: 24 }}>
          <i className="ti ti-send" aria-hidden="true" /> 담임·학부모에게 접수 알림을 보냈어요
        </span>

        <div>
          <button className="btn primary" onClick={onReset}>
            <i className="ti ti-home" aria-hidden="true" /> 처음으로
          </button>
        </div>
      </div>
    </div>
  )
}
