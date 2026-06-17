import { useMemo, useState } from 'react'
import { EDU_LEVELS, EDU_OFFICES, EDU_REGIONS, eduSchools, type SchoolLevel } from '../data/eduMock'
import { useSchools } from '../store/schools'
import CoordPicker from './CoordPicker'

type FormState = {
  id: string
  name: string
  region: string
  office: string
  level: SchoolLevel
  lat: string
  lon: string
  tel: string
  enroll: string
}

const BUSAN_CENTER = { lat: 35.18, lon: 129.07 }

function emptyForm(): FormState {
  return { id: '', name: '', region: EDU_REGIONS[0], office: EDU_OFFICES[0], level: '초', lat: '', lon: '', tel: '', enroll: '' }
}

export default function SchoolAdminPanel() {
  const { schools, addedCount, removedCount, isCustom, addSchool, updateSchool, removeSchool, restoreSchool, resetAll } =
    useSchools()
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [err, setErr] = useState('')

  const removedSchools = useMemo(
    () => eduSchools.filter((s) => !schools.some((x) => x.id === s.id)),
    [schools],
  )

  const results = useMemo(() => {
    const t = q.trim()
    if (!t) return schools.filter((s) => isCustom(s.id)).slice(0, 30)
    const low = t.toLowerCase()
    return schools
      .filter((s) => s.name.toLowerCase().includes(low) || s.region.includes(t))
      .slice(0, 30)
  }, [q, schools, isCustom])

  function startAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setShowMap(false)
    setErr('')
    setShowForm(true)
  }

  function startEdit(id: string) {
    const s = schools.find((x) => x.id === id)
    if (!s) return
    setEditingId(id)
    setForm({
      id: s.id,
      name: s.name,
      region: s.region,
      office: s.office,
      level: s.level,
      lat: String(s.lat),
      lon: String(s.lon),
      tel: s.tel ?? '',
      enroll: String(s.enroll),
    })
    setShowMap(false)
    setErr('')
    setShowForm(true)
  }

  function submit() {
    if (!form.name.trim()) {
      setErr('학교명을 입력하세요.')
      return
    }
    const lat = form.lat ? Number(form.lat) : BUSAN_CENTER.lat
    const lon = form.lon ? Number(form.lon) : BUSAN_CENTER.lon
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setErr('좌표는 숫자여야 합니다.')
      return
    }
    const enroll = form.enroll ? Number(form.enroll) : undefined
    const tel = form.tel.trim()
    if (editingId) {
      updateSchool(editingId, { name: form.name.trim(), region: form.region, office: form.office, level: form.level, lat, lon, tel, enroll })
    } else {
      const id = `u${Date.now().toString(36)}`
      addSchool({ id, name: form.name.trim(), region: form.region, office: form.office, level: form.level, lat, lon, tel, enroll })
    }
    setShowForm(false)
    setEditingId(null)
  }

  return (
    <div className="admin-panel">
      <p className="rail-desc">
        매년 폐교·증설·정보 변경을 반영합니다. 변경은 이 브라우저에 저장되고 대시보드(지도·집계)에 즉시 적용됩니다.
      </p>

      <div className="admin-stats">
        <span>전체 <b>{schools.length}</b></span>
        <span className="ok">증설 <b>{addedCount}</b></span>
        <span className="warn">폐교 <b>{removedCount}</b></span>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <button className="btn small" onClick={startAdd}>
          <i className="ti ti-plus" aria-hidden="true" /> 학교 추가
        </button>
        {(addedCount > 0 || removedCount > 0) && (
          <button className="btn ghost small" onClick={() => { if (confirm('모든 학교 설정 변경을 초기화할까요?')) resetAll() }}>
            <i className="ti ti-rotate" aria-hidden="true" /> 초기화
          </button>
        )}
      </div>

      {showForm && (
        <div className="admin-form">
          <div className="admin-form-title">{editingId ? '학교 정보 수정' : '학교 추가(증설)'}</div>
          <label className="admin-f">
            학교명
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 강서나음초등학교" />
          </label>
          <div className="admin-grid2">
            <label className="admin-f">
              지역
              <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                {EDU_REGIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="admin-f">
              학교급
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as SchoolLevel })}>
                {EDU_LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="admin-grid2">
            <label className="admin-f">
              교육지원청
              <select value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })}>
                {EDU_OFFICES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label className="admin-f">
              재학생 수
              <input value={form.enroll} onChange={(e) => setForm({ ...form, enroll: e.target.value })} placeholder="자동" inputMode="numeric" />
            </label>
          </div>
          <label className="admin-f">
            전화번호
            <input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} placeholder="051-000-0000" inputMode="tel" />
          </label>

          <div className="admin-coord-head">
            <span>위치(좌표)</span>
            <button className="btn ghost small" type="button" onClick={() => setShowMap((v) => !v)}>
              <i className="ti ti-map-pin" aria-hidden="true" /> {showMap ? '지도 닫기' : '지도에서 선택'}
            </button>
          </div>
          {showMap && (
            <CoordPicker
              lat={form.lat ? Number(form.lat) : null}
              lon={form.lon ? Number(form.lon) : null}
              onPick={(la, lo) => setForm((f) => ({ ...f, lat: String(la), lon: String(lo) }))}
            />
          )}
          <div className="admin-grid2">
            <label className="admin-f">
              위도(lat)
              <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="35.18" inputMode="decimal" />
            </label>
            <label className="admin-f">
              경도(lon)
              <input value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} placeholder="129.07" inputMode="decimal" />
            </label>
          </div>
          {err && <div className="admin-err">{err}</div>}
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <button className="btn small" onClick={submit}>{editingId ? '저장' : '추가'}</button>
            <button className="btn ghost small" onClick={() => { setShowForm(false); setEditingId(null) }}>취소</button>
          </div>
        </div>
      )}

      <label className="admin-f" style={{ marginTop: 4 }}>
        학교 검색
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학교명 또는 지역" />
      </label>
      <div className="rail-hint">{q.trim() ? `"${q}" 검색 결과 (최대 30)` : '증설한 학교 (검색 시 전체 명부)'}</div>

      <div className="admin-list">
        {results.length === 0 ? (
          <div className="col-empty">{q.trim() ? '검색 결과가 없어요.' : '증설한 학교가 없어요. 검색해 폐교 처리할 수 있어요.'}</div>
        ) : (
          results.map((s) => (
            <div key={s.id} className="admin-row">
              <div className="admin-row-main">
                <span className="admin-name">
                  {s.name}
                  {isCustom(s.id) && <span className="admin-tag">증설</span>}
                </span>
                <span className="admin-sub">
                  {s.region} · {s.level} · 재학 {s.enroll}명
                  {s.tel ? <> · <i className="ti ti-phone" style={{ fontSize: 11, verticalAlign: -1 }} aria-hidden="true" /> {s.tel}</> : ''}
                </span>
              </div>
              <div className="admin-row-act">
                <button className="icon-btn" title="수정" onClick={() => startEdit(s.id)}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                </button>
                <button
                  className="icon-btn danger"
                  title={isCustom(s.id) ? '삭제' : '폐교 처리'}
                  onClick={() => removeSchool(s.id)}
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {removedSchools.length > 0 && (
        <>
          <div className="rail-hint" style={{ marginTop: 12 }}>폐교 처리됨 ({removedSchools.length})</div>
          <div className="admin-list">
            {removedSchools.slice(0, 20).map((s) => (
              <div key={s.id} className="admin-row removed">
                <div className="admin-row-main">
                  <span className="admin-name strike">{s.name}</span>
                  <span className="admin-sub">{s.region} · {s.level}</span>
                </div>
                <button className="btn ghost small" onClick={() => restoreSchool(s.id)}>복원</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
