# 나음(NaUM) — 작업 현황 · 핸드오프 문서

> 보건실 디지털 전환 플랫폼 프로토타입. **새 세션에서 이 문서만 읽으면 이어서 작업 가능.**
> 최종 업데이트: 2026-06-17 / 설계 확정본: [health-room-platform-design.md](health-room-platform-design.md) (v1.1)

---

## 0. 한 줄 요약
학생이 키오스크로 셀프 접수 → 보건교사는 처치만 → 담임·학부모 실시간 알림 → 교육청은 비식별 집계 대시보드.
**개인정보(이름·반·번호)는 보건실 로컬에만, 서버엔 비식별(난수토큰·학년·성별·계통·시각)만.**

### 최근 추가(2026-06-17) — 체온 입력 모달 / 관찰 시간·복귀 알림
- **체온 측정 모달**(`TempPickerModal`): 키보드 없이 큰 ±는 0.3 점프 + 가운데 3연속값 0.1 미세선택, 구간색·발열경고. "체온 측정 37.5℃"로 처치 저장 → 학부모 문구 포함.
- **관찰 결과 흐름**(`ObservePickerModal` + visits.observeUntil + `0006_visit_observe.sql`): 관찰 클릭 시 10분 단위 시간 선택 → 완료 패널에 "관찰 중·N분 남음" → 종료되면 카드 깜빡임("obsflash")+"교실 복귀 →" → 클릭 시 `completeVisit(교실 복귀)`로 전환되며 담임·학부모에 추가 relay 알림. NurseQueue 20초 틱 타이머. (검증: 모달·관찰중·종료깜빡임·복귀전환 라이브 확인)
  - ※ 클라우드 영속 위해 **`0006_visit_observe.sql`(observe_until 컬럼) 실행 필요**.

### 최근 추가(2026-06-17) — 보건교사 회원가입(교육청 토큰)
- **계정 발급 계층**: 교육청 → **보건교사 가입 토큰 발급**(`EduNurseTokenModal`, Edu 대시보드 버튼, payload {r:'n',org}) → 보건교사가 로그인 화면 **"보건교사 회원가입"**에서 토큰+이름+이메일+비밀번호 입력 → `auth.signupNurse`가 토큰 검증 후 `supabase.auth.signUp`(메타 role=nurse → 트리거가 profiles 자동 생성). 이메일 확인 메일 인증 후 로그인. → 관리자 수동 계정생성 불필요.
  - 보안: 토큰은 학교키 암호문(번들 비밀 공유라 약한 게이트, 프로토타입) — 실서비스는 서버 서명/이메일 사전등록 권장.

### 최근 추가(2026-06-17) — 토큰 로그인(교사·학부모) + 로그인 유지
- **교사·학부모 토큰 로그인**: 보건교사가 콘솔 "로그인 토큰 발급"(`LoginTokenModal`)로 학반(담임)·학생(학부모) 토큰 발급·배부 → 받는 사람이 로그인 화면 "교사·학부모(토큰)" 탭에서 **토큰 + 학반/자녀 이름**으로 매칭 로그인. Supabase 계정 불필요(로컬 토큰 세션 `naum.tokensession`). 토큰=학교 키 암호문(자체완결, 서버 미저장) — `schoolCrypto.issueLoginToken/decodeLoginToken`. `auth.loginToken`, 토큰세션 부팅 우선 복원.
  - relay 수신 위해 **`0004_relay_anon_select.sql`(relay select를 anon 허용)** 실행 필요(내용은 암호문이라 노출 없음).
- **로그인 상태 유지 체크박스**(기본 ON): OFF면 브라우저 종료 시 로그아웃(`naum.persistLogin` + sessionStorage alive 마커). 보건교사/교육청=이메일+비번 유지.
- (솔라피 SMS·휴대폰 OTP는 보류)

### 최근 추가(2026-06-17) — 설치형 PWA(오프라인 앱)
- **PWA(설치형 웹앱)**: `vite-plugin-pwa`(Workbox). 서비스워커가 앱 셸을 precache → **APK처럼 설치(홈화면/바탕화면) + 오프라인 실행**. `manifest.webmanifest`(아이콘 `public/icon.svg`), `registerSW({immediate})` in main.tsx, autoUpdate. CDN(tabler 아이콘) runtimeCaching=CacheFirst. **"앱 설치" 버튼**(`components/InstallButton.tsx`, beforeinstallprompt) — 상단바·로그인 화면. vercel.json `sw.js` no-cache 헤더. 데이터 오프라인(아웃박스)과 합쳐 완전 오프라인.

