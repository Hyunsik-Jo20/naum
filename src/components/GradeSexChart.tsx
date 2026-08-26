// 학교급·학년/남녀별 방문 — 실제 방문(rows)의 학년·성별 집계(eduLive.buildGradeSex).
//  (구 버전은 총량을 노이즈 비율로 배분한 데모 — 제거.)
import { useState } from 'react'
import type { GradeSexAgg } from '../data/eduLive'

const LEVELS: { key: '초' | '중' | '고'; grades: number[]; color: string }[] = [
  { key: '초', grades: [1, 2, 3, 4, 5, 6], color: '#185fa5' },
  { key: '중', grades: [1, 2, 3], color: '#1d9e75' },
  { key: '고', grades: [1, 2, 3], color: '#534ab7' },
]

interface Item { label: string; value: number; color: string }

function VBars({ items }: { items: Item[] }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="vbars-wrap">
      <div className="vbars">
        {items.map((it, i) => (
          <div key={i} className="vbar-col">
            <span className="vbar-val">{it.value}</span>
            <div className="vbar" style={{ height: `${(it.value / max) * 100}%`, background: it.color }} />
          </div>
        ))}
      </div>
      <div className="vbar-labels">
        {items.map((it, i) => (
          <span key={i}>{it.label}</span>
        ))}
      </div>
    </div>
  )
}

export default function GradeSexChart({
  agg,
  categoryLabel,
}: {
  agg: Record<'초' | '중' | '고', GradeSexAgg> // 현재 범위(기간·선택일·계통) 실측 집계
  categoryLabel: string
}) {
  const [mode, setMode] = useState<'학년' | '남녀'>('학년')
  const grand = LEVELS.reduce((a, lv) => a + agg[lv.key].total, 0)

  function itemsFor(lv: { key: '초' | '중' | '고'; grades: number[]; color: string }): Item[] {
    const g = agg[lv.key]
    if (mode === '남녀') {
      return [
        { label: '남', value: g.bySex.남, color: '#185fa5' },
        { label: '여', value: g.bySex.여, color: '#d4537e' },
      ]
    }
    return lv.grades.map((gr) => ({ label: `${gr}`, value: g.byGrade[gr] ?? 0, color: lv.color }))
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className="sec-label">
          학교급·{mode}별 방문 <span className="muted-inline">· {categoryLabel}</span>
        </div>
        <div className="seg">
          {(['학년', '남녀'] as const).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m}별
            </button>
          ))}
        </div>
      </div>
      {grand === 0 ? (
        <div className="col-empty">현재 범위에 접수 데이터가 없어요.</div>
      ) : (
        <div className="gs-grid">
          {LEVELS.map((lv) => (
            <div key={lv.key} className="gs-block">
              <div className="gs-title" style={{ color: lv.color }}>
                {lv.key === '초' ? '초등학교' : lv.key === '중' ? '중학교' : '고등학교'}
              </div>
              <VBars items={itemsFor(lv)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
