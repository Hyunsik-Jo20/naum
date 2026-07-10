# 나음(NaUM) — 다음 세션 이어가기 (핸드오프)

> **새 세션은 이 파일부터 읽으세요.** 상세 이력은 [PROGRESS.md](PROGRESS.md), 배포·계정은 [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
> 최종 업데이트: 2026-07-10 (relay 재연결·오프라인 큐 보강 / 솔라피 알림톡 템플릿 승인문구 작성)

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
- **알림 대상 선택**(콘솔 "알림 대상 ☑담임 ☑학부모", 기본 둘 다 → 접수/종료 relay 발신 게이팅. `data/notifyTargets`)
- **명부 업로드**(`/roster`): 학생 명부(학년·반·번호·이름·성별·**보호자연락처**=학부모정보) + **담임 명부**(학년·반·담임명·연락처, `data/teacherRoster`) — 둘 다 엑셀/CSV, 로컬 저장. 처치 화면에 담임 이름·연락처 표시.
- **학부모/담임 알림 구조화**(`notifyText.buildParentMessage/buildTeacherLine`: 증상·병명·처치·결과)
- **다기기 이름복원**(암호화 링크 `visit_links`), **relay 클라우드**(토큰+암호문, 교사 반키·학부모 학생키 복호화)
- **오프라인 + 설치형 PWA**(서비스워커 앱셸 캐시 + 아웃박스 큐 재연결 업로드 + "앱 설치" 버튼)
- 교육청 대시보드(지도·KPI·감염병 조기탐지·AI보고), **학교 설정 영구저장**(`app_state`)·추가학교 **"임시" 표시**
- 교장 보고(일일 자동마감·보건일지 엑셀)

## 5. Supabase 마이그레이션 상태
`supabase/migrations/` 0001~0007 **적용 확인됨(2026-06-24)**. **0008은 미적용 — 토큰 서버 게이트와 함께 적용 필요**(아래).
| 파일 | 내용 | 상태 |
|---|---|---|
| 0001_init | profiles·visits·relay + RLS | ✅ |
| 0002_fix_policies | RLS 보정 | ✅ |
| 0003_links_relay | visit_links + relay 정책 | ✅ |
| 0004_relay_anon_select | 토큰로그인(anon) relay 조회 | ✅ |
| 0005_app_state | 학교설정 공유저장 | ✅ |
| 0006_visit_observe | `observe_until` 컬럼(관찰) | ✅ (201 확인) |
| 0007_visit_delete | 방문 삭제 RLS | ✅ (authenticated DELETE 204 확인) |
| 0008_role_from_app_meta | 가입 role을 app_metadata에서만 신뢰(무단 보건교사 가입 차단) | ⏳ **미적용** — `api/token.js` 환경변수와 **함께** 배포. 절차: [SUPABASE_SETUP.md](SUPABASE_SETUP.md) §5-1 |

## 6. 실행/빌드
```
cd C:\Users\user\OneDrive\Documents\naum
npm install
npm run dev        # 로컬(.env.local의 supabase 키 있으면 클라우드 모드)
npm run build      # tsc + vite + PWA (배포 전 항상 통과 확인)
git push           # → Vercel 자동 재배포
```
- 검증은 preview MCP(`preview_start` name=`naum-dev`) + eval. 멀티프레임이라 click→eval은 한 eval 안에서 묶거나 nth-child로. 네이티브 confirm은 `window.confirm=()=>true`로 우회.

## 6-1. 최근 추가(2026-07-10) — relay 재연결·오프라인 큐 보강
- **오프라인 아웃박스 무유실·재시도 고도화**(`data/offline.ts`): 큐 항목을 `{id,op,tries}`로 관리(구버전 bare op 자동 마이그레이션). ① 온라인+큐 빈 경우 즉시 시도, 실패하면 큐로(유실 방지) ② 실패 op는 **버리지 않고 지수 백오프**(1→2→4→8→16→30s) 재시도, **순서 보존**(실패 op 뒤는 대기) ③ `MAX_TRIES(8)` 초과 op만 **dead-letter**(`naum.outbox.dead`)로 격리해 큐 안 막힘 ④ 재시도 트리거 = `online`+`visibilitychange`+주기 20초 ⑤ id 기반 제거로 flush 중 동시 append 유실 없음. 검증: 상태기계 시뮬(순서·무유실·백오프·dead-letter·동시append) 전부 통과 + 실모듈 정규화/마이그레이션 확인.
- **쓰기 실패 전파**: `supabaseBackend.createVisit/patchVisit/deleteVisit`·`supabaseRelay.emitClass/emitStudent`가 에러를 삼키던 것 → **throw로 전파**(큐가 실패를 감지·재시도). `createVisit`는 재시도 멱등(23505 중복키=성공 간주), 링크·삭제 링크는 베스트에포트.
- **Realtime 재연결 catch-up**: `subscribeClass/subscribeStudent`가 `SUBSCRIBED` 재도달 시 `onChange` 재발화(끊긴 사이 이벤트 재조회) + `online`/`visibilitychange` 시 재조회(소켓 절전 stall 대비). 수신 loader는 재시도 중복 이벤트 **dedupe**(토큰+시각+종류). 콘솔(`visits.tsx`)도 재연결/복귀 시 방문 재조회 병합(기존 로컬 유지, 없는 것만 추가 → 미업로드 되돌림 방지).
- **상단바 표시**(`SyncStatus`): 온라인 재시도 중이면 "재시도 중 N건", dead-letter 있으면 "실패 N건".

## 7. 미완료 / 다음 후보
- **솔라피 SMS/알림톡 연동**: 승인 제출용 템플릿 문구 완료 → **[docs/SOLAPI_TEMPLATES.md](SOLAPI_TEMPLATES.md)**(학부모 5개 T1~T5 + 담임 5개 T6~T10, 결과별 분리, 변수 `#{}`). 발신번호 등록 + 카카오 템플릿 심사 진행 후 → `/api/sms`(키 서버보관) + 처치알림 발송 + 발신번호 교사별. 휴대폰 OTP 로그인도 솔라피+Supabase Send SMS Hook으로 후속.
- ~~relay 재연결/오프라인 큐 보강~~ **(완료, 2026-07-10 — 6-1 참고)**.
- ~~토큰 보안 강화(서버 서명)~~ **(코드 완료, 2026-07-10 — 6-2 참고)**. **배포 시 0008 + Vercel 환경변수 적용 필요**([SUPABASE_SETUP.md](SUPABASE_SETUP.md) §5-1). 미적용이면 기존 로컬 방식으로 폴백(앱 정상, 강화 미적용).
- 공식 재난 API(승인 대기), 번들 추가 최적화.

## 6-2. 최근 추가(2026-07-10) — 토큰 보안 강화(서버 서명 게이트)
- **문제**: 토큰이 클라이언트 번들의 `VITE_SCHOOL_LINK_SECRET` 파생이라 **위조 가능**했고, 보건교사 가입이 클라이언트 `signUp(role 메타)`라 **토큰 없이 자칭 가입** 가능(권한 상승 구멍).
- **해결**: `api/token.js`(Vercel 서버리스, 서버 전용 비밀) — ① **발급**: 호출자 역할 확인(로그인토큰=보건교사 JWT / 가입토큰=교육청 role=edu 또는 `EDU_ISSUE_SECRET`) 후 **HMAC 서명**(만료 포함) ② **가입**: 가입토큰 HMAC 검증 후 **service-role로 계정 생성**, role을 **app_metadata(클라 조작 불가)** 로 지정 ③ **검증**: 교사·학부모 로그인 토큰 HMAC 검증. `0008`이 트리거 role 출처를 app_metadata로 바꿔 우회 가입 차단.
- **클라이언트**(`data/tokenApi.ts`): `v1.` 서명 토큰은 서버 검증 필수(위조 불가), 서버 미설정(501)/네트워크 시 **레거시 로컬 폴백**(데모·기존 배포 무중단). 발급 권한 거부(403)는 폴백 없이 에러 전파. `auth.tsx`(loginToken·signupNurse)·`LoginTokenModal`·`EduNurseTokenModal`(발급 비밀 입력란·에러표시) 연동.
- **검증**: 실제 `api/token.js` 핸들러 13종 통과(HMAC 라운드트립·변조/만료/타비밀 위조 거부·발급/가입 게이팅·501 폴백·405) + dev 폴백 라운드트립(발급→검증) 확인 + 빌드 통과.
- 연수 데이터 정리: `delete from public.visits; delete from public.visit_links; delete from public.relay_class_inbox; delete from public.relay_student_inbox;`

## 8. 핵심 파일 지도 (이번 세션 추가분)
- `src/store/visits.tsx` — 3모드 데이터계층(add/start/complete/update/**delete**Visit), 오프라인 캐시·아웃박스, 오늘필터는 NurseQueue
- `src/store/auth.tsx` — 이메일+비번 / **토큰로그인(loginToken)** / **회원가입(signupNurse)** / 로그인유지 / 오프라인 세션캐시
- `src/data/` — `supabaseClient` · `schoolCrypto`(키·토큰·로그인토큰) · `offline`(아웃박스) · `localStation` · `aiTriage` · `ai`(프롬프트) · `notifyText` · **`notifyTargets`(알림 대상)** · `localRoster`(학생명부) · **`teacherRoster`(담임명부)** · `location`(SCHOOL=테스트초등학교)
- `src/api/` — `supabaseBackend`(visits·links·delete·Realtime) · `supabaseRelay` · `backend`(Node)
- `src/components/` — `TreatPanel`(AI·체온·관찰·삭제) · `TempPickerModal` · `ObservePickerModal` · `AiSettingsModal` · `LoginTokenModal`(보건교사→교사·학부모) · `EduNurseTokenModal`(교육청→보건교사) · `SyncStatus` · `InstallButton` · `SchoolAdminPanel`(임시·영구저장)
- `api/proxy.js` + `vercel.json`(rewrite) — data.go.kr 프록시(서버 키). `api/health.js`.
- `supabase/migrations/0001~0007`
