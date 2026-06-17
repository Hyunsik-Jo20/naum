import { useEffect, useRef, useState } from 'react'
import { KAKAO_KEY, loadKakao } from '../data/kakaoLoader'

/** 카카오맵에서 클릭해 좌표(lat/lon)를 고르는 작은 지도. 클릭 위치에 마커 표시 + 좌표 콜백. */
export default function CoordPicker({
  lat,
  lon,
  onPick,
}: {
  lat: number | null
  lon: number | null
  onPick: (lat: number, lon: number) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<any>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(KAKAO_KEY ? 'loading' : 'error')

  useEffect(() => {
    if (!KAKAO_KEY) return
    let ok = true
    loadKakao(KAKAO_KEY)
      .then((kakao) => {
        if (!ok || !boxRef.current) return
        const center = new kakao.maps.LatLng(lat ?? 35.18, lon ?? 129.07)
        const map = new kakao.maps.Map(boxRef.current, { center, level: lat != null ? 4 : 8 })
        const marker = new kakao.maps.Marker({ position: center })
        if (lat != null && lon != null) marker.setMap(map)
        markerRef.current = marker
        kakao.maps.event.addListener(map, 'click', (e: any) => {
          const ll = e.latLng
          marker.setPosition(ll)
          marker.setMap(map)
          pickRef.current(Number(ll.getLat().toFixed(6)), Number(ll.getLng().toFixed(6)))
        })
        setStatus('ready')
      })
      .catch(() => ok && setStatus('error'))
    return () => {
      ok = false
    }
    // 최초 1회만 초기화 (이후 좌표 변경은 사용자 클릭으로 처리)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="coord-picker">
      {status === 'error' ? (
        <div className="coord-fallback">
          카카오 지도를 쓸 수 없어 좌표를 직접 입력해야 합니다. (VITE_KAKAO_JS_KEY 확인)
        </div>
      ) : (
        <>
          <div ref={boxRef} className="coord-map" />
          <div className="coord-foot">
            <i className="ti ti-map-pin" aria-hidden="true" />{' '}
            {lat != null && lon != null ? (
              <>선택: <b>{lat.toFixed(6)}, {lon.toFixed(6)}</b></>
            ) : (
              '지도를 클릭해 학교 위치를 선택하세요.'
            )}
            {status === 'loading' && ' · 지도 불러오는 중…'}
          </div>
        </>
      )}
    </div>
  )
}
