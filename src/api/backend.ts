// 나음 백엔드 클라이언트 — Vite 프록시로 로컬 스테이션(/station)·중앙 서버(/central)에 접근.
//  · 방문 생성(PII 포함)은 스테이션 경유 → 스테이션이 링크 로컬 저장 + 비식별 Visit만 중앙으로.
//  · 방문 수정(비식별만)은 중앙으로 직접.
//  · 실시간 동기화는 SSE(EventSource) — BroadcastChannel 대체(다중 기기 지원).
//  · 백엔드 미가동 시 available=false → 호출부가 기존 in-browser 동작으로 폴백.
import type { Visit } from '../types'

// 경로 prefix는 백엔드 라우트(/station/*, /central/*)에 이미 포함되어 있고
// Vite 프록시가 rewrite 없이 그대로 넘기므로, 여기 base는 비워 둔다(이중 prefix 방지).
const STATION = ''
const CENTRAL = ''

export type LinkMap = Record<string, string> // visitId → studentId

/** 한 health 엔드포인트가 "진짜 백엔드"인지 확인.
 *  - res.ok + JSON 본문에 {ok:true, service} 가 있어야 함.
 *  - 백엔드 미가동 시 프록시 미설정(프로덕션 정적호스팅)이면 SPA index.html(200/HTML)이 와서
 *    오탐할 수 있으므로 본문까지 검증한다.
 *  타임아웃은 넉넉히 — 부팅 시 외부 API 호출들과 동시연결 슬롯을 경합해 health가 잠시 밀릴 수 있다. */
async function probeOne(url: string, service: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return false
    const ct = r.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) return false
    const body = await r.json()
    return body?.ok === true && body?.service === service
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

/** 양쪽 서버(중앙·스테이션)가 모두 살아있는 진짜 백엔드인지 확인. */
export async function probeBackend(timeoutMs = 6000): Promise<boolean> {
  const [c, s] = await Promise.all([
    probeOne(`${CENTRAL}/central/health`, 'central', timeoutMs),
    probeOne(`${STATION}/station/health`, 'station', timeoutMs),
  ])
  return c && s
}

export async function fetchVisits(): Promise<Visit[]> {
  const r = await fetch(`${CENTRAL}/central/visits`)
  return r.ok ? r.json() : []
}

export async function fetchLinks(): Promise<LinkMap> {
  const r = await fetch(`${STATION}/station/links`)
  return r.ok ? r.json() : {}
}

/** 방문 생성: 스테이션이 링크를 로컬에 저장하고 비식별 visit만 중앙으로 전달. */
export async function createVisit(visit: Visit, studentId: string): Promise<void> {
  await fetch(`${STATION}/station/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visit, studentId }),
  })
}

/** 방문 수정(비식별 필드만) — 중앙으로 직접. PII가 섞이면 서버가 400으로 거부. */
export async function patchVisit(id: string, patch: Partial<Visit>): Promise<void> {
  await fetch(`${CENTRAL}/central/visits/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

/** 중앙 비식별 방문 변경 구독(SSE). 반환값은 구독 해제 함수. */
export function subscribeVisits(onVisit: (v: Visit) => void): () => void {
  const es = new EventSource(`${CENTRAL}/central/visits/stream`)
  es.addEventListener('visit', (e) => {
    try {
      onVisit(JSON.parse((e as MessageEvent).data))
    } catch {
      /* ignore */
    }
  })
  return () => es.close()
}

/** 스테이션 링크(visitId↔studentId) 변경 구독(SSE). */
export function subscribeLinks(onLink: (l: { visitId: string; studentId: string }) => void): () => void {
  const es = new EventSource(`${STATION}/station/links/stream`)
  es.addEventListener('link', (e) => {
    try {
      onLink(JSON.parse((e as MessageEvent).data))
    } catch {
      /* ignore */
    }
  })
  return () => es.close()
}
