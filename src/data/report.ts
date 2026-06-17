// 보고서 다운로드 — 외부 라이브러리 없이 Word(.doc)·PDF(인쇄창)로 내보낸다.
// Word: HTML을 application/msword Blob으로 저장(워드에서 열림).
// PDF: 새 창에 보고서만 렌더 후 인쇄 → 사용자가 "PDF로 저장".

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 보고서 본문(텍스트)을 문서 HTML로 변환. 줄바꿈·소제목 보존. */
export function reportHtml(title: string, subtitle: string, body: string): string {
  const paragraphs = body
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t) return '<div style="height:8px"></div>'
      // 소제목 휴리스틱: 'n.' '①' '■' '[' 로 시작하거나 '요약'/'보고' 포함 + 짧은 줄
      const isHead = /^(\s*[①-⑩■◆▶]|\s*\d+[.)]|\[)/.test(line) || (t.length < 24 && /(요약|동향|결과|조치|날씨|보고)/.test(t) && !t.endsWith('.'))
      if (isHead) return `<h3 style="font-size:14px;margin:14px 0 4px;color:#185fa5">${escapeHtml(t)}</h3>`
      return `<p style="font-size:13px;line-height:1.7;margin:2px 0">${escapeHtml(t)}</p>`
    })
    .join('\n')
  return (
    `<div style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#1f1f1c;max-width:720px;margin:0 auto;padding:24px">` +
    `<div style="border-bottom:2px solid #185fa5;padding-bottom:10px;margin-bottom:16px">` +
    `<div style="font-size:20px;font-weight:700">${escapeHtml(title)}</div>` +
    `<div style="font-size:12px;color:#5f5e5a;margin-top:4px">${escapeHtml(subtitle)}</div>` +
    `</div>${paragraphs}` +
    `<div style="margin-top:24px;font-size:11px;color:#8a8980;border-top:0.5px solid #ccc;padding-top:8px">` +
    `나음(NaUM) 보건실 디지털 전환 플랫폼 · 비식별 집계 기반 자동 생성 보고서</div>` +
    `</div>`
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Word(.doc) 다운로드 */
export function downloadWord(filename: string, title: string, subtitle: string, body: string) {
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
    `<body>${reportHtml(title, subtitle, body)}</body></html>`
  triggerDownload(new Blob(['﻿' + html], { type: 'application/msword' }), filename)
}

/** PDF — 새 창에 보고서만 띄우고 인쇄 다이얼로그 호출(사용자가 PDF로 저장) */
export function printPdf(title: string, subtitle: string, body: string) {
  const win = window.open('', '_blank', 'width=840,height=900')
  if (!win) {
    alert('팝업이 차단되어 PDF 창을 열 수 없습니다. 팝업 허용 후 다시 시도하세요.')
    return
  }
  win.document.write(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<style>@media print{@page{margin:16mm}} body{margin:0}</style></head>` +
    `<body>${reportHtml(title, subtitle, body)}` +
    `<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>` +
    `</body></html>`,
  )
  win.document.close()
}