### 최근 추가(2026-06-17) — 오프라인·AI추천·학부모문구
- **오프라인 사용 + 재연결 일괄 업로드**(supabase 모드): `data/offline.ts` 아웃박스 큐 + `data/visits` 캐시(`naum.cache.visits`). 오프라인이면 접수·처치·알림 쓰기를 localStorage 큐에 적재, `online` 이벤트 시 자동 flush. 부팅 시 캐시 먼저 띄워 인터넷 없이도 콘솔/키오스크 동작. 세션 캐시(`naum.session.cache`)로 오프라인 로그인 유지. 상단바 `SyncStatus`(오프라인·대기건수·지금). (검증: 오프라인 접수→큐 3건→재연결 자동 업로드 0건)
- **AI 병명·처치 추천**(`data/aiTriage.ts`, `callAi` 재사용): TreatPanel "AI 추천" — 증상만 전송(PII 미포함)→병명·계통·**감염병 의심 경고**·기본 처치 3가지(JSON). 처치 칩 선택 반영, **기타란 Enter로 직접 입력**. 키는 `AiSettingsModal`(보건교사용). 
- **학부모 알림 문구 구조화**(`data/notifyText.ts`): relay 종료 payload에 병명·처치 포함, `buildParentMessage`(증상·병명·처치·결과+결과별 안내)·`buildTeacherLine`(처치 포함 요약). ParentView/TeacherView 반영.

### 최근 추가(2026-06-17) — Supabase 클라우드 모드 + Vercel 배포(연수 데모는 그대로)
- **3-모드 데이터 계층(우선순위 supabase > backend > local)**, 전부 환경변수로 분기 → **로컬/연수 데모는 무변경**(`VITE_SUPABASE_URL` 미설정 시 기존 in-browser).
  - **supabase 모드**: 비식별 `Visit`만 Supabase(Postgres)에 저장 + **Realtime** 동기화. **PII(이름·반·번호 + visit↔student 링크)는 브라우저 로컬(`data/localStation.ts`)에만** — 클라우드는 학생 식별 불가. 데모 시드 없음(빈 상태 시작).
  - **인증 이중화**: supabase 모드=이메일+비밀번호(Supabase Auth) + `profiles.role`로 역할 결정, 로그인 폼은 단일 이메일/비밀번호. 데모 모드=기존 역할 4탭 PIN. (휴대폰 OTP 전환은 `loginPassword`→`signInWithOtp`만 교체)
  - **스키마/RLS**: `supabase/migrations/0001_init.sql`(profiles·visits·relay_* + RLS + Realtime + 가입 트리거). PII 컬럼 자체가 없음.
  - **Vercel 배포**: `vercel.json` + `api/*`(data.go.kr 5종 프록시 서버리스, serviceKey 서버 주입, 개발 Vite 프록시와 동일) + SPA fallback.
  - 파일: `data/supabaseClient.ts`(env 있으면 클라이언트, 없으면 null) · `api/supabaseBackend.ts`(fetch/create/patch/Realtime, 링크는 로컬) · `data/localStation.ts` · `store/auth.tsx`·`pages/Login.tsx`(이중화) · `store/visits.tsx`(supabase 모드).
  - **런북: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)** (프로젝트 생성·SQL 실행·계정/역할·Vercel 환경변수·카카오 도메인).
  - **다기기 이름복원(암호화 링크)**: `visit_links`에 studentId를 학교 키로 암호화 저장 → 다른 기기 콘솔도 복호화로 이름 복원(서버 복호화 불가). `data/schoolCrypto.ts`(결정적 키/토큰), `0003_links_relay.sql`.
  - **교사·학부모 알림 클라우드 연동(relay)**: 접수/종료 시 나음이 `relay_class/student_inbox`에 토큰+암호문 발신, 교사(반 키)·학부모(학생 키)가 Realtime 수신·복호화. `api/supabaseRelay.ts`, TeacherView/ParentView 클라우드 분기. **`VITE_SCHOOL_LINK_SECRET` 전 기기 동일** 필요.
  - **라우트 코드분할**: App.tsx React.lazy+Suspense(메인 번들 650→520KB, Edu 등 분리).
  - **Git/Vercel 배포 완료(2026-06-17)**: GitHub `Hyunsik-Jo20/naum` push, Vercel `https://naum-kappa.vercel.app` 라이브. 검증: SPA·딥링크 fallback·클라우드 모드(번들에 Supabase ref)·API 프록시 3종(airstn/kma/air → data.go.kr, serviceKey 서버주입) 모두 200. **API는 catch-all 대신 `api/proxy.js` + vercel.json rewrite**(`/api/:svc/:endpoint`)로 구현 — Vercel에서 브래킷 catch-all 다중세그먼트 라우팅이 안 돼 전환. 남은 건 카카오 콘솔에 `*.vercel.app` 도메인 등록(지도).
  - **실클라우드 검증 완료(2026-06-17)**: 이메일+비밀번호 로그인 → 콘솔이 클라우드 비식별 방문 조회 → 키오스크(anon) 접수 → **Realtime 즉시 반영** 확인. 수정 2건: ① 키오스크 insert는 `upsert`→`insert`(anon은 UPDATE 정책 없어 upsert가 RLS에 막힘) ② 보호 라우트 딥링크/새로고침 레이스 → `authLoading` 추가(세션 복원 중 대기). RLS 보정은 `supabase/migrations/0002_fix_policies.sql`.
  - 후속: 다기기 이름 복원(암호화 링크/온프레미스 스테이션), 교사·학부모 알림(relay) 클라우드 연동, 휴대폰 OTP.

