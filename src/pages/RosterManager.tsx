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
import { schoolId, getSchool } from '../data/school'
import {
  TEACHER_TEMPLATE,
  clearTeacherRoster,
  clearStaffRoster,
  isCustomTeacherRoster,
  parseTeacherCsv,
  parseTeacherRows,
  saveTeacherRoster,
  saveStaffRoster,
  staffRoster,
  teacherRoster,
  type TeacherParseResult,
} from '../data/teacherRoster'
import { roster, saveRoster as saveRosterDirect } from '../data/localRoster'
import type { Student } from '../types'

export default function RosterManager() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Student[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const custom = isCustomRoster()

  // 교직원 명부(담임 + 그 외) — 학년·반이 빈 행은 담임 외 교직원으로 등록
  const tFileRef = useRef<HTMLInputElement>(null)
  const [tPreview, setTPreview] = useState<TeacherParseResult | null>(null)
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
        else setTPreview(res)
      })
      .catch((e) => setTError(`읽기 실패: ${e instanceof Error ? e.message : '오류'}`))
  }
  function applyT() {
    if (!tPreview) return
    saveTeacherRoster(tPreview.teachers)
    saveStaffRoster(tPreview.staff)
    alert(`교직원 명부를 적용했습니다 — 담임 ${tPreview.teachers.length}반 · 담임 외 ${tPreview.staff.length}명. 화면을 새로고침합니다.`)
    window.location.reload()
  }
  function resetT() {
    if (!confirm('업로드한 교직원 명부(담임 포함)를 지울까요?')) return
    clearTeacherRoster()
    clearStaffRoster()
    window.location.reload()
  }
  function downloadTTemplate() {
    const blob = new Blob(['﻿' + TEACHER_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '교직원명부_양식.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // 요보호 학생 관리 — 현재 명부에서 검색해 사유 지정/해제(로컬 암호화 저장, 저장 시 새로고침)
  const [careQ, setCareQ] = useState('')
  const [careSel, setCareSel] = useState<Student | null>(null)
  const [careText, setCareText] = useState('')
  const careStudents = roster.filter((s) => s.care)
  const careMatches = careQ.trim()
    ? roster.filter((s) => s.name.includes(careQ.trim()) || `${s.grade}-${s.classNo}`.includes(careQ.trim())).slice(0, 8)
    : []
  function saveCare(target: Student, text: string) {
    const next = roster.map((s) => (s.id === target.id ? { ...s, care: text.trim() || undefined } : s))
    saveRosterDirect(next)
    alert(text.trim() ? `${target.name} — 요보호(${text.trim()}) 지정했습니다. 새로고침합니다.` : `${target.name} — 요보호를 해제했습니다. 새로고침합니다.`)
    window.location.reload()
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
    const msg = schoolId() === 'demo'
      ? '업로드한 명부를 지우고 기본(데모) 명부로 되돌릴까요?'
      : '업로드한 명부를 지울까요? (빈 명부가 됩니다 — 키오스크 접수 불가)'
    if (!confirm(msg)) return
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
  const pvBoys = preview ? preview.filter((s) => s.sex === '남').length : 0
  const pvGirls = preview ? preview.filter((s) => s.sex === '여').length : 0

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
            {custom ? `업로드 명부 · ${getSchool().name}` : schoolId() === 'demo' ? '기본(데모) 명부' : '명부 없음 — 업로드 필요'}
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
          <b>.xlsx</b> 또는 <b>CSV</b>를 올려주세요. 열: <b>학년 · 반 · 번호 · 이름 · 성별 · 보호자연락처 · 요보호</b>
          (학년·반·이름 필수, 첫 시트의 머리글 자동 인식). 요보호 열에는 사유(천식 등)를 적으면 콘솔에 표시됩니다.
          구형 .xls는 .xlsx로 저장해 주세요.
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
            학급 {pvClasses}개 · 남 {pvBoys}명 · 여 {pvGirls}명 · 보호자 연락처 {pvWithPhone}/{preview.length}명
            {' · '}요보호 {preview.filter((s) => s.care).length}명
            {pvGirls === 0 && pvBoys > 0 && (
              <span style={{ color: 'var(--danger)' }}> — 여학생이 0명입니다. 파일의 성별 열(남/여)을 확인하세요.</span>
            )}
          </div>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>학년</th><th>반</th><th>번호</th><th>이름</th><th>성별</th><th>보호자</th><th>요보호</th></tr></thead>
              <tbody>
                {preview.slice(0, 12).map((s) => (
                  <tr key={s.id}>
                    <td>{s.grade}</td><td>{s.classNo}</td><td>{s.number}</td><td>{s.name}</td><td>{s.sex}</td>
                    <td>{s.guardianPhone ?? '—'}</td>
                    <td>{s.care ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 12 && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>… 외 {preview.length - 12}명</div>}
        </div>
      )}

      {/* ── 요보호 학생 관리 ── */}
      <div className="card" style={{ marginTop: 24, marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="sec-label">
            <i className="ti ti-shield-heart" style={{ verticalAlign: -2 }} aria-hidden="true" /> 요보호 학생 관리
          </div>
          <span className={`report-badge ${careStudents.length ? 'done' : ''}`}>{careStudents.length}명</span>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.7 }}>
          요보호 사유(천식·알레르기·심장질환 등)는 콘솔 대기 카드와 처치 화면에 표시됩니다.
          이 기기(로컬, 암호화)에만 저장됩니다. 명부 업로드의 <b>요보호</b> 열로도 일괄 등록할 수 있습니다.
        </p>
        {careStudents.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {careStudents.map((s) => (
              <div key={s.id} className="row" style={{ gap: 8, alignItems: 'center', padding: '5px 2px', borderBottom: '1px dashed var(--border)' }}>
                <b>{s.name}</b>
                <span className="muted-inline">{s.grade}-{s.classNo} · {s.number}번</span>
                <span style={{ flex: 1, color: 'var(--danger)' }}>{s.care}</span>
                <button className="btn ghost small" onClick={() => { setCareSel(s); setCareText(s.care ?? '') }}>수정</button>
                <button className="btn ghost small" onClick={() => saveCare(s, '')}>해제</button>
              </div>
            ))}
          </div>
        )}
        {careSel ? (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>{careSel.name}</b>
            <span className="muted-inline">{careSel.grade}-{careSel.classNo} · {careSel.number}번</span>
            <input
              className="memo"
              style={{ flex: 1, minWidth: 160, marginBottom: 0 }}
              value={careText}
              placeholder="요보호 사유 (예: 천식, 견과류 알레르기)"
              onChange={(e) => setCareText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveCare(careSel, careText)}
            />
            <button className="btn small" onClick={() => saveCare(careSel, careText)}>저장</button>
            <button className="btn ghost small" onClick={() => { setCareSel(null); setCareText('') }}>취소</button>
          </div>
        ) : (
          <>
            <input
              className="memo"
              style={{ marginBottom: 0 }}
              value={careQ}
              placeholder="학생 검색 후 요보호 지정 — 이름 또는 학년-반 (예: 김도현, 2-1)"
              onChange={(e) => setCareQ(e.target.value)}
            />
            {careMatches.length > 0 && (
              <div className="search-list">
                {careMatches.map((s) => (
                  <button key={s.id} className="search-item" onClick={() => { setCareSel(s); setCareText(s.care ?? ''); setCareQ('') }}>
                    <span className="si-name">{s.name}</span>
                    <span className="si-meta">{s.grade}-{s.classNo} · {s.number}번{s.care ? ` · 요보호: ${s.care}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 교직원 명부(담임 + 그 외) ── */}
      <div className="card" style={{ marginTop: 24, marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="sec-label">
            <i className="ti ti-user-check" style={{ verticalAlign: -2 }} aria-hidden="true" /> 교직원 명부 (담임 포함)
          </div>
          <span className={`report-badge ${tCustom || staffRoster.length ? 'done' : ''}`}>
            {tCustom || staffRoster.length ? `담임 ${teacherRoster.length}반 · 그 외 ${staffRoster.length}명` : '미등록'}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.7 }}>
          <b>.xlsx</b> 또는 <b>CSV</b>, 열: <b>학년 · 반 · 이름 · 연락처 · 구분 · 성별</b>.
          학년·반이 채워진 행은 <b>담임</b>(이름 표시·알림용), 비어 있는 행은 <b>담임 외 교직원</b>(교장·행정 등,
          콘솔 "교직원 접수" 대상)으로 등록됩니다. 연락처는 이 브라우저(로컬)에만 저장됩니다.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => tFileRef.current?.click()}>
            <i className="ti ti-file-spreadsheet" aria-hidden="true" /> 교직원 명부 파일 선택
          </button>
          <button className="btn ghost" onClick={downloadTTemplate}>
            <i className="ti ti-download" aria-hidden="true" /> 양식 내려받기
          </button>
          {(tCustom || staffRoster.length > 0) && (
            <button className="btn ghost" onClick={resetT}>
              <i className="ti ti-rotate" aria-hidden="true" /> 교직원 명부 지우기
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
              <div className="sec-label">미리보기 · 담임 {tPreview.teachers.length}반 · 담임 외 {tPreview.staff.length}명</div>
              <button className="btn" onClick={applyT}><i className="ti ti-check" aria-hidden="true" /> 교직원 명부 적용</button>
            </div>
            {tPreview.teachers.length > 0 && (
              <div className="report-table-wrap" style={{ marginBottom: 10 }}>
                <table className="report-table">
                  <thead><tr><th>학년</th><th>반</th><th>담임</th><th>연락처</th></tr></thead>
                  <tbody>
                    {tPreview.teachers.slice(0, 12).map((t, i) => (
                      <tr key={i}>
                        <td>{t.grade}</td><td>{t.classNo}</td><td>{t.name}</td><td>{t.phone ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tPreview.staff.length > 0 && (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead><tr><th>이름</th><th>구분</th><th>성별</th><th>연락처</th></tr></thead>
                  <tbody>
                    {tPreview.staff.slice(0, 12).map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td><td>{s.role ?? '—'}</td><td>{s.sex ?? '—'}</td><td>{s.phone ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
