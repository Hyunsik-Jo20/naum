// 활력징후 입력 — 체온·혈압·맥박·호흡수·산소포화도를 한 화면에서 (요청 2026-09-22).
//  · 전부 선택 입력이다. 평소처럼 체온만 재고 닫아도 된다.
//  · 입력은 키패드 직접 입력이 기본(숫자 키패드). 값을 넣는 즉시 참고범위를 벗어나면
//    빨갛게 표시하고 아래에 안내를 모아 보여준다 — 확인용 표시이지 진단이 아니다.
//  · 참고범위는 이 학생의 **학년·성별**에 맞는 것이 자동으로 쓰인다(ctx). 교직원은 성인 기준.
import { useState } from 'react'
import { judgeVital, vitalItems, formatVital, resolveVitalItem, vitalCtxLabel, rangeText, hasBands } from '../data/vitals'
import type { VitalCtx } from '../data/vitals'
import type { VitalItem, Vitals } from '../types'

/** 입력칸 하나의 문자열 상태 — 항목 id별로 [첫 값, 둘째 값] */
type Draft = Record<string, [string, string]>

function toDraft(v?: Vitals | null): Draft {
  const d: Draft = {}
  for (const item of vitalItems) {
    const vals = v?.[item.id]
    d[item.id] = [
      vals?.[0] != null && Number.isFinite(vals[0]) ? String(vals[0]) : '',
      vals?.[1] != null && Number.isFinite(vals[1]) ? String(vals[1]) : '',
    ]
  }
  return d
}

/** 쉼표 표기(37,5)도 받아준다 */
const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function VitalsModal({
  initial,
  ctx,
  onConfirm,
  onClose,
  onEditItems,
}: {
  initial?: Vitals | null
  /** 이 방문의 학년·성별 — 참고범위를 고르는 데 쓴다(키오스크에서 학생이 고른 값). */
  ctx?: VitalCtx | null
  onConfirm: (v: Vitals | null) => void
  onClose: () => void
  /** 활력징후 항목 편집 열기 (관리자용) */
  onEditItems?: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  // 밴드를 쓰는 항목이 하나도 없으면(학교가 학년 기준을 안 쓰는 경우) 안내를 띄우지 않는다
  const ctxLabel = vitalItems.some(hasBands) ? vitalCtxLabel(ctx) : null

  function set(id: string, idx: 0 | 1, val: string) {
    setDraft((p) => {
      const cur = p[id] ?? ['', '']
      const next: [string, string] = idx === 0 ? [val, cur[1]] : [cur[0], val]
      return { ...p, [id]: next }
    })
  }

  /** 입력값 → 저장 형태. 허용 범위를 벗어난 값은 오타로 보고 막는다. */
  function build(): { vitals: Vitals; errors: string[] } {
    const vitals: Vitals = {}
    const errors: string[] = []
    for (const item of vitalItems) {
      const [a, b] = draft[item.id] ?? ['', '']
      const n1 = num(a)
      const n2 = num(b)
      if (n1 == null && n2 == null) continue
      if (item.type === 'pair') {
        if (n1 == null || n2 == null) {
          errors.push(`${item.label}은 수축기·이완기를 모두 입력해 주세요.`)
          continue
        }
      } else if (n1 == null) continue
      const vals = item.type === 'pair' ? [n1!, n2!] : [n1!]
      const bad = vals.find((n) => n < item.hardMin || n > item.hardMax)
      if (bad != null) {
        errors.push(`${item.label} ${bad}${item.unit} — ${item.hardMin}~${item.hardMax} 사이로 입력해 주세요.`)
        continue
      }
      vitals[item.id] = vals
    }
    return { vitals, errors }
  }

  const { vitals: preview, errors } = build()
  const warnings = vitalItems
    .map((item) => ({ item: resolveVitalItem(item, ctx), flag: judgeVital(item, preview[item.id], ctx) }))
    .filter((x) => x.flag)

  function save() {
    const { vitals, errors: errs } = build()
    if (errs.length) { alert(errs.join('\n')); return }
    onConfirm(Object.keys(vitals).length ? vitals : null)
  }

  const flagOf = (item: VitalItem) => judgeVital(item, preview[item.id], ctx)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-heartbeat" style={{ verticalAlign: -2 }} aria-hidden="true" /> 활력징후
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
          측정한 것만 넣으면 됩니다. 빈칸은 기록되지 않아요.
          {ctxLabel && <> 참고범위는 <b>{ctxLabel}</b>으로 자동 적용됩니다.</>}
        </p>

        <div className="vit-list">
          {vitalItems.map((raw) => {
            const item = resolveVitalItem(raw, ctx)
            const flag = flagOf(raw)
            const [a, b] = draft[item.id] ?? ['', '']
            return (
              <div key={item.id} className={`vit-row ${flag ? 'bad' : ''}`}>
                <label className="vit-label" htmlFor={`vit-${item.id}`}>
                  {item.label}
                  <span className="muted-inline"> {item.unit}</span>
                  <span className="vit-hint" title={hasBands(raw) && ctxLabel ? `${ctxLabel} 참고범위` : '참고범위'}>
                    {rangeText(item)}
                  </span>
                </label>
                <div className="vit-inputs">
                  <input
                    id={`vit-${item.id}`}
                    type="text"
                    inputMode="decimal"
                    value={a}
                    placeholder={item.low != null ? item.low.toFixed(item.decimals) : ''}
                    onChange={(e) => set(item.id, 0, e.target.value)}
                  />
                  {item.type === 'pair' && (
                    <>
                      <span className="vit-sep">/</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={b}
                        placeholder={item.low2 != null ? item.low2.toFixed(item.decimals) : ''}
                        onChange={(e) => set(item.id, 1, e.target.value)}
                      />
                    </>
                  )}
                </div>
                <span className={`vit-flag ${flag ?? ''}`}>
                  {flag === 'high' ? '높음' : flag === 'low' ? '낮음' : ''}
                </span>
              </div>
            )
          })}
        </div>

        {warnings.length > 0 && (
          <div className="infection-alert" style={{ marginTop: 12, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            {warnings.map(({ item, flag }) => (
              <span key={item.id}>
                <i className="ti ti-alert-triangle" aria-hidden="true" />{' '}
                {item.label} {formatVital(item, preview[item.id])} — 참고범위({
                  item.type === 'pair'
                    ? `${item.low}~${item.high} / ${item.low2}~${item.high2}`
                    : `${item.low}~${item.high}`
                })보다 {flag === 'low' ? '낮습니다' : '높습니다'}
              </span>
            ))}
            <span className="muted-inline" style={{ fontSize: 11 }}>
              참고범위는 확인이 필요한 값을 짚어 주는 표시일 뿐 진단 기준이 아닙니다.
              학교 상황에 맞게 <b>항목 편집</b>에서 조정할 수 있어요.
            </span>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          {onEditItems ? (
            <button className="btn ghost small" onClick={onEditItems} title="항목·정상범위 편집">
              <i className="ti ti-settings" aria-hidden="true" /> 항목 편집
            </button>
          ) : <span />}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => onConfirm(null)} title="이 방문의 활력징후 기록을 지웁니다">
              지우기
            </button>
            <button className="btn primary" onClick={save} disabled={errors.length > 0}>
              <i className="ti ti-check" aria-hidden="true" /> 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