### 최근 추가(2026-06-17) — 백엔드 서버 실제 분리(#3)
- **로컬 스테이션(:8787) + 비식별 중앙 서버(:8788) 실제 구현** — 단일 메모리 스토어를 두 서버로 물리 분리(`server/`, 외부 의존성 0 · Node 내장 http + SSE).
  - **중앙(:8788)**: 비식별 `Visit`만 저장(이름·반·번호·studentId·연락처 키는 **코드로 거부**, 시도 시 400). 방문 변경을 SSE로 push.
  - **스테이션(:8787)**: `visitId↔studentId` 링크(재식별 키)만 로컬 보관. 방문 생성 시 링크는 로컬 저장 + **비식별 Visit만 중앙으로 server-to-server 전달**(studentId 제거).
  - **프론트**(`src/api/backend.ts` + `store/visits.tsx`): 부팅 시 백엔드 가용성 probe → 있으면 중앙(방문)·스테이션(링크) 하이드레이트 + **SSE 실시간 동기화**(BroadcastChannel 대체, **다중 기기** 지원). 없으면 기존 in-browser+BroadcastChannel로 **자동 폴백** → `npm run dev` 단독 데모 유지. `VisitsCtx` 동기 API 그대로(로컬 미러+낙관적 업데이트) → 소비자 7파일 무수정.
  - 검증: 중앙엔 grade/sex만(PII 누출 0), 이름은 스테이션 링크+로컬 명부로만 복원, 다른 기기 접수가 새로고침 없이 콘솔 대기열에 실시간 반영(SSE).
  - 실행: `npm run dev:all`(백엔드+Vite 동시) 또는 `npm run server`+`npm run dev` 따로.

### 최근 추가(2026-06-16~17) — 새 세션은 여기부터 파악
- **역할 로그인 4종**(`/login`): 보건교사 / 교사(담임) / 학부모 / 교육청. 라우트 보호·역할별 홈 메뉴. 키오스크는 공개.
- **학생 명부 로컬 업로드**(`/roster`): **엑셀(.xlsx, 무라이브러리 `xlsxReader`)·CSV**, localStorage, 키오스크·콘솔에 즉시 반영.
- **알림 = 익명 토큰 라우팅 + E2E 암호화**: 보건실 스테이션이 토큰+암호문만 중계로 보냄. **학부모=학생 토큰/키, 교사(담임)=반 토큰/키**. 중계 서버는 *누구인지(토큰)도 내용(암호문)도* 모름. 식별·복호화는 수신자(학부모=자녀, 담임=자기 반)만. 토큰 값은 화면에 노출 안 함. (`routingTokens`·`relay`·`station`·`e2e`)
- **교사·학부모 공지**는 **보건교사(보건실)에게만** — 받는 곳 선택 없는 단순 모달. 두 역할은 **자동공지 설정창 없음**.
- **자동공지 설정창(⚙)은 교육청 전용** — 임계치·지역/학교급 타깃팅은 교육청 소관이라 보건교사 화면에서도 제거(2026-06-17). 보건교사의 푸시 허용은 공지 발송 시 `ensurePushPermission()`로 자동 처리.
- 보건교사 콘솔 전체폭(한 화면), 교장 보고(보건일지 엑셀), 교육청 AI 정기보고 등은 6장 참고.

## 1. 실행 방법
```
cd C:\Users\user\OneDrive\Documents\naum
npm install
npm run dev          # http://localhost:5173 (프론트만 — 백엔드 없으면 in-browser 폴백)
npm run server       # 백엔드: 중앙(:8788) + 스테이션(:8787) (의존성 0, Node 내장)
npm run dev:all      # 백엔드 + Vite 동시 기동 (권장: 서버 분리 데모)
npm run build        # 타입체크 + 빌드 (배포 전 확인)
```
- 홈(`/`)에서 5개 화면 진입: 키오스크 / 보건교사 콘솔 / 알림 / 교육청 / (상단 공지·설정)
- 빌드는 항상 통과 상태 유지(`tsc --noEmit && vite build`).
- **백엔드 미가동이어도 프론트는 동작**(자동 폴백). 서버 분리·다중 기기 실시간 동기화를 보려면 `npm run dev:all`.
- 백엔드 데이터는 `server/.data/*.json`(git 제외). 비우면 프론트가 첫 접속 시 결정적 시드를 멱등 등록.

