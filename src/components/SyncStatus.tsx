// 상단바 동기화 상태 — 오프라인이거나 업로드 대기가 있을 때만 표시.
//  온라인 + 대기 0이면 조용히 숨김. supabase 모드에서만 의미.
import { useEffect, useState } from 'react'
import { pendingCount, deadCount, hasFailures, onChange, isOnline, flush } from '../data/offline'
import { SUPABASE_ENABLED } from '../data/supabaseClient'

export default function SyncStatus() {
  const [pending, setPending] = useState(() => pendingCount())
  const [dead, setDead] = useState(() => deadCount())
  const [failing, setFailing] = useState(() => hasFailures())
  const [online, setOnline] = useState(() => isOnline())

  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    const refresh = () => { setPending(pendingCount()); setDead(deadCount()); setFailing(hasFailures()) }
    const off = onChange(refresh)
    const goOn = () => { setOnline(true); refresh() }
    const goOff = () => setOnline(false)
    window.addEventListener('online', goOn)
    window.addEventListener('offline', goOff)
    const t = window.setInterval(refresh, 3000) // flush 진행분 반영
    return () => {
      off()
      window.removeEventListener('online', goOn)
      window.removeEventListener('offline', goOff)
      window.clearInterval(t)
    }
  }, [])

  if (!SUPABASE_ENABLED) return null
  if (online && pending === 0 && dead === 0) return null

  return (
    <span className={`sync-chip ${online ? (failing ? 'retry' : 'up') : 'off'}`} title="오프라인 데이터 대기열">
      {online ? (
        pending > 0 ? (
          <>
            <i className={`ti ${failing ? 'ti-refresh' : 'ti-cloud-up'}`} aria-hidden="true" />{' '}
            {failing ? '재시도 중' : '업로드'} {pending}건
            <button className="sync-go" onClick={() => void flush()}>지금</button>
          </>
        ) : (
          <>
            <i className="ti ti-alert-triangle" aria-hidden="true" /> 실패 {dead}건
          </>
        )
      ) : (
        <>
          <i className="ti ti-cloud-off" aria-hidden="true" /> 오프라인{pending ? ` · ${pending}건 대기` : ''}
        </>
      )}
    </span>
  )
}
