// AI 답변 표시 — 모델이 돌려준 마크다운을 최소한으로 사람이 읽을 형태로 그린다.
//  왜: <pre>로 날것을 보여 주니 "**## 의심 상황**", "*1순위*" 같은 기호가 그대로 노출되고
//     중첩 목록이 계단처럼 밀려 읽기 어려웠다(2026-09-22 실사용 화면에서 확인).
//  라이브러리를 새로 넣지 않고, 쓰이는 문법(제목·굵게·목록)만 직접 처리한다.
//  HTML은 만들지 않고 React 엘리먼트로만 조립한다 — 모델 출력이 그대로 DOM이 되면 안 되므로.
import { Fragment, type ReactNode } from 'react'

/** **굵게** · *기울임* 처리 후, 짝이 안 맞아 남은 별표는 지운다.
 *  (모델이 "**## 제목**:", "*1순위*:" 처럼 기호를 섞어 내보내는 일이 잦다.) */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)(?<!\s)\*/g
  const strip = (t: string) => t.replace(/\*+/g, '')
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(strip(text.slice(last, m.index)))
    out.push(
      m[1] != null
        ? <b key={`${keyBase}-b${i++}`}>{strip(m[1])}</b>
        : <i key={`${keyBase}-i${i++}`}>{strip(m[2])}</i>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(strip(text.slice(last)))
  return out
}

/** 줄 앞의 목록 기호(-, *, •, 1.)와 들여쓰기 깊이를 떼어 낸다. */
function bullet(line: string): { depth: number; text: string } | null {
  const m = /^(\s*)(?:[-*•]|\d+\.)\s+(.*)$/.exec(line)
  if (!m) return null
  return { depth: Math.min(2, Math.floor(m[1].length / 2)), text: m[2] }
}

export default function AiAnswer({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const nodes: ReactNode[] = []

  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    if (!line.trim()) { nodes.push(<div key={`sp${i}`} className="ai-md-gap" />); return }

    // 제목 — "## 한 줄 판단", 목록 안에 섞여 들어온 "* **## 의심 상황**"도 제목으로 본다
    const h = /^\s*(?:[-*•]\s*)?\**\s*(#{1,4})\s*(.+?)\s*\**\s*[:：]?\s*$/.exec(line)
    if (h) {
      nodes.push(
        <div key={`h${i}`} className={`ai-md-h ai-md-h${h[1].length}`}>{inline(h[2], `h${i}`)}</div>,
      )
      return
    }

    const b = bullet(line)
    if (b) {
      nodes.push(
        <div key={`li${i}`} className="ai-md-li" style={{ paddingLeft: 10 + b.depth * 14 }}>
          <span className="ai-md-dot" aria-hidden="true">·</span>
          <span>{inline(b.text, `li${i}`)}</span>
        </div>,
      )
      return
    }

    nodes.push(<div key={`p${i}`} className="ai-md-p">{inline(line, `p${i}`)}</div>)
  })

  return <div className="ai-md">{nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</div>
}
