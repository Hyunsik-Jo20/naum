// 공식 특보·지진 경보를 공유 캐시로 조회하는 훅 — 여러 화면(콘솔·상단바·교육청)이 함께 써도 호출 1회.
//  · 모듈 캐시 + 10분 TTL. 마운트 시 캐시 즉시 반환하고 백그라운드 갱신.
//  · 실패 시 빈 배열(파생 경보만 표시, 무중단).
import { useEffect, useState } from 'react'
import { fetchOfficialAlerts, type DisasterAlert } from './disasters'

const TTL = 10 * 60 * 1000
let cache: DisasterAlert[] = []
let cachedAt = 0
let inflight: Promise<DisasterAlert[]> | null = null
const listeners = new Set<(a: DisasterAlert[]) => void>()

async function refresh(force = false): Promise<DisasterAlert[]> {
  if (!force && Date.now() - cachedAt < TTL) return cache
  if (inflight) return inflight
  inflight = fetchOfficialAlerts()
    .then((a) => {
      cache = a
      cachedAt = Date.now()
      listeners.forEach((l) => l(a))
      return a
    })
    .catch(() => cache)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** 공식 특보·지진 경보(비동기, 공유 캐시). */
export function useOfficialAlerts(): DisasterAlert[] {
  const [alerts, setAlerts] = useState<DisasterAlert[]>(cache)
  useEffect(() => {
    listeners.add(setAlerts)
    void refresh()
    const t = window.setInterval(() => void refresh(), TTL)
    return () => {
      listeners.delete(setAlerts)
      window.clearInterval(t)
    }
  }, [])
  return alerts
}
