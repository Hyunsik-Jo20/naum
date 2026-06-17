// 무라이브러리 .xlsx 리더 — 브라우저 DecompressionStream으로 zip 해제 + XML 파싱.
// 첫 워크시트를 2차원 문자열 배열로 반환. (구형 바이너리 .xls는 미지원 → CSV/xlsx 안내)

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as unknown as { DecompressionStream: typeof DecompressionStream }).DecompressionStream(
    'deflate-raw',
  )
  const writer = ds.writable.getWriter()
  void writer.write(bytes as unknown as BufferSource)
  void writer.close()
  const ab = await new Response(ds.readable).arrayBuffer()
  return new Uint8Array(ab)
}

interface ZipEntry { method: number; offset: number; compSize: number }

/** zip 중앙 디렉터리를 읽어 이름→엔트리 메타 맵 생성. */
function readCentralDir(view: DataView, bytes: Uint8Array): Map<string, ZipEntry> {
  const map = new Map<string, ZipEntry>()
  // End Of Central Directory (0x06054b50) 를 뒤에서 탐색
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip EOCD 없음')
  let p = view.getUint32(eocd + 16, true) // central dir offset
  const count = view.getUint16(eocd + 10, true)
  const dec = new TextDecoder('utf-8')
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    map.set(name, { method, offset: localOffset, compSize })
    p += 46 + nameLen + extraLen + commentLen
  }
  return map
}

async function readEntry(view: DataView, bytes: Uint8Array, e: ZipEntry): Promise<string> {
  // 로컬 헤더에서 실제 데이터 시작 위치 계산
  if (view.getUint32(e.offset, true) !== 0x04034b50) throw new Error('zip local header 불일치')
  const nameLen = view.getUint16(e.offset + 26, true)
  const extraLen = view.getUint16(e.offset + 28, true)
  const start = e.offset + 30 + nameLen + extraLen
  const data = bytes.subarray(start, start + e.compSize)
  const out = e.method === 0 ? data : await inflateRaw(data)
  return new TextDecoder('utf-8').decode(out)
}

function colToIndex(ref: string): number {
  const m = ref.match(/^[A-Z]+/)
  if (!m) return 0
  let n = 0
  for (const ch of m[0]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function textOf(el: Element | null): string {
  if (!el) return ''
  // 공유문자열의 <si>는 여러 <t>(서식 런)로 나뉠 수 있음 → 합침
  const ts = el.getElementsByTagName('t')
  if (ts.length) return Array.from(ts).map((t) => t.textContent ?? '').join('')
  return el.textContent ?? ''
}

export async function readXlsxFirstSheet(buf: ArrayBuffer): Promise<string[][]> {
  if (typeof (globalThis as { DecompressionStream?: unknown }).DecompressionStream === 'undefined') {
    throw new Error('이 브라우저는 엑셀 직접 읽기를 지원하지 않습니다. CSV로 올려주세요.')
  }
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)
  const dir = readCentralDir(view, bytes)

  // 공유 문자열
  let shared: string[] = []
  const sstEntry = dir.get('xl/sharedStrings.xml')
  if (sstEntry) {
    const xml = await readEntry(view, bytes, sstEntry)
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    shared = Array.from(doc.getElementsByTagName('si')).map((si) => textOf(si))
  }

  // 첫 워크시트
  const sheetName =
    [...dir.keys()].includes('xl/worksheets/sheet1.xml')
      ? 'xl/worksheets/sheet1.xml'
      : [...dir.keys()].filter((k) => /^xl\/worksheets\/sheet.*\.xml$/.test(k)).sort()[0]
  if (!sheetName) throw new Error('워크시트를 찾지 못했습니다.')
  const sheetXml = await readEntry(view, bytes, dir.get(sheetName)!)
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml')

  const rows: string[][] = []
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells = Array.from(row.getElementsByTagName('c'))
    const arr: string[] = []
    for (const c of cells) {
      const ref = c.getAttribute('r') ?? ''
      const ci = ref ? colToIndex(ref) : arr.length
      const t = c.getAttribute('t')
      let val = ''
      if (t === 's') {
        const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
        val = shared[Number(v)] ?? ''
      } else if (t === 'inlineStr') {
        val = textOf(c.getElementsByTagName('is')[0] ?? null)
      } else {
        val = c.getElementsByTagName('v')[0]?.textContent ?? c.getElementsByTagName('t')[0]?.textContent ?? ''
      }
      while (arr.length < ci) arr.push('')
      arr[ci] = val
    }
    rows.push(arr)
  }
  return rows
}
