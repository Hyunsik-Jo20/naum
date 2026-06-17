import { useEffect, useRef, useState } from 'react'
import { schoolTotal, type EduSchool } from '../data/eduMock'
import type { SchoolLevel } from '../data/busanSchools'
import { KAKAO_KEY as KEY, loadKakao } from '../data/kakaoLoader'

// 학교급별 색상
const LEVEL_COLOR: Record<SchoolLevel, string> = {
  초: '#185fa5',
  중: '#1d9e75',
  고: '#534ab7',
  특: '#ba7517',
  기타: '#888780',
}

function pinImage(kakao: any, color: string) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='32'>` +
    `<path d='M11 0C4.9 0 0 4.9 0 11c0 7.5 11 21 11 21s11-13.5 11-21C22 4.9 17.1 0 11 0z' fill='${color}'/>` +
    `<circle cx='11' cy='11' r='4' fill='#fff'/></svg>`
  return new kakao.maps.MarkerImage(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    new kakao.maps.Size(22, 32),
    { offset: new kakao.maps.Point(11, 32) },
  )
}

function starImage(kakao: any) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'>` +
    `<path d='M15 1 L18.9 11.3 L29.5 11.5 L21 18 L24.2 28.5 L15 22 L5.8 28.5 L9 18 L0.5 11.5 L11.1 11.3 Z' ` +
    `fill='#a32d2d' stroke='#fff' stroke-width='1.3'/></svg>`
  return new kakao.maps.MarkerImage(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    new kakao.maps.Size(30, 30),
    { offset: new kakao.maps.Point(15, 15) },
  )
}

export interface AirAlert {
  label: string // '나쁨' | '매우나쁨'
  color: string // rgba (반투명)
  pm25: number
}

export default function SchoolMap({
  schools,
  onSelect,
  airAlert,
}: {
  schools: EduSchool[]
  onSelect?: (s: EduSchool) => void
  airAlert?: AirAlert | null
}) {
  if (!KEY) {
    return (
      <div className="map-box">
        <div className="map-overlay" style={{ position: 'static', height: 300 }}>
          카카오 JavaScript 키(<code>VITE_KAKAO_JS_KEY</code>)를 설정하면 지도가 표시됩니다.
        </div>
      </div>
    )
  }
  return <KakaoView schools={schools} onSelect={onSelect} airAlert={airAlert} />
}

function KakaoView({
  schools,
  onSelect,
  airAlert,
}: {
  schools: EduSchool[]
  onSelect?: (s: EduSchool) => void
  airAlert?: AirAlert | null
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const infoRef = useRef<any>(null)
  const clustererRef = useRef<any>(null)
  const anomalyRef = useRef<any[]>([])
  const imgRef = useRef<{ pins: Record<string, any>; star: any } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let ok = true
    loadKakao(KEY as string)
      .then((kakao) => {
        if (!ok || !boxRef.current) return
        mapRef.current = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(35.18, 129.07),
          level: 9,
        })
        infoRef.current = new kakao.maps.InfoWindow({ removable: true })
        clustererRef.current = new kakao.maps.MarkerClusterer({
          map: mapRef.current,
          averageCenter: true,
          minLevel: 6,
        })
        const pins: Record<string, any> = {}
        ;(['초', '중', '고', '특', '기타'] as SchoolLevel[]).forEach((lv) => {
          pins[lv] = pinImage(kakao, LEVEL_COLOR[lv])
        })
        imgRef.current = { pins, star: starImage(kakao) }
        setStatus('ready')
      })
      .catch(() => ok && setStatus('error'))
    return () => {
      ok = false
    }
  }, [])

  useEffect(() => {
    const w = window as any
    if (status !== 'ready' || !w.kakao || !imgRef.current) return
    const kakao = w.kakao
    const map = mapRef.current

    clustererRef.current.clear()
    anomalyRef.current.forEach((m) => m.setMap(null))
    anomalyRef.current = []

    const normals: any[] = []
    schools.forEach((s) => {
      const pos = new kakao.maps.LatLng(s.lat, s.lon)
      const image = s.anomaly ? imgRef.current!.star : imgRef.current!.pins[s.level]
      const marker = new kakao.maps.Marker({ position: pos, image, title: s.name })
      kakao.maps.event.addListener(marker, 'click', () => {
        const html =
          `<div style="padding:8px 10px;font-size:12px;line-height:1.5;min-width:130px">` +
          `<b>${s.name}</b> <span style="color:#888">${s.level}·${s.region}</span><br/>총 ${schoolTotal(s)}건` +
          (s.anomaly ? `<br/><span style="color:#a32d2d">⚠ ${s.anomaly}</span>` : '') +
          `</div>`
        infoRef.current.setContent(html)
        infoRef.current.open(map, marker)
        onSelect?.(s)
      })
      if (s.anomaly) {
        marker.setMap(map) // 이상 신호: 군집에서 제외하고 항상 표시
        anomalyRef.current.push(marker)
      } else {
        normals.push(marker)
      }
    })
    clustererRef.current.addMarkers(normals)
  }, [schools, status])

  return (
    <div className="map-wrap">
      <div ref={boxRef} className="kakao-map" />
      {airAlert && (
        <div className="air-overlay" style={{ background: airAlert.color }}>
          <span className="air-badge">
            <i className="ti ti-alert-triangle" aria-hidden="true" /> 초미세먼지 {airAlert.label} · PM2.5 {airAlert.pm25}
          </span>
        </div>
      )}
      {status === 'loading' && <div className="map-overlay">지도를 불러오는 중…</div>}
      {status === 'error' && (
        <div className="map-overlay">
          지도를 불러오지 못했어요. JS 키 / 도메인(localhost:5173) 등록을 확인하세요.
        </div>
      )}
      <div className="map-legend" style={{ position: 'static', marginTop: 8, flexWrap: 'wrap' }}>
        <span><b style={{ color: LEVEL_COLOR['초'] }}>●</b> 초</span>
        <span><b style={{ color: LEVEL_COLOR['중'] }}>●</b> 중</span>
        <span><b style={{ color: LEVEL_COLOR['고'] }}>●</b> 고</span>
        <span><b style={{ color: LEVEL_COLOR['특'] }}>●</b> 특</span>
        <span><b style={{ color: LEVEL_COLOR['기타'] }}>●</b> 기타</span>
        <span><b style={{ color: '#a32d2d' }}>★</b> 이상 신호</span>
        <span className="muted">마커 클릭 → 학교 요약</span>
      </div>
    </div>
  )
}
