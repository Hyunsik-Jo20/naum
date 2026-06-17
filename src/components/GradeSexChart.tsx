import { useState } from 'react'
import type { EduSchool } from '../data/eduMock'

const LEVELS: { key: '초' | '중' | '고'; code: number; grades: number[]; color: string }[] = [
  { key: '초', code: 1, grades: [1, 2, 3, 4, 5, 6], color: '#185fa5' },
  { key: '중', code: 2, grades: [1, 2, 3], color: '#1d9e75' },
  { key: '고', code: 3, grades: [1, 2, 3], color: '#534ab7' },
]

const noise = (a: number) => {
  const x = Math.sin(a) * 43758.5453
  return x - Math.floor(x)
}

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
  schools,
  catIdx,
  total,
  categoryLabel,
}: {
  schools: EduSchool[]
  catIdx: number
  total: number // 현재 범위(기간·선택일·계통)의 총 방문 — 방문 추이와 동일 집계
  categoryLabel: string
}) {
  const [mode, setMode] = useState<'학년' | '남녀'>('학년')

  // 학교급별 주간 비중(분포 형태) → 현재 총 방문(total)을 비중대로 배분 (추이와 연동)
  const weeklyBase = (lv: string) =>
    schools
      .filter((s) => s.level === lv)
      .reduce((a, s) => a + (catIdx < 0 ? s.cat.reduce((x, y) => x + y, 0) : s.cat[catIdx]), 0)
  const sumBase = LEVELS.reduce((a, lv) => a + weeklyBase(lv.key), 0) || 1

  function itemsFor(lv: { key: string; code: number; grades: number[]; color: string }): Item[] {
    const base = Math.round((total * weeklyBase(lv.key)) / sumBase)
    if (mode === '남녀') {
      const nam = Math.round(base * (0.5 + 0.05 * (noise(lv.code) - 0.5) * 2))
      return [
        { label: '남', value: nam, color: '#185fa5' },
        { label: '여', value: Math.max(0, base - nam), color: '#d4537e' },
      ]
    }
    const w = lv.grades.map((g) => 0.8 + 0.4 * noise(lv.code * 31 + g * 7))
    const sumW = w.reduce((a, b) => a + b, 0)
    return lv.grades.map((g, i) => ({ label: `${g}`, value: Math.round((base * w[i]) / sumW), color: lv.color }))
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
    </div>
  )
}
