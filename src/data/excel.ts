// 외부 라이브러리 없이 다중 시트 엑셀 생성 — SpreadsheetML 2003 (.xls, Excel이 시트 탭으로 엶).
export type CellValue = string | number

// ── 단순 표(행 기반) API ──
export interface SheetSpec {
  name: string
  rows: CellValue[][]
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 시트명 제약: 31자, \ / ? * [ ] : 금지
function safeSheetName(name: string, idx: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return cleaned || `Sheet${idx + 1}`
}

function dataXml(v: CellValue): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<Data ss:Type="Number">${v}</Data>`
  }
  return `<Data ss:Type="String">${escapeXml(String(v))}</Data>`
}

export function buildSpreadsheetML(sheets: SheetSpec[]): string {
  const body = sheets
    .map((sh, i) => {
      const rows = sh.rows.map((r) => `<Row>${r.map((v) => `<Cell>${dataXml(v)}</Cell>`).join('')}</Row>`).join('')
      return `<Worksheet ss:Name="${escapeXml(safeSheetName(sh.name, i))}"><Table>${rows}</Table></Worksheet>`
    })
    .join('')
  return wrap(body, '')
}

export function downloadExcel(filename: string, sheets: SheetSpec[]) {
  download(filename, buildSpreadsheetML(sheets))
}

// ── 위치/병합/스타일 기반 API (양식 재현용) ──
export type StyleId =
  | 'title' | 'box' | 'boxStamp' | 'sec' | 'secText' | 'hdr' | 'cell' | 'cellL' | 'cellShrink'
  | 'cat' | 'num' | 'vlabel' | 'date'

export interface XCell {
  col: number // 1-based 절대 열
  value?: CellValue
  across?: number // 가로 병합(MergeAcross)
  down?: number // 세로 병합(MergeDown)
  style?: StyleId
}

export interface XRow {
  row: number // 1-based 절대 행
  cells: XCell[]
  height?: number // 행 높이(px)
}

export interface XSheet {
  name: string
  rows: XRow[]
  colWidth?: number // 전체 균일 열 너비(px)
  colCount?: number
  colBreaks?: number[] // 열 페이지 나누기 위치(1-based 열) — 해당 열 앞에서 페이지 분할
  printScale?: number // 인쇄 배율(%)
  fitWide?: number // 가로 N페이지에 맞춤(FitToPage) — 지정 시 배율 무시
  fitTall?: number // 세로 N페이지(기본 1)
}

const BORDER =
  '<Borders>' +
  ['Top', 'Bottom', 'Left', 'Right']
    .map((p) => `<Border ss:Position="${p}" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#9a9a94"/>`)
    .join('') +
  '</Borders>'

function styleBlock(): string {
  const C = 'ss:Horizontal="Center" ss:Vertical="Center"'
  return (
    '<Styles>' +
    `<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="맑은 고딕" ss:Size="9"/></Style>` +
    `<Style ss:ID="title"><Alignment ${C}/><Font ss:FontName="맑은 고딕" ss:Bold="1" ss:Size="18"/></Style>` +
    `<Style ss:ID="box">${BORDER}<Alignment ${C}/><Font ss:FontName="맑은 고딕" ss:Size="9"/></Style>` +
    `<Style ss:ID="boxStamp">${BORDER}<Alignment ${C}/></Style>` +
    `<Style ss:ID="sec">${BORDER}<Alignment ${C}/><Font ss:FontName="맑은 고딕" ss:Bold="1" ss:Size="9"/><Interior ss:Color="#EFEDE6" ss:Pattern="Solid"/></Style>` +
    `<Style ss:ID="secText">${BORDER}<Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="맑은 고딕" ss:Size="9"/></Style>` +
    `<Style ss:ID="hdr">${BORDER}<Alignment ${C} ss:WrapText="1"/><Font ss:FontName="맑은 고딕" ss:Bold="1" ss:Size="9"/><Interior ss:Color="#F1EFE8" ss:Pattern="Solid"/></Style>` +
    `<Style ss:ID="cell">${BORDER}<Alignment ${C} ss:WrapText="1"/></Style>` +
    `<Style ss:ID="cellL">${BORDER}<Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/></Style>` +
    `<Style ss:ID="cellShrink">${BORDER}<Alignment ${C} ss:ShrinkToFit="1"/></Style>` +
    `<Style ss:ID="cat">${BORDER}<Alignment ${C} ss:WrapText="1"/><Font ss:FontName="맑은 고딕" ss:Bold="1" ss:Size="8"/><Interior ss:Color="#F1EFE8" ss:Pattern="Solid"/></Style>` +
    `<Style ss:ID="num">${BORDER}<Alignment ${C}/></Style>` +
    `<Style ss:ID="vlabel">${BORDER}<Alignment ${C} ss:WrapText="1"/><Font ss:FontName="맑은 고딕" ss:Bold="1" ss:Size="9"/><Interior ss:Color="#EFEDE6" ss:Pattern="Solid"/></Style>` +
    `<Style ss:ID="date">${BORDER}<Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="맑은 고딕" ss:Bold="1" ss:Size="10"/></Style>` +
    '</Styles>'
  )
}

function cellXml(c: XCell): string {
  const attrs = [`ss:Index="${c.col}"`]
  if (c.style) attrs.push(`ss:StyleID="${c.style}"`)
  if (c.across) attrs.push(`ss:MergeAcross="${c.across}"`)
  if (c.down) attrs.push(`ss:MergeDown="${c.down}"`)
  const data = c.value === undefined || c.value === '' ? '' : dataXml(c.value)
  return `<Cell ${attrs.join(' ')}>${data}</Cell>`
}

function worksheetXml(sh: XSheet, idx: number): string {
  const cols =
    sh.colWidth && sh.colCount
      ? `<Column ss:AutoFitWidth="0" ss:Width="${sh.colWidth}" ss:Span="${sh.colCount - 1}"/>`
      : ''
  const rows = sh.rows
    .map((r) => {
      const h = r.height ? ` ss:Height="${r.height}" ss:AutoFitHeight="0"` : ''
      return `<Row ss:Index="${r.row}"${h}>${r.cells.map(cellXml).join('')}</Row>`
    })
    .join('')
  const opts = printOptions(sh)
  const breaks =
    sh.colBreaks && sh.colBreaks.length
      ? `<PageBreaks xmlns="urn:schemas-microsoft-com:office:excel"><ColBreaks>${sh.colBreaks
          .map((c) => `<ColBreak><Column>${c}</Column></ColBreak>`)
          .join('')}</ColBreaks></PageBreaks>`
      : ''
  return `<Worksheet ss:Name="${escapeXml(safeSheetName(sh.name, idx))}"><Table>${cols}${rows}</Table>${opts}${breaks}</Worksheet>`
}

function printOptions(sh: XSheet): string {
  const fit = sh.fitWide ? `<FitWidth>${sh.fitWide}</FitWidth><FitHeight>${sh.fitTall ?? 1}</FitHeight>` : ''
  const scale = !sh.fitWide && sh.printScale ? `<Scale>${sh.printScale}</Scale>` : ''
  if (!fit && !scale) return ''
  return (
    `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">` +
    `<PageSetup><Layout x:Orientation="Portrait" x:CenterHorizontal="1"/>` +
    // 사용자 지정 여백 기본값: 좌우 1.9cm(≈0.748in)이면 하루가 페이지 폭에 맞아 1일 1페이지로 출력됨
    `<PageMargins x:Bottom="0.4" x:Left="0.748" x:Right="0.748" x:Top="0.4" x:Header="0.2" x:Footer="0.2"/></PageSetup>` +
    (fit ? '<FitToPage/>' : '') +
    `<Print><ValidPrinterInfo/><PaperSizeIndex>9</PaperSizeIndex>${fit}${scale}` +
    `<HorizontalResolution>600</HorizontalResolution><VerticalResolution>600</VerticalResolution></Print>` +
    `<DoNotDisplayGridlines/>` +
    `</WorksheetOptions>`
  )
}

export function buildSpreadsheetMLX(sheets: XSheet[]): string {
  return wrap(sheets.map(worksheetXml).join(''), styleBlock())
}

export function downloadExcelX(filename: string, sheets: XSheet[]) {
  download(filename, buildSpreadsheetMLX(sheets))
}

// ── 공통 ──
function wrap(body: string, styles: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"` +
    ` xmlns:o="urn:schemas-microsoft-com:office:office"` +
    ` xmlns:x="urn:schemas-microsoft-com:office:excel"` +
    ` xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    styles +
    body +
    `</Workbook>`
  )
}

function download(filename: string, xml: string) {
  const blob = new Blob(['﻿' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`
  a.click()
  URL.revokeObjectURL(url)
}
