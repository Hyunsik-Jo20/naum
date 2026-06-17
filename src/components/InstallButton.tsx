// "앱 설치" 버튼 — 설치형 PWA로 기기에 추가(APK처럼 홈화면/바탕화면).
//  설치 가능할 때(브라우저가 beforeinstallprompt 발생)만 표시. 이미 설치됐으면 숨김.
import { useEffect, useState } from 'react'

type BIPEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true)
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || !deferred) return null

  return (
    <button
      className="btn ghost small"
      title="이 기기에 앱으로 설치(오프라인 사용 가능)"
      onClick={async () => {
        try {
          await deferred.prompt()
        } finally {
          setDeferred(null)
        }
      }}
    >
      <i className="ti ti-download" aria-hidden="true" /> 앱 설치
    </button>
  )
}
