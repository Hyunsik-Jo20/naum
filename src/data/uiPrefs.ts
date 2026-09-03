// 화면 기본 설정(기기별) — 포인트 색상·화면(글자) 크기. 설정 팝업(⚙)에서 변경.
//  색상은 CSS 변수(--info/--info-bg) 덮어쓰기, 크기는 앱 셸 zoom으로 전체 배율 조정.
export interface AccentPreset {
  id: string
  label: string
  info: string
  infoBg: string
}

export const ACCENTS: AccentPreset[] = [
  { id: 'blue', label: '파랑(기본)', info: '#185fa5', infoBg: '#e6f1fb' },
  { id: 'teal', label: '청록', info: '#0f766e', infoBg: '#e3f4f2' },
  { id: 'purple', label: '보라', info: '#6d4fa3', infoBg: '#f0eafb' },
  { id: 'rose', label: '장미', info: '#b0486b', infoBg: '#fdecf2' },
]

export const SCALES = [0.9, 1, 1.1, 1.25] as const

const LS_ACCENT = 'naum.ui.accent'
const LS_SCALE = 'naum.ui.scale'
export const UI_PREFS_EVENT = 'naum:uiprefs'

export function loadAccent(): string {
  try {
    const v = localStorage.getItem(LS_ACCENT)
    return ACCENTS.some((a) => a.id === v) ? (v as string) : 'blue'
  } catch {
    return 'blue'
  }
}

export function loadScale(): number {
  try {
    const v = Number(localStorage.getItem(LS_SCALE))
    return (SCALES as readonly number[]).includes(v) ? v : 1
  } catch {
    return 1
  }
}

/** 저장된 포인트 색상을 문서 CSS 변수에 적용(부팅·변경 시). */
export function applyAccent(id: string = loadAccent()): void {
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS[0]
  const st = document.documentElement.style
  st.setProperty('--info', a.info)
  st.setProperty('--info-bg', a.infoBg)
}

export function setAccent(id: string): void {
  try { localStorage.setItem(LS_ACCENT, id) } catch { /* ignore */ }
  applyAccent(id)
  window.dispatchEvent(new Event(UI_PREFS_EVENT))
}

export function setScale(v: number): void {
  try { localStorage.setItem(LS_SCALE, String(v)) } catch { /* ignore */ }
  window.dispatchEvent(new Event(UI_PREFS_EVENT))
}
