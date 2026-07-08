import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { classes, students } from '../data/mock'
import {
  ROSTER_TEMPLATE,
  clearRoster,
  decodeBuffer,
  isCustomRoster,
  parseRosterCsv,
  parseRosterRows,
  saveRoster,
} from '../data/localRoster'
import { readXlsxFirstSheet } from '../data/xlsxReader'
import {
  TEACHER_TEMPLATE,
  clearTeacherRoster,
  isCustomTeacherRoster,
  parseTeacherCsv,
  parseTeacherRows,
  saveTeacherRoster,
  teacherRoster,
  type TeacherRow,
} from '../data/teacherRoster'
import type { Student } from '../types'

export default function RosterManager() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Student[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const custom = isCustomRoster()

  // 담임 명부
  const tFileRef = useRef<HTMLInputElement>(null)
  const [tPreview, setTPreview] = useState<TeacherRow[] | null>(null)
  const [tFileName, setTFileName] = useState('')
  const [tError, setTError] = useState('')
  const tCustom = isCustomTeacherRoster()

  function onTFile(file: File) {
    setTError('')
    setTPreview(null)
    setTFileName(file.name)
    const isXlsx = /\.xlsx$/i.test(file.name)
    file
      .arrayBuffer()
      .then(async (buf) => {
        const res = isXlsx ? parseTeacherRows(await readXlsxFirstSheet(buf)) : parseTeacherCsv(decodeBuffer(buf))
        if (res.error) setTError(res.error)
        else setTPreview(res.teachers)
      })
      .catch((e) => setTError(`읽기 실패: ${e instanceof Error ? e.message : '오류'}`))
  }
  function applyT() {
    if (!tPreview) return
    saveTeacherRoster(tPreview)
    alert(`담임 명부 ${tPreview.length}개 반을 적용했습니다. 화면을 새로고침합니다.`)
    window.location.reload()
  }
  function resetT() {
    if (!confirm('업로드한 담임 명부를 지울까요?')) return
    clearTeacherRoster()
    window.location.reload()
  }
  function downloadTTemplate() {
    const blob = new Blob(['﻿' + TEACHER_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '담임명부_양식.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const curStats = useMemo(() => {
    const grades = new Set(students.map((s) => s.grade))
    return { count: students.length, grades: grades.size, classes: classes.length }
  }, [])

  function onFile(file: File) {
    setError('')
    setPreview(null)
    setFileName(file.name)
    const isXlsx = /\.xlsx$/i.test(file.name)
    file
      .arrayBuffer()
      .then(async (buf) => {
        const res = isXlsx
          ? parseRosterRows(await readXlsxFirstSheet(buf))
          : parseRosterCsv(decodeBuffer(buf))
        if (res.error) setError(res.error)
        else setPreview(res.students)
      })
      .catch((e) => {
        setError(
          /\.xls$/i.test(file.name)
            ? '구형 .xls 형식입니다. 엑셀에서 .xlsx 또는 CSV로 저장해 올려주세요.'
            : `읽기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
        )
      })
  }

  function apply() {
    if (!preview) return
    saveRoster(preview)
    alert(`학생 명부 ${preview.length}명을 적용했습니다. 화면을 새로고침합니다.`)
    window.location.reload()
  }

  function reset() {
    if (!confirm('업로드한 명부를 지우고 기본(데모) 명부로 되돌릴까요?')) return
    clearRoster()
    window.location.reload()
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿' + ROSTER_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '학생명부_양식.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const pvClasses = preview ? new Set(preview.map((s) => `${s.grade}-${s.classNo}`)).size : 0
  const pvWithPhone = preview ? preview.filter((s) => s.guardianPhone).length : 0

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/" className="muted" style={{ fontSize: 12, textDecoration: 'none' }}>
          <i className="ti ti-arrow-left" style={{ verticalAlign: -2 }} aria-hidden="true" /> 홈
        </Link>
        <h2 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 600 }}>학생 명부 관리</h2>
        <div className="muted" style={{ fontSize: 12 }}>
          학생 정보(PII)는 이 브라우저(로컬)에만 저장되며 서버로 전송되지 않습니다.
        </div>
      </div>

      {/* 현재 명부 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="sec-label">
            <i className="ti ti-users" style={{ verticalAlign: -2 }} aria-hidden="true" /> 현재 명부
          </div>
          <span className={`report-badge ${custom ? 'done' : ''}`}>
            {custom ? '업로드 명부' : '기본(데모) 명부'}
          </span>
        </div>
        <div className="kpi-grid" style={{ marginBottom: 0 }}>
          <div className="kpi"><div className="kpi-label">학생 수</div><div className="kpi-val">{curStats.count}</div></div>
          <div className="kpi"><div className="kpi-label">학년</div><div className="kpi-val">{curStats.grades}</div></div>
          <div className="kpi"><div className="kpi-label">학급(반)</div><div className="kpi-val">{curStats.classes}</div></div>
          <div className="kpi">
            <div className="kpi-label">동작</div>
            {custom ? (
              <button className="btn ghost small" onClick={reset}><i className="ti ti-rotate" aria-hidden="true" /> 기본 복원</button>
            ) : (
              <div className="kpi-val sm">—</div>
            )}
          </div>
        </div>
      </div>

      {/* 업로드 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-label" style={{ marginBottom: 8 }}>
          <i className="ti ti-upload" style={{ verticalAlign: -2 }} aria-hidden="true" /> 명부 업로드 (엑셀 / CSV)
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.7 }}>
          <b>.xlsx</b> 또는 <b>CSV</b>를 올려주세요. 열: <b>학년 · 반 · 번호 · 이름 · 성별 · 보호자연락처</b>
          (학년·반·이름 필수, 첫 시트의 머리글 자동 인식). 구형 .xls는 .xlsx로 저장해 주세요.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <i className="ti ti-file-spreadsheet" aria-hidden="true" /> 엑셀/CSV 파일 선택
          </button>
          <button className="btn ghost" onClick={downloadTemplate}>
            <i className="ti ti-download" aria-hidden="true" /> 양식 내려받기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
        {fileName && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>선택: {fileName}</div>}
        {error && <div className="admin-err" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      {/* 미리보기 + 적용 */}
      {preview && (
        <div className="card">
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="sec-label">미리보기 · {preview.length}명</div>
            <button className="btn" onClick={apply}><i className="ti ti-check" aria-hidden="true" /> 이 명부 적용</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            학급 {pvClasses}개 · 보호자 연락처 {pvWithPhone}/{preview.length}명
          </div>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>학년</th><th>반</th><th>번호</th><th>이름</th><th>성별</th><th>보호자</th></tr></thead>
              <tbody>
                {preview.slice(0, 12).map((s) => (
                  <tr key={s.id}>
                    <td>{s.grade}</td><td>{s.classNo}</td><td>{s.number}</td><td>{s.name}</td><td>{s.sex}</td>
                    <td>{s.guardianPhone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 12 && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>… 외 {preview.length - 12}명</div>}
        </div>
      )}

      {/* ── 담임 명부 ── */}
      <div className="card" style={{ marginTop: 24, marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="sec-label">
            <i className="ti ti-user-check" style={{ verticalAlign: -2 }} aria-hidden="true" /> 담임 명부 (학년·반·담임명·연락처)
          </div>
          <span className={`report-badge ${tCustom ? 'done' : ''}`}>
            {tCustom ? `등록 ${teacherRoster.length}반` : '미등록'}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.7 }}>
          담임 이름 표시 + 향후 문자(SMS) 발송용. <b>.xlsx</b> 또는 <b>CSV</b>, 열: <b>학년 · 반 · 담임명 · 연락처</b>.
          연락처는 이 브라우저(로컬)에만 저장되며 서버로 전송되지 않습니다.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => tFileRef.current?.click()}>
            <i className="ti ti-file-spreadsheet" aria-hidden="true" /> 담임 명부 파일 선택
          </button>
          <button className="btn ghost" onClick={downloadTTemplate}>
            <i className="ti ti-download" aria-hidden="true" /> 양식 내려받기
          </button>
          {tCustom && (
            <button className="btn ghost" onClick={resetT}>
              <i className="ti ti-rotate" aria-hidden="true" /> 담임 명부 지우기
            </button>
          )}
          <input
            ref={tFileRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onTFile(e.target.files[0])}
          />
        </div>
        {tFileName && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>선택: {tFileName}</div>}
        {tError && <div className="admin-err" style={{ marginTop: 8 }}>{tError}</div>}

        {tPreview && (
          <div style={{ marginTop: 12 }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="sec-label">미리보기 · {tPreview.length}반</div>
              <button className="btn" onClick={applyT}><i className="ti ti-check" aria-hidden="true" /> 담임 명부 적용</button>
            </div>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead><tr><th>학년</th><th>반</th><th>담임</th><th>연락처</th></tr></thead>
                <tbody>
                  {tPreview.slice(0, 12).map((t, i) => (
                    <tr key={i}>
                      <td>{t.grade}</td><td>{t.classNo}</td><td>{t.name}</td><td>{t.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tPreview.length > 12 && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>… 외 {tPreview.length - 12}반</div>}
          </div>
        )}
      </div>
    </div>
  )
}