## 2. 기술 스택
- React 18 + Vite 5 + TypeScript + react-router-dom
- 차트: 인라인 SVG/CSS (외부 차트 라이브러리 없음)
- 지도: Kakao Maps JS SDK (동적 로드)
- 상태: React Context (`store/visits.tsx`, `store/notices.tsx`)
- 데이터: 로컬 목(mock)/합성. 날씨·미세먼지는 실제 API.

## 3. 환경변수 (`.env.local`, git 제외)
```
VITE_WEATHER_SOURCE=kma          # 기상청 사용(미설정 시 open-meteo)
DATAGOKR_KEY=<공공데이터포털 Encoding 인증키>   # 기상청 동네예보·에어코리아 공용
VITE_KAKAO_JS_KEY=<카카오 JavaScript 키>        # 카카오맵
```
- **이미 실제 키가 .env.local에 들어가 있고 동작 확인됨.** (값은 커밋 금지)
- 카카오: developers.kakao.com 앱 → JavaScript 키 + **앱 설정>플랫폼키>Web 사이트도메인에 `http://localhost:5173` 등록** 필수.
- CORS·키보안은 Vite 개발 프록시(`vite.config.ts`)가 처리(serviceKey 서버측 주입). **배포 시 동일 역할의 서버 프록시 필요.**

## 4. 개인정보 아키텍처 (핵심 원칙)
- **로컬(PII):** 학생 명부(`src/data/roster.ts`, 335명) + `visit_id ↔ student_id` 매핑(`store/visits.tsx`). 화면은 `studentOf()`로만 이름 복원.
- **서버(비식별):** `Visit` = 방문별 난수 id · 학년 · 성별 · 증상 · 병명계통 · 처치 · 결과 · 시각. **이름·반·번호 없음.**
- 병명 = 12계통(고정) + 개방형 구체 병명, 학생용 쉬운말 타일(8개+"잘모르겠어요").
- 알림 = 익명 토큰 라우팅(접수·종료 2회).

## 5. 폴더/파일 구조 (핵심만)
```
naum/
├─ docs/  PROGRESS.md(이 문서) · health-room-platform-design.md(설계 확정본) · weather-api-setup.md
├─ local-data/  students.xlsx(학생명부 엑셀) · 학교기본정보.csv(부산 학교 원본)
├─ scripts/  gen_roster.py(명부→roster.ts+xlsx) · gen_schools.py(CSV→busanSchools.ts)
├─ .env.local  (키)
├─ server/  백엔드(외부 의존성 0). index.mjs(둘 다 기동) · central.mjs(:8788 비식별 Visit+중계, PII 거부) · station.mjs(:8787 PII 링크+게이트웨이) · lib.mjs(http+SSE+JSON파일 공용) · .data/(영속, git 제외)
├─ scripts/dev-all.mjs  (백엔드+Vite 동시 기동)
├─ vite.config.ts  (개발 프록시: /station, /central + /api/kma, /api/kmawrn, /api/kmaeqk, /api/airstn, /api/air)
└─ src/
   ├─ api/backend.ts  (백엔드 클라이언트: probe + 방문/링크 fetch + SSE 구독. 미가동 시 폴백)
   ├─ App.tsx  (라우팅 + 상단바 '공지 보내기'·'설정' + 전역 모달/토스트)
   ├─ store/  visits.tsx(방문·로컬매핑 + **BroadcastChannel 동기화**: 1 PC 2창=키오스크·콘솔 실시간 공유) · notices.tsx(공지·자동발송·임계치·토스트) · schools.tsx(학교 명부 CRUD 오버레이)
   │          data/treatments.ts(자주 쓰는 처치 추가·로컬 저장)
   ├─ push.ts (웹 알림) · data/ai.ts(다중 AI 제공자 호출+아침/저녁 기본 프롬프트) · data/report.ts(PDF·Word 내보내기) · data/kakaoLoader.ts(지도 SDK 공용)
   ├─ data/routingTokens.ts(학생별 난수 라우팅 토큰·로컬 매핑) · data/relay.ts(익명 중계 서버 시뮬: 토큰만)
   ├─ data/
   │   ├─ types.ts · mock.ts(증상타일·12계통·처치·학생명부 재export)
   │   ├─ roster.ts(생성·기본명부) · localRoster.ts(로컬 명부 업로드 오버레이+CSV파서, localStorage) · busanSchools.ts(생성: 642교, 구·교육지원청·좌표·전화번호)
   │   ├─ eduMock.ts(EduSchool=실제학교+합성 보건지표. cat=현재값·base=평소·enroll=재학생수)
   │   ├─ surveillance.ts(감염병 조기탐지: 평소 대비 증가배수·율·증후군별 학교/지역 신호)
   │   ├─ monthly.ts(이번달/전월/전년동월 일자별, 공휴일·미운영 처리, curFactors)
   │   ├─ weather.ts(등급: 기온·미세먼지·PM2.5·강수) · weatherApi.ts(기상청/에어코리아/Open-Meteo)
   │   ├─ kmaGrid.ts(위경도→격자) · tm.ts(WGS84→TM) · holidays.ts · disasters.ts(경보 판정·임계치) · location.ts(학교 좌표)
   │   ├─ dailyReport.ts(교장 일일 보고 요약) · bogeonLog.ts(보건일지 양식 생성·병명→통계 매핑) · excel.ts(무라이브러리 .xls=SpreadsheetML, 단순표 + 위치/병합/스타일 API)
   │   └─ eduMock/monthly 등
   ├─ store/auth.tsx(역할 로그인: 보건교사/교육청, 라우트 보호) · data/routingTokens·relay·xlsxReader 등
   ├─ pages/  Login(역할 로그인) · Home(역할별 메뉴) · Kiosk(공개) · NurseQueue(보건교사 콘솔) · NurseTreat · Notify · Principal(교장 보고) · RosterManager · ParentRouting · Edu(교육청)
   └─ components/  TreatPanel · AddVisitModal · WeatherBar · DisasterStrip · SchoolMap(카카오) ·
                   SchoolDetail · InfectionPanel · TrendChart · GradeSexChart · HourlyChart ·
                   QuickNoticeModal · AutoNoticeSettings ·
                   SideRail(교육청 좌우 레일) · SchoolAdminPanel(학교 설정) · CoordPicker(좌표 선택) · AiReportPanel(AI 정기보고)
```

