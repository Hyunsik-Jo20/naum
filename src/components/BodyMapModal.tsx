// 인체도(앞면) 부위 선택 — 지혈·밴드·소독 등 부위가 있는 처치에서 "어디에" 처치했는지 터치로 기록.
//  · 선택 부위는 처치 문자열에 붙어 저장됨(A안): "지혈 (이마)", "밴드·소독 (오른무릎)".
//  · 좌·우는 "학생 기준"(마주 본 그림에서 학생의 오른쪽 = 화면 왼쪽).
import { useState } from 'react'

type Zone = { id: string; x: number; y: number; w: number; h: number; rx: number }

// 앞면 인체도(viewBox 0 0 240 360). 겹치지 않는 단순 도형으로 배치.
const ZONES: Zone[] = [
  { id: '이마', x: 104, y: 16, w: 32, h: 20, rx: 10 },
  { id: '얼굴', x: 100, y: 37, w: 40, h: 38, rx: 16 },
  { id: '목', x: 110, y: 74, w: 20, h: 14, rx: 5 },
  { id: '가슴', x: 88, y: 88, w: 64, h: 46, rx: 8 },
  { id: '배', x: 88, y: 135, w: 64, h: 52, rx: 8 },
  // 팔 (학생 오른쪽 = 화면 왼쪽)
  { id: '오른팔', x: 60, y: 92, w: 24, h: 60, rx: 11 },
  { id: '오른팔꿈치', x: 60, y: 153, w: 24, h: 16, rx: 7 },
  { id: '오른손', x: 58, y: 170, w: 26, h: 24, rx: 11 },
  { id: '오른손가락', x: 54, y: 196, w: 34, h: 18, rx: 8 }, // 초등학생 손가락 부상 빈발 — 별도 부위
  { id: '왼팔', x: 156, y: 92, w: 24, h: 60, rx: 11 },
  { id: '왼팔꿈치', x: 156, y: 153, w: 24, h: 16, rx: 7 },
  { id: '왼손', x: 156, y: 170, w: 26, h: 24, rx: 11 },
  { id: '왼손가락', x: 152, y: 196, w: 34, h: 18, rx: 8 },
  // 다리 (학생 오른쪽 = 화면 왼쪽)
  { id: '오른허벅지', x: 92, y: 189, w: 24, h: 56, rx: 10 },
  { id: '오른무릎', x: 92, y: 246, w: 24, h: 20, rx: 8 },
  { id: '오른정강이', x: 92, y: 267, w: 24, h: 54, rx: 10 },
  { id: '오른발', x: 86, y: 322, w: 30, h: 20, rx: 8 },
  { id: '왼허벅지', x: 124, y: 189, w: 24, h: 56, rx: 10 },
  { id: '왼무릎', x: 124, y: 246, w: 24, h: 20, rx: 8 },
  { id: '왼정강이', x: 124, y: 267, w: 24, h: 54, rx: 10 },
  { id: '왼발', x: 124, y: 322, w: 30, h: 20, rx: 8 },
]

// 손가락 상세 — "어느 손가락인지"가 처치 기록에 중요(현장 피드백).
//  손가락 존 터치 → 엄지~새끼 선택 화면. "오른손 엄지"처럼 저장(지혈·밴드·소독 공용).
const FINGERS = ['엄지', '검지', '중지', '약지', '새끼'] as const
type FingerSide = '오른' | '왼'

export default function BodyMapModal({
  kind,
  initialParts,
  onConfirm,
  onRemove,
  onClose,
}: {
  kind: string
  initialParts: string[]
  onConfirm: (parts: string[]) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [sel, setSel] = useState<string[]>(initialParts)
  const [fingerSide, setFingerSide] = useState<FingerSide | null>(null)
  const tone = kind.includes('지혈') ? 'danger' : 'info' // 지혈=빨강, 밴드·소독=파랑
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  // 손가락 존은 선택이 아니라 상세 화면으로 진입. 개별 손가락(또는 구형 "○손가락")이 선택돼 있으면 켜짐 표시.
  const fingerOn = (side: FingerSide) => sel.some((s) => s === `${side}손가락` || s.startsWith(`${side}손 `))
  const zoneClick = (id: string) => {
    if (id === '오른손가락' || id === '왼손가락') setFingerSide(id.startsWith('오른') ? '오른' : '왼')
    else toggle(id)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-body-scan" style={{ verticalAlign: -2 }} aria-hidden="true" /> {kind} · 부위 선택
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.6 }}>
          {fingerSide ? (
            <><b>{fingerSide}손</b> — 어느 손가락인지 누르세요. 여러 개 선택할 수 있습니다.</>
          ) : (
            <><b>{kind}</b> 처치한 부위를 터치하세요. 여러 곳 선택할 수 있습니다. <span className="muted-inline">(좌·우는 학생 기준)</span></>
          )}
        </p>

        {fingerSide ? (
          <div className={`bm-fingers tone-${tone}`}>
            <div className="bm-finger-grid">
              {FINGERS.map((f) => {
                const id = `${fingerSide}손 ${f}`
                const on = sel.includes(id)
                return (
                  <button key={f} className={`bm-finger ${on ? 'on' : ''}`} onClick={() => toggle(id)} aria-pressed={on}>
                    <i className="ti ti-hand-finger" aria-hidden="true" />
                    {f}
                  </button>
                )
              })}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button
                className={`btn ghost small ${sel.includes(`${fingerSide}손가락`) ? 'active' : ''}`}
                onClick={() => toggle(`${fingerSide}손가락`)}
                title="어느 손가락인지 특정하지 않고 기록"
              >
                손가락 전체(미상)
              </button>
              <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setFingerSide(null)}>
                <i className="ti ti-arrow-left" aria-hidden="true" /> 몸 전체로
              </button>
            </div>
          </div>
        ) : (
        <div className={`bodymap tone-${tone}`}>
          <svg viewBox="0 0 240 360" width="100%" style={{ maxHeight: '46vh' }} role="img" aria-label="인체도 앞면">
            {ZONES.map((z) => {
              const isFinger = z.id === '오른손가락' || z.id === '왼손가락'
              const on = isFinger ? fingerOn(z.id.startsWith('오른') ? '오른' : '왼') : sel.includes(z.id)
              return (
                <rect
                  key={z.id}
                  x={z.x} y={z.y} width={z.w} height={z.h} rx={z.rx}
                  className={`bm-zone ${on ? 'on' : ''}`}
                  onClick={() => zoneClick(z.id)}
                >
                  <title>{isFinger ? `${z.id} — 눌러서 어느 손가락인지 선택` : z.id}</title>
                </rect>
              )
            })}
          </svg>
        </div>
        )}

        <div className="bm-selected">
          선택: {sel.length ? <b>{sel.join(', ')}</b> : <span className="muted-inline">없음(부위 미지정으로 기록)</span>}
        </div>

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, gap: 8 }}>
          <button className="btn ghost small" onClick={onRemove} title="이 처치를 제거">
            <i className="ti ti-trash" aria-hidden="true" /> 이 처치 지우기
          </button>
          <button className="btn primary" style={{ justifyContent: 'center', flex: 1 }} onClick={() => onConfirm(sel)}>
            <i className="ti ti-check" aria-hidden="true" /> 확인
          </button>
        </div>
      </div>
    </div>
  )
}
