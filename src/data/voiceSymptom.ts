// 키오스크 음성 입력 — 브라우저 내장 Web Speech API(ko-KR)로 학생 발화를 듣고
//  증상 타일 키워드에 매핑한다. 인식 텍스트는 어디에도 저장하지 않음(매칭에만 사용) —
//  비식별 원칙 유지, PII 저장 경로 없음. HTTPS(또는 localhost)에서만 동작.
import { symptomTiles } from './mock'

// 기본 타일 동의어 — 저학년 구어 표현 위주. 커스텀 타일은 라벨 어근으로 매칭.
const SYNONYMS: Record<string, string[]> = {
  hurt: ['다쳤', '다침', '넘어졌', '넘어져', '부딪', '긁혔', '긁혀', '베였', '베어', '찢어졌', '멍들', '상처', '피가 나', '피났'],
  tummy: ['배가', '배 아', '뱃속', '속이 안', '속이 이상', '토할', '토했', '메스껍', '구역질', '설사', '체했', '체한'],
  head: ['머리', '두통'],
  fever: ['열이', '열나', '뜨거', '오한', '으슬'],
  dizzy: ['어지러', '어질어질', '핑 돌', '빙글'],
  nose: ['코피'],
  limb: ['팔이', '팔 아', '다리', '무릎', '발목', '손목', '손가락', '발가락', '삐었', '삐어', '접질', '쥐났', '쥐 났'],
  eye: ['눈이', '눈 아', '눈에'],
  unknown: ['모르겠'],
}

const squash = (s: string) => s.replace(/\s+/g, '')

/** 타일 라벨에서 서술 어미를 뗀 어근("코피 나요"→"코피"). 2자 미만이면 라벨 그대로만. */
function labelRoots(label: string): string[] {
  const l = label.trim()
  const r = l.replace(/\s*(이|가)?\s*(아파요|아퍼요|아프다|나요|났어요|나와요|해요|겠어요|어요)$/u, '').trim()
  return r.length >= 2 && r !== l ? [l, r] : [l]
}

/** 발화 텍스트에서 해당되는 증상 타일 id 목록을 찾는다(순서는 타일 순). */
export function matchSymptomTiles(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  const ts = squash(t)
  return symptomTiles
    .filter((tile) => {
      // "코피가 나요"의 '피가 나'가 다침으로 오탐되지 않게 — 다침 검사는 '코피'를 뺀 텍스트로
      const base = tile.id === 'hurt' ? t.replace(/코피/g, '') : t
      const bs = tile.id === 'hurt' ? squash(base) : ts
      const keys = [...(SYNONYMS[tile.id] ?? []), ...labelRoots(tile.label)]
      return keys.some((k) => base.includes(k) || bs.includes(squash(k)))
    })
    .map((tile) => tile.id)
}

type SR = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}

function getRecognizer(): SR | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

export function voiceSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition)
}

export type VoiceOutcome =
  | { kind: 'heard'; text: string }
  | { kind: 'silent' } // 아무 말도 인식 못 함(침묵 타임아웃)
  | { kind: 'denied' } // 마이크 권한 거부/차단
  | { kind: 'unsupported' }
  | { kind: 'error' }

/** 한 번 듣고 결과를 돌려준다(저장 없음). 취소하려면 반환된 abort()를 호출. */
export function listenOnce(onDone: (r: VoiceOutcome) => void): () => void {
  const rec = getRecognizer()
  if (!rec) {
    onDone({ kind: 'unsupported' })
    return () => {}
  }
  let settled = false
  const settle = (r: VoiceOutcome) => {
    if (!settled) {
      settled = true
      onDone(r)
    }
  }
  rec.lang = 'ko-KR'
  rec.interimResults = false
  rec.maxAlternatives = 1
  rec.onresult = (e) => settle({ kind: 'heard', text: e.results[0][0].transcript ?? '' })
  rec.onerror = (e) =>
    settle(
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? { kind: 'denied' }
        : e.error === 'no-speech'
          ? { kind: 'silent' }
          : { kind: 'error' },
    )
  rec.onend = () => settle({ kind: 'silent' })
  try {
    rec.start()
  } catch {
    settle({ kind: 'error' })
  }
  return () => {
    settled = true
    try {
      rec.abort()
    } catch {
      /* ignore */
    }
  }
}