## 6. 구현 완료 기능

### 역할 로그인 (`/login`) — `store/auth.tsx` · 4개 역할
- **보건교사**: 이름 + PIN(1234) → **로컬 스테이션**(키오스크·콘솔·명부·교장보고·보호자알림).
- **교사(담임)**: 이름 + 담당 학년/반 + PIN(1234) → **`/teacher`**. **보건실 로컬에 직접 접근하지 않음** — 스테이션이 방문을 **토큰 + 암호문** 이벤트로 중계에 push(`station.ts`), 교사는 **반 채널 토큰**으로 수신, **반 키로 복호화**(E2E, `e2e.ts` AES‑GCM) + **반 한정 매핑**(학생토큰↔이름, 자기 반만 프로비저닝)으로 확인. **중계/서버는 토큰·암호문만** — 이름·증상·결과 못 봄(검증: 평문 전무). `relay.ts` 반 채널 + `routingTokens.getClassToken` + `e2e.getClassKey`.
- **학부모**: 자녀 이름 + 인증번호(1234) → **`/parent`**, *자기 자녀*의 알림만(childId로 필터, 접수/종료 문구). 실제는 등록 토큰/휴대폰 OTP.
- **교육청 담당자**: `edu` / `1234` → **비식별 대시보드**(`/edu`).
- **공지(상단바)**: 보건교사→기본 교육청(+주변학교 토글) / 교육청→학교 / **교사·학부모→"보건실에 알리기"(보건교사 고정·선택지 없음)**. 자동공지 **설정창은 교육청 전용**(보건교사·교사·학부모 모두 숨김). `to: '교육청'|'학교'|'보건교사'`.
- **라우트 보호**(`Protected`): 역할 외 접근 시 `/`로, 미로그인 시 `/login`으로. 홈 메뉴 역할별 필터. **키오스크는 공개**. 상단바 사용자 칩 + 로그아웃. 세션 localStorage(`naum.session`).
- (실운영: 보건교사=로컬/학교 SSO, 교사=학교 계정 담당학급 연동, 학부모=등록토큰/OTP, 교육청=서버 SSO)

### 1 PC 2 스크린 동기화 (로컬 폴백 — 백엔드 미가동 시)
> 백엔드(`npm run server`) 가동 시엔 이 BroadcastChannel 경로 대신 **SSE 실시간 동기화**가 쓰여 **다중 기기**까지 지원된다(위 "백엔드 서버 실제 분리" 참고). 아래는 백엔드 없이 단독 데모할 때의 폴백.
키오스크 창과 콘솔 창을 **같은 PC 두 화면(같은 origin)**으로 띄우면 `store/visits.tsx`의 **BroadcastChannel('naum-visits')** 로 대기열이 실시간 공유됨. 입장 시 sync-request로 기존 창 상태를 받아오고, 변경 시 전체 스냅샷을 브로드캐스트(수신 측은 visit id 기준 병합). visit id에 창별 prefix를 붙여 동시 접수 충돌 방지. (다중 기기는 추후 로컬 스테이션 백엔드+WebSocket로 분리 — 9장 3번.)

