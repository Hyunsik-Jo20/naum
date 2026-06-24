# 나음(NaUM) — 다음 세션 이어가기 (핸드오프)

> **새 세션은 이 파일부터 읽으세요.** 상세 이력은 [PROGRESS.md](PROGRESS.md), 배포·계정은 [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
> 최종 업데이트: 2026-06-24

## 0. 한 줄 요약
보건실 디지털 전환 플랫폼. 학생 키오스크 셀프접수 → 보건교사 콘솔 처치 → 담임·학부모 알림 → 교육청 비식별 대시보드.
**개인정보(이름·반·번호)는 로컬/암호문으로만, 클라우드(서버)에는 비식별 데이터만.**

## 1. 배포·저장소 현황 (라이브)
- **GitHub**: https://github.com/Hyunsik-Jo20/naum (`main`) — 코드 수정 후 `git push` 하면 Vercel 자동 재배포.
- **Vercel(라이브)**: https://naum-kappa.vercel.app
- **Supabase 프로젝트 ref**: `uavnprbozrearwzxfyrq` (Seoul). 키/URL은 대시보드 Project Settings→API.
- **작업 폴더**: `C:\Users\user\OneDrive\Documents\naum` (cwd는 bs-connect2지만 이 프로젝트는 별도)
- git 인증: 이전 세션에서 GCM 저장됨 → `git push` 바로 됨.

## 2. 동작 모드 (환경변수 분기)
| 모드 | 조건 | 용도 |
|---|---|---|
| **supabase**(클라우드) | `.env.local`/Vercel에 `VITE_SUPABASE_URL`+`ANON_KEY` 있음 | 실배포 |
| backend(Node) | `npm run server` | dev 전용 |
| **local**(in-browser) | 위 둘 없음 | 연수 데모(키 빼면 자동) |
- `.env.local`(git 제외)에 Supabase·날씨·카카오 키 + **`VITE_SCHOOL_LINK_SECRET`**(relay·암호화 링크·로그인토큰의 학교 공유 비밀, **로컬=Vercel 동일해야 함**) 들어있음.

## 3. 로그인 / 계정 체계
- **교육청 → 보건교사 가입토큰 발급** → 보건교사 **회원가입(이메일+비번)** → 보건교사가 **교사·학부모 토큰 발급** → 교사·학부모 **토큰 로그인**(Supabase 계정 불필요, 로컬 토큰 세션).
- 보건교사·교육청 = 이메일+비밀번호(Supabase Auth). "로그인 상태 유지" 체크박스(기본 ON).
- **데모 계정**(비번 `123456`): `nurse@naum.kr` / `teacher@naum.kr`(1-1담임) / `parent@naum.kr`(장지호) / `edu@naum.kr`. 로그인 화면 "데모 빠른 로그인" 버튼.
- 학교명 = **테스트초등학교**(연수용, `data/location.ts`). 데모 명부 그대로 사용.

## 4. 구현 완료 기능 (이번까지)
- 키오스크 셀프접수(학반행렬·증상타일, 5열 남/여 분리, 접수완료 3초 자동복귀)
- 보건교사 콘솔: 대기/처치/완료 3열(**대기=파스텔주황·완료=파스텔파랑** 배경), 키오스크 새탭 버튼
- **AI 병명·처치 추천**(`aiTriage`, 증상만 전송, 감염병 경고, 기본처치3, 기타 Enter) + AI 설정창(키·**편집가능 프롬프트**)
- **체온 측정 모달**(±0.3 점프 + 3연속값 0.1 미세) → "체온 측정 37.5℃"
- **관찰 결과**: 10분단위 시간선택 → 완료패널 "관찰 중·남은분" → 종료 시 깜빡임+"교실 복귀 →" 클릭 시 교실복귀 전환 + 담임 추가알림
- **방문 삭제**(대기 ✕ / 처치 삭제버튼), **콘솔 일일 초기화**(오늘 건만 표시)
- **학부모/담임 알림 구조화**(`notifyText.buildParentMessage/buildTeacherLine`: 증상·병명·처치·결과)
- **다기기 이름복원**(암호화 링크 `visit_links`), **relay 클라우드**(토큰+암호문, 교사 반키·학부모 학생키 복호화)
- **오프라인 + 설치형 PWA**(서비스워커 앱셸 캐시 + 아웃박스 큐 재연결 업로드 + "앱 설치" 버튼)
- 교육청 대시보드(지도·KPI·감염병 조기탐지·AI보고), **학교 설정 영구저장**(`app_state`)·추가학교 **"임시" 표시**
- 교장 보고(일일 자동마감·보건일지 엑셀)

## 5. ⚠️ Supabase 마이그레이션 실행 상태 (SQL Editor에서 실행)
`supabase/migrations/` 순서대로. **새 세션 시작 시 0006·0007 적용 여부 먼저 확인**(미적용이면 해당 기능이 클라우드 영속 안 됨, graceful fallback).
| 파일 | 내용 | 상태 |
|---|---|---|
| 0001_init | profiles·visits·relay + RLS | ✅ 적용 |
| 0002_fix_policies | RLS 보정 | ✅ 적용 |
| 0003_links_relay | visit_links + relay 정책 | ✅ 적용 |
| 0004_relay_anon_select | 토큰로그인(anon) relay 조회 | ✅ 적용 |
| 0005_app_state | 학교설정 공유저장 | ✅ 적용(테이블 존재 확인) |
| 0006_visit_observe | `observe_until` 컬럼(관찰) | ❌ **미적용(확인됨) — 실행 필요** |
| 0007_visit_delete | 방문 삭제 RLS | ❌ **미적용 추정 — 실행 필요**(0006과 함께) |

> 2026-06-24 확인: 0006 미적용(관찰 종료시각이 클라우드에 저장 안 됨), 0007도 미적용 추정(삭제가 새로고침 시 되살아남). **0006·0007을 SQL Editor에서 실행하면 관찰·삭제가 완전 동작.**

## 6. 실행/빌드
```
cd C:\Users\user\OneDrive\Documents\naum
npm install
npm run dev        # 로컬(.env.local의 supabase 키 있으면 클라우드 모드)
npm run build      # tsc + vite + PWA (배포 전 항상 통과 확인)
git push           # → Vercel 자동 재배포
```
- 검증은 preview MCP(`preview_start` name=`naum-dev`) + eval. 멀티프레임이라 click→eval은 한 eval 안에서 묶거나 nth-child로. 네이티브 confirm은 `window.confirm=()=>true`로 우회.

## 7. 미완료 / 다음 후보
- **솔라피 SMS 연동(보류)**: `/api/sms`(키 서버보관) + 처치알림 SMS + 발신번호 교사별(키 1개·발신번호 다수 등록). 설계는 대화 이력 참고. 휴대폰 OTP 로그인도 솔라피+Supabase Send SMS Hook으로 후속.
- 공식 재난 API(승인 대기), relay 재연결/오프라인 큐 보강, 토큰 보안 강화(서버 서명), 번들 추가 최적화.
- 연수 데이터 정리: `delete from public.visits; delete from public.visit_links; delete from public.relay_class_inbox; delete from public.relay_student_inbox;`

## 8. 핵심 파일 지도 (이번 세션 추가분)
- `src/store/visits.tsx` — 3모드 데이터계층(add/start/complete/update/**delete**Visit), 오프라인 캐시·아웃박스, 오늘필터는 NurseQueue
- `src/store/auth.tsx` — 이메일+비번 / **토큰로그인(loginToken)** / **회원가입(signupNurse)** / 로그인유지 / 오프라인 세션캐시
- `src/data/` — `supabaseClient` · `schoolCrypto`(키·토큰·로그인토큰) · `offline`(아웃박스) · `localStation` · `aiTriage` · `ai`(프롬프트) · `notifyText`
- `src/api/` — `supabaseBackend`(visits·links·delete·Realtime) · `supabaseRelay` · `backend`(Node)
- `src/components/` — `TreatPanel`(AI·체온·관찰·삭제) · `TempPickerModal` · `ObservePickerModal` · `AiSettingsModal` · `LoginTokenModal`(보건교사→교사·학부모) · `EduNurseTokenModal`(교육청→보건교사) · `SyncStatus` · `InstallButton` · `SchoolAdminPanel`(임시·영구저장)
- `api/proxy.js` + `vercel.json`(rewrite) — data.go.kr 프록시(서버 키). `api/health.js`.
- `supabase/migrations/0001~0007`
