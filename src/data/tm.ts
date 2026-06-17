// WGS84(위경도) → TM 좌표(EPSG:5181, GRS80 중부원점). 에어코리아 getNearbyMsrstnList용.
const a = 6378137.0
const f = 1 / 298.257222101
const e2 = f * (2 - f)
const ep2 = e2 / (1 - e2)
const k0 = 1
const FE = 200000
const FN = 500000
const lat0 = (38 * Math.PI) / 180
const lon0 = (127 * Math.PI) / 180

function mArc(phi: number): number {
  return (
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * phi))
  )
}

export function wgs84ToTM(lat: number, lon: number): { x: number; y: number } {
  const phi = (lat * Math.PI) / 180
  const lam = (lon * Math.PI) / 180
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const T = Math.tan(phi) ** 2
  const C = ep2 * Math.cos(phi) ** 2
  const A = (lam - lon0) * Math.cos(phi)
  const M = mArc(phi)
  const M0 = mArc(lat0)

  const x =
    FE +
    k0 *
      N *
      (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120)
  const y =
    FN +
    k0 *
      (M -
        M0 +
        N *
          Math.tan(phi) *
          ((A * A) / 2 +
            ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
            ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720))

  return { x: Math.round(x), y: Math.round(y) }
}