### 학생 명부 관리 (`/roster`) — 로컬 업로드
보건교사가 **CSV로 학생 명부를 업로드**(학년·반·번호·이름·성별·보호자연락처). UTF-8/EUC-KR 자동 인식, 미리보기 후 적용→`localStorage('naum.roster')` 저장→새로고침 반영. **PII는 로컬에만**, 서버 미전송. 미업로드 시 기본 명부. 업로드 명부의 **보호자 연락처는 `guardianPhone`으로 처치 화면에 표시**. `data/localRoster.ts`가 기본 명부에 오버레이(키오스크 학반행렬·이름·visit 매핑 모두 반영). 진입: 홈·콘솔 헤더 "명부". (실운영 시 NEIS/학적 연동으로 대체)

### 학생 키오스크 (`/kiosk`)
QR(시뮬) 또는 **학반 행렬(열=학년·행=반)** → 이름 선택 → 증상 그림 타일 **다중 선택** → 대기번호 + 접수 알림.

### 보건교사 콘솔 (`/nurse/queue`)
- 상단 **날씨 바 + 재난·기상 경보**(표시), 헤더에 **교장 보고** 링크
- 1/4·1/2·1/4: 대기 / **항상 열린 처치 화면**(중앙) / 종료
- 처치 화면: 학생 **학반·성별 + 최근 방문 + 학부모 연락처(tel: 바로 통화)**. 증상→병명·계통 자동추천(확인). **처치 다중 — 동일 크기 격자 + "자주 쓰는 처치 추가"(로컬 저장) + 기타 직접입력**. 결과 기본 교실복귀, 귀가→보호자인계, 병원→동행자+이송. 완료 시 다음 대기자 자동 오픈.
- **긴급 공지**: 기본 **교육청 보고**, 하단 토글로 **주변 학교 알림**(지역/학교급).
- **직접 접수(대리)**: 대기열 하단 +버튼 → 학생검색+증상 → 대기/즉시처치(응급)
- 종료자 **사후 보완** 가능

### 담임·학부모 알림 (`/notify`)
담임/학부모 보기 전환, 접수·종료 2회, 결과별 문구, 학부모는 자녀만(이름 로컬 표시).

### 보호자 알림 · 익명 토큰 라우팅 데모 (`/parents`)
앞서 설계한 **분할 지식 구조**를 3열로 시연: ① **보건실 로컬**(이름↔난수 토큰, PII, `routingTokens.ts`/localStorage `naum.rtokens`) ② **중계 서버**(토큰↔채널·발송로그만, 이름·전화 없음, `relay.ts`/`naum.relay.*`) ③ **보호자 휴대폰**(토큰을 자기 자녀로 풀어 표시). 흐름: 토큰 발급 → 보호자 QR 등록(서버엔 토큰만) → 방문 시 토큰으로 발송 → 보호자만 자녀임을 앎. **검증**: 서버 뷰에 학생 이름 미노출(serverShowsName=false), 보호자 뷰엔 노출, localStorage 분리 확인. 실운영: 채널=앱푸시/web-push(전화번호 불필요) 또는 연락처 게이트웨이 분리(알림톡). 라우팅 토큰은 방문 비식별 토큰과 별개.

### 교장 보고 (`/principal`) — 학교 단위(로컬 방문 기반). 진입: 보건교사 콘솔 헤더 "교장 보고" + 홈
- **오늘 일일 보고**: 로컬 방문에서 자동 집계(총방문·결과분포·최다계통·특이사항). **업무 종료(17:00) 시 자동 마감**(매분 확인, localStorage `naum.dailyReports`에 스냅샷 영속) + **수동 "지금 마감"**.
- **월간 일일 보고 표**: 이번 달 1일~오늘(운영일/미운영일 구분, 오늘 강조). 과거일은 결정적 합성, 마감본은 실데이터.
- **보건일지 엑셀(주별 시트)** — 업로드한 실제 **「2월-보건일지.xlsx」 양식과 동일 형식**: `bogeonLog.buildBogeonSheets` → 주(週)별 시트, 각 시트에 **평일 5일 블록 가로 배치**(제목·결재란·날짜/날씨·보건교육/보건업무/응급처치및상담/학교행사·**응급처치 표**[연번·학년반·이름·성별·병명·처치]·**통계**[14개 병명분류 × 일계/월계/누계 × 남/여]). `excel.downloadExcelX`(위치/병합/스타일 SpreadsheetML).
  - **병명 다중 규칙**: 병명칸엔 여러 병명 모두 표시, **통계는 첫 번째 병명만** 집계(`bogeonCatIndex`로 14분류 매핑). 오늘=로컬 실방문(이름·반 로컬), 과거일=명부 기반 합성.
  - 전자결재는 미구현(요구 제외). 결재란은 양식상 빈 칸으로만 표시.

