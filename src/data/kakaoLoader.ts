// 카카오맵 JS SDK 동적 로더 (지도·좌표선택 공용)
export const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined

export function loadKakao(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any
    if (w.kakao && w.kakao.maps) return resolve(w.kakao)
    const ready = () => w.kakao.maps.load(() => resolve(w.kakao))
    const existing = document.getElementById('kakao-sdk') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', ready)
      existing.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    s.id = 'kakao-sdk'
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=clusterer`
    s.onload = ready
    s.onerror = reject
    document.head.appendChild(s)
  })
}
