// 담임교사 계정 — 학년/반으로 결정적 합성 이메일(교사가 이메일 없이 학년·반+비번으로 로그인).
//  · 서버(api/token.js)도 동일 규칙으로 이메일을 만든다(반드시 일치해야 로그인됨).
//  · 학교 식별자(멀티테넌트) = 이 기기에 바인딩된 학교(naum.school). 서버는 토큰의 sch를 쓴다.
import { schoolId } from './school'

export function teacherEmail(grade: number, classNo: number, sch: string = schoolId()): string {
  return `t${grade}-${classNo}@${sch}.naum.kr`
}