### 교육청 대시보드 (`/edu`) — 가장 방대
- 상단: **날씨 바(부산정보고 좌표 기준)** + 재난·기상 경보 + **CSV/보고서(PDF) 다운로드**
- **필터(계층 연동)**: 기간(오늘/주/이번달) · 지역(16구군) · **교육청(교육지원청)** · 학교급(초중고특기타) · 계통. + 추이 **날짜 클릭=선택일**. "적용 범위" 바 표시.
- **카카오맵**(높이 600): 642개 실제 학교, 학교급별 색상 핀, 이상신호=빨간별, **초미세먼지 나쁨/매우나쁨 시 반투명 경보 오버레이**, 마커 클릭→**학교 드릴다운**(SchoolDetail: 날씨·KPI·추이·계통분포)
- **KPI**: 총방문·학교수·최다계통·이상신호 (필터·선택일 연동)
- **방문 추이**(월간): 이번달/전월/전년동월 3선 + 전월·전년 대비 %, **공휴일·주말 보간**(선·실제0), 날짜 클릭 연동
- **학교급·학년/남녀별**(GradeSexChart, 초중고 3막대, 토글) + **시간대별 07~21시**(HourlyChart) — 추이·기간·선택일·계통과 동일 집계(chartTotal) 연동, 색 구분
- **병명 계통별 현황**: 막대 **클릭 시 계통 선택**→모든 차트 연동
- **이상 신호 · 감염병 모니터링(통합 InfectionPanel)** — **평소(baseline) 대비 조기탐지로 고도화**:
  - **증후군별 조기신호**(발열호흡기/구토설사/발진/눈충혈/감염병): 확진 전 증상 단위로 **평소 대비 증가배수(×)** 카드
  - **지역 확산 경보**: 고정 합계 대신 같은 구 동시 상승(공간 군집)을 평소 대비 배수+최소건수로 판정(주의/경보)
  - **학교 경보**: 평소 대비 급증 + **율(재학생 1000명당)**, 증가배수 순 정렬
  - 감염병 추이(날짜 클릭→건수 연동) / 지역별 막대(배수 표시) / 상위 학교
  - **임계치 설정창(⚙)**: 경보·주의 증가배수, 학교/지역 최소건수 편집(저장)
  - 탐지 로직은 `data/surveillance.ts`(schoolSignal·regionSignals·syndromeSignals), 데이터는 `eduMock`의 cat(현재)/base(평소)/enroll.
- **공지**: 경보·이상신호의 "공지 발송"→내용·**대상 자동선택**(지역 경보→구, 학교 이상신호→그 학교 1개교). 보낸 공지 동적 누적.
- **좌우 사이드 레일(SideRail)** — 본문(920px) 양옆 여백 활용. **기본 닫힘**(가장자리 탭 클릭 시 열림). 넓은 화면(≥1440px)=여백에 docked, 좁은 화면=오버레이 서랍.
  - **왼쪽 · 학교 설정(SchoolAdminPanel)**: 매년 폐교·증설·정보변경 반영. 추가/수정/폐교/복원/초기화. `store/schools.tsx`가 기본 642교에 localStorage 오버레이를 병합 → KPI·지도·집계에 **즉시 반영**. 추가 학교는 `makeEduSchool`로 cat/base/enroll 자동 생성.
    - **좌표는 카카오맵에서 클릭 선택**(CoordPicker → `kakaoLoader.ts` 공용 로더). 학교 **전화번호** 입력·검색 표시(busanSchools에 `tel` 추가, `gen_schools.py` 재생성).
  - **오른쪽 · AI 정기 보고(AiReportPanel)**: 현재 대시보드 **비식별 집계**를 프롬프트로 AI 호출. 보고 3종:
    - **아침 보고(08:00)**: 날씨·대기질 + 전날 저녁 보고 이후 특이사항 + 장학사 확인사항. **저녁 보고(17:00)**: 당일 17시까지 데이터로 정식 일일보고서. **주기 보고(30분·1시간)**: 직전 보고 이후 변화만 짧게.
    - **PDF(인쇄창)·Word(.doc) 다운로드**(`data/report.ts`, 무라이브러리) — 모든 보고 카드에서.
    - 자동 생성: 아침·저녁 **정기 토글(기본 ON, 하루 1회)** + 주기 보고 **30분/1시간 세그먼트**. 각 보고 **수동 즉시 생성** 버튼도 제공.
    - **API·프롬프트 설정 팝업**: 제공자(Gemini/OpenAI/Anthropic/커스텀-OpenAI호환) + 키 + 모델(+Base URL) + **아침/저녁/주기 보고 프롬프트 각각 수정**(기본값 복원). 모두 localStorage 저장, 비식별 집계만 전송, 학생 PII 미포함.

