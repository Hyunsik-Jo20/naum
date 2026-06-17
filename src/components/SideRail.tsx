import { useEffect, useState, type ReactNode } from 'react'

/** 넓은 화면(≥1440px)이면 본문 양옆 여백에, 좁으면 오버레이로 연다. 기본은 닫힘 — 가장자리 탭을 눌러 연다. */
function useWide(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1440px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1440px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

export default function SideRail({
  side,
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  side: 'left' | 'right'
  title: string
  icon: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const wide = useWide()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="no-print">
      {!open && (
        <button className={`rail-tab ${side}`} onClick={() => setOpen(true)} aria-label={`${title} 열기`}>
          <i className={`ti ${icon}`} aria-hidden="true" />
          <span>{title}</span>
        </button>
      )}
      {open && !wide && <div className="rail-scrim" onClick={() => setOpen(false)} />}
      <aside
        className={`side-rail ${side} ${open ? 'open' : ''} ${wide ? 'docked' : 'overlay'}`}
        aria-hidden={!open}
      >
        <div className="rail-head">
          <span className="rail-title">
            <i className={`ti ${icon}`} style={{ verticalAlign: -2 }} aria-hidden="true" /> {title}
          </span>
          <button className="x" onClick={() => setOpen(false)} aria-label="닫기">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div className="rail-body">{children}</div>
      </aside>
    </div>
  )
}
