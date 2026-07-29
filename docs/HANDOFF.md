# 나음(NaUM) — 다음 세션 이어가기 (핸드오프)

> **새 세션은 이 파일부터 읽으세요.** 상세 이력은 [PROGRESS.md](PROGRESS.md), 배포·계정은 [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
> 최종 업데이트: 2026-07-29 (마이그레이션 0009·0011 적용 완료 → 0001~0011 전부 적용. RLS 강화 라이브 + 담임교사 계정 라이브 가입 가능)

## ⏳ 다음 세션 시작 체크리스트 — 사용자(관리자) 대기 조치
> 코드는 전부 배포됨(`git push` 완료). 아래는 **사용자가 Supabase/Vercel에서 해야** 활성화되는 것들. 새 세션은 먼저 "이거 하셨나요?"로 상태 확인.

| 조치 | 무엇 | 안 하면 |
|---|---|---|
| **키서버 Phase 2** | 이름복원·알림 정상 확인 후 클라이언트 env `VITE_SCHOOL_LINK_SECRET` 제거+재배포 → 번들에서 마스터 비밀 제거(3② 실수정 완료). [SUPABASE_SETUP §5-2] | 마스터 비밀이 번들에 남음 |
| **솔라피 SMS** | 발신번호 등록 + 카카오 템플릿 승인 → Vercel `SOLAPI_*` env → 처치완료 흐름에 `sendSms` 연결 | SMS 발송 안 됨(501) |
| **행안부 긴급재난문자** | data.go.kr 활용신청 + 호출 IP 등록 | 지진·특보는 되나 재난문자만 빠짐 |

**적용 완료(참고)**: 0008(토큰 게이트)·**0009(RLS 강화, 2026-07-29)**·0010(교사→보건교사 relay)·**0011(담임 반 스코프, 2026-07-29)**·키서버 Phase 1·토큰 게이트 env. **기상특보·지진은 실연동 완료.** → **모든 마이그레이션(0001~0011) 적용 완료.**

**담임 계정 관련 주의**: `relay_nurse_inbox` 조회는 authenticated 전용 → 보건교사는 **실제 로그인(이메일/비번)** 이어야 교사 요청 수신. (담임 계정 도입으로 교사도 authenticated가 되어 정합.)

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
- **부위 인체도**(`BodyMapModal`, 2026-07-15): 지혈·밴드·소독 처치 클릭 시 **앞면 인체도**(19개 부위) 터치로 처치 부위 선택 → 처치 문자열에 부위 첨부(A안) "밴드·소독 (이마)". 지혈=빨강·밴드소독=파랑 톤, 좌·우는 학생 기준, 재열기 시 기존 선택 복원. 알림·보건일지에 부위 그대로 흐름(스키마 무변경). 체온·관찰과 동일한 "처치→세부 모달" 패턴.
- **관찰 결과**: 10분단위 시간선택 → 완료패널 "관찰 중·남은분" → 종료 시 깜빡임+"결과 선택 →" 클릭 시 **결과 선택 모달**(교실 복귀 / 귀가 / 병원 이송 / 관찰 연장) → 선택 결과로 확정 + 결과별 담임·학부모 알림. 관찰은 "결과"가 아니라 임시 보류 상태로 취급(재평가 후 3가지 결과 확정 또는 연장). `ObserveResolveModal`. (`completeVisit`은 patch에 병명·처치 없으면 저장값으로 보완해 전환 알림 누락 방지.)
- **방문 삭제**(대기 ✕ / 처치 삭제버튼), **콘솔 일일 초기화**(오늘 건만 표시)
- **콘솔 재난·기상 경보 + 교육청 공지 수신**(2026-07-10): 보건교사 콘솔 좌측에 `DisasterStrip`(날씨·미세먼지 파생 경보, 위험 경보 시 로컬 push) 표시. 교육청이 "주변 학교 알림"으로 보낸 공지·경보가 보건교사 "받은 공지·알림"함에 도착(`notices.send`가 학교대상 공지를 `nurseInbox`에도 적재, `kind` = notice/alert 태그). ※ 공지 cloud relay 미연동(로컬 시뮬)은 후속.
- **공식 기상특보·지진 연동**(2026-07-10, **2026-07-15 정확도 수정**): `disasters.fetchOfficialAlerts`.
  - **특보 = 통보문 `getWthrWrnMsg`의 `t6`("현재 발효중인 특보") 그대로 사용**(부산 stnId=159). `getWthrWrnList`는 *발표 이력 로그*라 접어서 현재 상태를 추정하면 틀림 — 해제/변경이 **지역별로 쪼개져** 제목만으론 판별 불가(실제로 해제된 폭염경보가 3일간 잔류, 발효중 열대야주의보는 부분해제를 전체해제로 오판해 누락). `t6`는 지역 포함 → **부산 발효분만**(`'부산'`/`'부산(…)'` 정확 매칭 → `남해동부앞바다(부산앞바다)` 등 해상 제외), 해제되면 t6에서 빠져 **자동 만료**. 목록 조회 최대 6일 제한(→5일 사용).
  - **지진**: **오늘 발생분만**(지진은 지나간 이벤트라 전날 것은 보건교사에게 불필요 — 조회도 `fromTmFc=toTmFc=오늘`). `rem`에 '국내영향없음'(기상청 명시=국외지진) 제외 + 학교 좌표 기준 **600km 밖 제외**(haversine, `lat`/`lon`). 규모 2.0+(4.0+ 경보). ※ 600km 검증: 경주 67·포항 107·후쿠오카 215·서울 325·백령도 502km=표시 / 필리핀 3343·뉴칼레도니아 7846km=제외.
  - ※ **기상특보는 "발효 중" 상태**라 시작이 며칠 전이어도 **당일 상황**이므로 유지(오늘 폭염인데 사라지면 안 됨). 해제되면 t6에서 빠져 자동 소멸.
  - `useOfficialAlerts` 공유 훅(10분 캐시)으로 콘솔·상단바·교육청이 파생 경보와 병합. 실검증(07.15): t6 원본과 일치하는 **폭염·열대야 주의보 2건**만 표시(국외지진 3건·해제된 폭염경보 제거). 남은 미승인=행안부 긴급재난문자(IP 등록 필요).
- **알림 대상 선택**(콘솔 "알림 대상 ☑담임 ☑학부모", 기본 둘 다 → 접수/종료 relay 발신 게이팅. `data/notifyTargets`)
- **명부 업로드**(`/roster`): 학생 명부(학년·반·번호·이름·성별·**보호자연락처**=학부모정보) + **담임 명부**(학년·반·담임명·연락처, `data/teacherRoster`) — 둘 다 엑셀/CSV, 로컬 저장. 처치 화면에 담임 이름·연락처 표시.
- **학부모/담임 알림 구조화**(`notifyText.buildParentMessage/buildTeacherLine`: 증상·병명·처치·결과)
- **다기기 이름복원**(암호화 링크 `visit_links`), **relay 클라우드**(토큰+암호문, 교사 반키·학부모 학생키 복호화)
- **오프라인 + 설치형 PWA**(서비스워커 앱셸 캐시 + 아웃박스 큐 재연결 업로드 + "앱 설치" 버튼)
- 교육청 대시보드(지도·KPI·감염병 조기탐지·AI보고), **학교 설정 영구저장**(`app_state`)·추가학교 **"임시" 표시**
- 교장 보고(일일 자동마감·보건일지 엑셀). **보건일지 응급처치 표(2026-07-15): "처치" 칸 → "증상 · 처치 · 결과"** — 학생 입력 증상 + 처치(인체도 부위 포함) + 처치결과(교실복귀/귀가/병원이송/관찰) + 시간을 "증상 → 처치 → 결과 (시간)"로 함께 기록(`bogeonLog.treatText`). 병명 칸은 그대로.

## 5. Supabase 마이그레이션 상태
`supabase/migrations/` **0001~0011 전부 적용 완료** (0001~0007: 2026-06-24 / 0008·0010: 2026-07-11~15 / **0009·0011: 2026-07-29**).
| 파일 | 내용 | 상태 |
|---|---|---|
| 0001_init | profiles·visits·relay + RLS | ✅ |
| 0002_fix_policies | RLS 보정 | ✅ |
| 0003_links_relay | visit_links + relay 정책 | ✅ |
| 0004_relay_anon_select | 토큰로그인(anon) relay 조회 | ✅ |
| 0005_app_state | 학교설정 공유저장 | ✅ |
| 0006_visit_observe | `observe_until` 컬럼(관찰) | ✅ (201 확인) |
| 0007_visit_delete | 방문 삭제 RLS | ✅ (authenticated DELETE 204 확인) |
| 0008_role_from_app_meta | 가입 role을 app_metadata에서만 신뢰(무단 보건교사 가입 차단) | ✅ **적용+env 설정 완료(2026-07-11)** — `/api/token` 400(≠501) 확인 = 토큰 게이트 활성. 신규 보건교사 가입은 서버 생성(role=nurse) |
| 0009_rls_staff_scope | visits·visit_links 조회/수정/삭제·app_state 쓰기를 nurse/edu 역할로 제한(`is_staff()`) | ✅ **적용 완료(2026-07-29)** |
| 0010_relay_nurse_inbox | 교사→보건교사 relay 채널(보건실 요청·전학 안내) | ✅ **적용+실검증 완료(2026-07-15)** — 교사 발신→보건교사 수신·접수·방문생성 라이브 확인 |
| 0011_profile_class_from_app_meta | 가입 트리거가 app_metadata의 grade·classNo도 profiles에 기록(담임교사 계정) | ✅ **적용 완료(2026-07-29)** — 담임교사 계정 라이브 가입 가능 |

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

## 6-4. 보안 점검(2026-07-10) — 저위험 조치 완료 + 남은 항목
**완료(코드/설정, `api/proxy.js`·`api/health.js`)**:
- **입력검증**: proxy `endpoint`를 `^[A-Za-z0-9_]+$` 화이트리스트(경로 조작 차단), `svc`는 TARGETS만.
- **인증/오남용**: proxy에 **Origin/Referer 검사**(동일출처·로컬만; 헤더 없으면 통과→앱 무중단)로 타 사이트 핫링크 차단. `health`의 `hasKey` 노출 제거.
- **rate limit + 캐시**: proxy 200 응답 **CDN 캐시**(s-maxage=300)로 상류 쿼터 절감 + **IP 버스트 제한**(인스턴스 로컬 300/분, 베스트에포트). 검증: 실핸들러 8종 통과(404/400/403/200+캐시/무-Referer 통과/429/오류 무캐시).

**남은 항목(위험도순, 결정·인프라 필요)**:
- **① RLS 정책 느슨(중)**: **일부 조치 — `0009_rls_staff_scope.sql` 작성**(visits·visit_links 조회/수정/삭제·app_state 쓰기를 nurse/edu로 제한). **적용은 사용자가 스테이징 테스트 후 진행.** 유지된 부분(키오스크 anon INSERT, 교사/학부모 anon relay SELECT)은 기능상 필요+E2E로 방어. 남은 후속: school_id 다학교 스코프, anon insert 크기/횟수 제한.
- **② 학교 비밀 번들 노출(중~높)**: **Phase 1 배포 완료(2026-07-11)** — `SCHOOL_MASTER_SECRET` env 설정됨(`/api/keys` 403≠501 확인). 이제 서버 발급 키 사용. **남은 것 = Phase 2**: 이름복원·교사/학부모 알림 정상 확인 후 클라이언트 `VITE_SCHOOL_LINK_SECRET` **제거+재배포** → 번들에서 마스터 비밀 사라짐 = 실제 수정 완료. ([SUPABASE_SETUP §5-2](SUPABASE_SETUP.md))
- **③ 분산 rate limit**: 현재 인스턴스 로컬(베스트에포트) → 운영은 Vercel KV/WAF 필요. `signup`(service_role 계정생성)도 IP/토큰별 제한 권장.

## 6-5. 최근 추가(2026-07-15) — 교사→보건교사(보건실 보내기·전학 안내)
- **교사 페이지(`TeacherView`) 개편**: (a) **보건실로 보내기** — 학생 번호 + 증상 타일 선택 → 보건교사에게 요청 (b) **전학생 추가** — 번호·이름·성별 → 보건교사에게 전학 안내 + 교사 로컬 명부에 추가 (c) **반 명부 엑셀/CSV 업로드**(`teacherClassRoster`, 교사 기기 로컬만) → 번호↔이름 매칭 (d) 받은 알림은 **번호 기반**(암호문 `ClassPayload.number`) — 이름은 명부 업로드 시에만.
- **보건교사 콘솔(`NurseQueue`) 수신함**: "보건실 요청" 박스 — 보건실요청은 **번호→명부로 학생 확인 후 [접수]**(방문 생성), 전학안내는 **[명부에 추가]**. 처리 후 요청 삭제.
- **채널**: `relay_nurse_inbox`(마이그레이션 0010) + `supabaseRelay.emitNurseRequest/loadNurseRequests/subscribeNurse` + `data/nurseRequest`(supabase=클라우드 / 미설정=로컬 시뮬 분기). 내용은 **반 키로 암호화**(번호·이름 포함) — 서버는 토큰·암호문만. 비식별 원칙 유지(보건교사가 명부로 번호→이름 복원).
- 검증: 빌드·양 화면 렌더·교사 명부 매칭·요청 payload 암복호 라운드트립(반 키, 타 반 복호 실패) 확인. **클라우드 전달은 0010 적용 후**.

## 6-6. 최근 추가(2026-07-15) — 담임교사 계정(토큰→비밀번호)
- **담임교사 인증 = 보건교사 발급 토큰 + 비밀번호(계정)**: 토큰 세션(anon)이던 교사를 **실제 Supabase 계정(role=teacher)** 으로. 교사가 authenticated → `relay_nurse_inbox` 수신 등 확실. 학부모는 토큰 세션 유지.
  - **가입**: 로그인 화면 담임 탭 → "담임 가입" — 보건교사가 준 담임 토큰(`r:'t',g,c`) + 이름 + 비밀번호 → `api/token.js` signup(교사 분기)이 service-role로 계정 생성. 이메일 없이 **학반 합성 이메일**(`t{g}-{c}@{schoolId}.naum.kr`, `teacherAuth.teacherEmail`), app_metadata `{role:teacher, grade, classNo}`.
  - **로그인**: 담임 탭 로그인 → **학년/반 + 비밀번호**(앱이 합성 이메일 도출 → `loginPassword`). 프로필의 grade/class_no로 담당 반 결정.
  - 마이그레이션 **0011**(트리거가 app_metadata grade/classNo도 profiles에 기록) 필요. 검증: 실핸들러 9종(합성이메일=클라이언트 동일·app_metadata·검증) + Login UI 렌더·토큰검증. **라이브 가입은 0011 적용 후.**

## 7. 미완료 / 다음 후보
- **솔라피 SMS/알림톡 연동**: 템플릿 문구 + **발송 배관(`api/sms.js`·`data/sms.ts`) 구현 완료**([SOLAPI_TEMPLATES.md](SOLAPI_TEMPLATES.md) §6, 핸들러 mock 8종 통과). **남은 일**: ① 발신번호 등록 + 카카오 템플릿 승인 ② Vercel `SOLAPI_*` 환경변수 ③ 처치완료 흐름에 `sendSms` 연결(현재 오발송·과금 방지로 수동 배관만). 휴대폰 OTP 로그인도 솔라피+Supabase Send SMS Hook으로 후속.
- ~~relay 재연결/오프라인 큐 보강~~ **(완료, 2026-07-10 — 6-1 참고)**.
- ~~토큰 보안 강화(서버 서명)~~ **(코드 완료, 2026-07-10 — 6-2 참고)**. **배포 시 0008 + Vercel 환경변수 적용 필요**([SUPABASE_SETUP.md](SUPABASE_SETUP.md) §5-1). 미적용이면 기존 로컬 방식으로 폴백(앱 정상, 강화 미적용).
- ~~번들 추가 최적화~~ **(완료, 2026-07-10 — 6-3 참고)**.
- 공식 재난 API(승인 대기), 솔라피 SMS 실연동(카카오 템플릿 승인 후).

## 6-3. 최근 추가(2026-07-10) — 번들 청크 분리(초기 로딩 최적화)
- **문제**: 메인 번들이 단일 540KB(gzip 153KB) — react·supabase·642개교 데이터·앱 코어가 한 덩어리 → 앱 코드만 바뀌어도 재방문 시 전체 재다운로드.
- **해결**(`vite.config.ts` `build.rollupOptions.output.manualChunks`): vendor-react / vendor-supabase / vendor(기타) / data-busan(busanSchools·eduMock·surveillance·monthly) / 앱 코어(index)로 분리.
  - **앱 코어 index 540KB → 93KB(gzip 29KB)**. vendor·data 청크는 앱 배포마다 안 바뀌어 **재방문 시 캐시 적중**(대부분 배포에서 ~93KB만 재다운로드) + 병렬 로드. 500KB 경고 해소.
- **검증**: 프로덕션 빌드(`npm run preview`, :4173) 부팅 무에러 + 로그인(eager: index·vendor-react·vendor-supabase) + 교육청 대시보드(lazy Edu + data-busan) 렌더 확인. (프리뷰 실행: launch.json에 `naum-preview` 추가.)
- **미해결(후속)**: 642개교 데이터가 전역 스토어(notices·schools)에 정적 의존해 **eager 상주**(초기 총량은 동일, 캐시·병렬만 개선). 완전 지연로딩은 스토어를 비동기 초기화로 바꾸는 리팩터 필요(동작 변경 리스크 → 별도 과제).

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