### 공지·알림 시스템 (전역)
- 상단 **"공지 보내기"** 버튼(어디서나) + **"설정"**
- **자동 공지 설정창**: 경보별 ON/OFF + 대상 + **임계치 편집**(초미세먼지·호우·폭염·한파, localStorage 저장). 경보 발생 시 자동 발송(하루 1회).
- **앱 푸시**(웹 알림): 발송 시 OS 알림 + 화면 토스트. 설정창에서 알림 허용.

## 7. API 연동 현황
- ✅ **기상청 동네예보**(초단기실황) — 좌표→격자, 실연동 확인
- ✅ **에어코리아 미세먼지** — 좌표→TM→최근접 측정소 실측(getNearbyMsrstnList+getMsrstnAcctoRltmMesureDnsty), 실연동 확인. 실패 시 Open-Meteo 폴백.
- ✅ **카카오맵** — JS키+도메인 등록, 실연동 확인
- ⏳ **공식 재난 API**(기상청 기상특보 getWthrWrnList·지진 getEqkMsg·행안부 긴급재난문자) — 사용자 **활용신청 중(승인 대기)**. 프록시(`/api/kmawrn`,`/api/kmaeqk`) 준비됨. `disasters.ts`의 `fetchOfficialAlerts()`는 현재 `[]` 반환 → **승인 후 실제 응답 보고 파서 작성→deriveAlerts와 병합** 예정. (행안부 재난문자는 IP 등록 필요했음 / safetydata 별도 가능성)

## 8. 실제 vs 데모(합성) 데이터
- **실제:** 부산 642개 학교(이름·구·교육지원청·좌표), 날씨, 미세먼지
- **데모 합성:** 보건 방문 수치(계통별·일자별·학년·성별·시간대), 감염병(사하구 핫스팟), 전월/전년 동월, 학생 명부(335명)
- 실제 운영 시: 각 학교가 플랫폼을 쓰며 쌓이는 비식별 Visit 데이터로 대체.

## 9. 미완료 / 다음 단계 (우선순위 제안)
1. **공식 재난 API 연동 마무리** (승인되면 fetchOfficialAlerts 파서 작성 → 경보 패널·자동공지에 합류)
2. **실제 발송 채널**: 앱푸시는 로컬 알림까지 구현 → 원격(학부모 휴대폰)은 **FCM/web-push 서버** 또는 카카오 알림톡/문자 연동 필요
3. ~~**서버/로컬 실제 분리**~~ **(구현 완료, 2026-06-17)**: 로컬 스테이션(:8787 PII 링크)+비식별 중앙 서버(:8788) 실제 구현, SSE 실시간 동기화·다중 기기·자동 폴백. `server/`·`src/api/backend.ts`. **남은 일**: ① 운영 배포 시 두 서버 물리 분리(현재 개발용 단일 프로세스) ② 인증/권한(현재 무인증) ③ JSON 파일→실DB ④ **중계(relay)·명부 업로드도 백엔드로 이전**(현재 알림 relay·roster는 아직 localStorage 시뮬) ⑤ SSE→재연결/오프라인 큐 보강.
4. **전자결재(계→부장→교장)** 미구현. (교장 일일/월간 보고는 `/principal`에 구현 완료 — 일일 자동 마감 + 주간 시트 엑셀.)
5. **배포 인프라**: Vite 개발 프록시 → 운영 서버 프록시(키 보관), 카카오 도메인 추가. **AI 보고도 현재 브라우저→제공자 직접 호출** → 운영 시 키 노출·CORS 방지 위해 **서버 프록시** 경유로 전환 필요.
6. 지도 PDF 캡처(html2canvas) 등 다듬기
7. **감염병 탐지 실데이터 고도화**(구현 완료): 현재 `surveillance.ts`는 합성 baseline·증후군=계통 매핑. 실운영 시 → ① baseline을 **이동 4주 평균/전년 동기**로 대체(현재 `eduMock.base`) ② 증후군을 계통이 아닌 **증상 타일 조합**(발열+호흡기 등)으로 분해 ③ **학교 출결(결석률)** 연계 ④ 질병청 감염병 표본감시(인플루엔자·수족구 등) 외부 데이터 결합 ⑤ CUSUM/EWMA 관리도로 통계적 유의성 강화.
8. **학교 설정 영속화**: 현재 학교 CRUD는 브라우저 localStorage 오버레이 → 서버 분리(3번) 시 교육청 DB의 학교 마스터로 이전.

## 10. 작업 규칙(참고)
- 실제 작업 폴더: `C:\Users\user\OneDrive\Documents\naum` (cwd는 bs-connect2지만 이 프로젝트는 별도)
- 변경 후 항상 `npm run build`로 타입체크 통과 확인
- 데이터 재생성: `python scripts/gen_roster.py`(명부), `python scripts/gen_schools.py`(학교, local-data/CSV 필요)
- 개인정보 원칙 준수: 서버/LLM/외부로 이름·반·번호 보내지 않기
