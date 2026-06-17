import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  classes,
  classLabel,
  students,
  studentsInClass,
  symptomTiles,
} from '../data/mock'
import { useVisits } from '../store/visits'
import type { Student } from '../types'

type Step = 'id' | 'symptom' | 'done'

export default function Kiosk() {
  const { addVisit } = useVisits()
  const [step, setStep] = useState<Step>('id')
  const [student, setStudent] = useState<Student | null>(null)
  const [pickedClass, setPickedClass] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [ticket, setTicket] = useState<number>(0)
  const [byQr, setByQr] = useState(false)

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
    const s = students[Math.floor(Math.random() * students.length)]
    chooseStudent(s, true)
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function confirmSymptoms() {
    if (selected.length === 0 || !student) return
    const v = addVisit(student, selected)
    setTicket(v.ticket)
    setStep('done')
  }

  return (
    <div className="kiosk">
      <div className="row between" style={{ marginBottom: 16 }}>
        <Link to="/" className="btn ghost">
          <i className="ti ti-arrow-left" aria-hidden="true" /> 나가기
        </Link>
        <span className="tag">보건실 키오스크</span>
      </div>

      {step === 'id' && (
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
      <p className="kiosk-q">누구인가요?</p>
      <p className="kiosk-sub">학생증 QR을 찍거나, 우리 반에서 이름을 눌러요</p>

      <button
        className="btn primary"
        style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
        onClick={onQr}
      >
        <i className="ti ti-qrcode" aria-hidden="true" /> QR 찍기 (시뮬레이션)
      </button>

      {!pickedClass ? (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
            또는 우리 반을 골라요 <span style={{ color: 'var(--text-3)' }}>· 위=학년, 옆=반</span>
          </p>
          <ClassMatrix onPick={onPickClass} />
        </>
      ) : (
        <>
          <div className="row between" style={{ margin: '0 0 8px' }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
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
    <div className="class-matrix" style={{ gridTemplateColumns: `auto repeat(${grades.length}, 1fr)` }}>
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

function SymptomStep({
  student,
  byQr,
  selected,
  onToggle,
  onConfirm,
}: {
  student: Student
  byQr: boolean
  selected: string[]
  onToggle: (id: string) => void
  onConfirm: () => void
}) {
  return (
    <div className="kiosk-card">
      <div className="row between" style={{ marginBottom: 8 }}>
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

      <div
        className="row between"
        style={{ marginTop: 20, paddingTop: 20, borderTop: '0.5px solid var(--border)' }}
      >
        <span style={{ fontSize: 16, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--info)' }}>{selected.length}개</strong> 선택했어요
        </span>
        <button className="btn primary" disabled={selected.length === 0} onClick={onConfirm}>
          다 골랐어요 <i className="ti ti-arrow-right" aria-hidden="true" />
        </button>
      </div>

      <div className="row" style={{ gap: 12, marginTop: 12 }}>
        <button
          className="btn ghost"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => alert('음성 입력은 다음 단계에서 연동됩니다. (로컬 처리)')}
        >
          <i className="ti ti-microphone" aria-hidden="true" /> 말로 할래요
        </button>
        <button
          className="btn ghost"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => alert('보건 선생님을 호출했어요.')}
        >
          <i className="ti ti-bell" aria-hidden="true" /> 선생님 도와주세요
        </button>
      </div>
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
