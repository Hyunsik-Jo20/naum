// 담임교사 계정 — 학년/반으로 결정적 합성 이메일(교사가 이메일 없이 학년·반+비번으로 로그인).
//  · 서버(api/token.js)도 동일 규칙으로 이메일을 만든다(반드시 일치해야 로그인됨).
//  · 학교 식별자는 VITE_SCHOOL_ID(서버는 process.env.VITE_SCHOOL_ID) — 같은 값이어야 함.
const SCHOOL_ID = (import.meta.env.VITE_SCHOOL_ID as string | undefined) || 'demo'

export function teacherEmail(grade: number, classNo: number): string {
  return `t${grade}-${classNo}@${SCHOOL_ID}.naum.kr`
}
