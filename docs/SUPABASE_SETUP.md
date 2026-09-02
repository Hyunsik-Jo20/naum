# 나음(NaUM) — Supabase + Vercel 배포 런북

> 클라우드 배포용 설정. **로컬/연수용 데모는 이 설정과 무관하게 그대로 동작**한다(`VITE_SUPABASE_URL` 미설정 시 자동으로 in-browser 모드).

## 0. 동작 모드 한눈에
| 모드 | 조건 | 방문 데이터 | 링크(PII) | 실시간 | 인증 |
|---|---|---|---|---|---|
| **supabase** | `VITE_SUPABASE_URL`+`ANON_KEY` 설정 | Supabase(비식별) | 브라우저 로컬 | Supabase Realtime | 이메일+비밀번호 |
| backend | Node 서버 기동(`npm run server`) | 중앙 서버(:8788) | 스테이션(:8787) | SSE | 데모 PIN |
| local | 위 둘 다 없음 (연수 데모) | in-browser | in-browser | BroadcastChannel | 데모 PIN |

**개인정보 원칙(supabase 모드)**: 클라우드에는 **비식별 데이터만** 저장된다. 이름·반·번호·보호자연락처·`visit↔student` 링크는 **보건교사 브라우저(localStorage)** 에만 남는다 — 클라우드는 학생을 식별할 수 없다.

---

## 1. Supabase 프로젝트 생성
1. https://supabase.com → 새 프로젝트 생성(Region: **Northeast Asia (Seoul)** 권장).
2. 프로젝트가 준비되면 **Project Settings → API** 에서 두 값 확인:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`

## 2. 스키마 생성
대시보드 **SQL Editor → New query** 에서 아래 3개를 순서대로 각각 **Run**(모두 멱등 — 재실행 안전):
1. `supabase/migrations/0001_init.sql` — `profiles`, `visits`(비식별), `relay_*` + RLS + Realtime + 가입 트리거.
2. `supabase/migrations/0002_fix_policies.sql` — RLS 정책 보정(0001 부분적용 대비).
3. `supabase/migrations/0003_links_relay.sql` — `visit_links`(암호화 링크=다기기 이름복원) + relay 발신 정책(anon 포함) + Realtime.

## 3. 계정(역할) 만들기
로그인은 **이메일+비밀번호**, 역할은 `profiles.role` 로 결정된다.
1. **Authentication → Users → Add user** 로 사용자 생성(이메일/비밀번호). 가입 트리거가 기본 프로필(role=`nurse`)을 만든다.
2. **SQL Editor** 에서 역할/소속을 지정(예시):
```sql
-- 보건교사
update public.profiles set role='nurse', name='김보건', org='부산정보고등학교', school_id='demo'
where id = (select id from auth.users where email='nurse@example.com');

-- 교육청
update public.profiles set role='edu', name='교육청 담당자', org='부산광역시교육청'
where id = (select id from auth.users where email='edu@example.com');

-- 교사(담임) — 담당 학년/반
update public.profiles set role='teacher', name='이담임', org='부산정보고등학교', grade=1, class_no=1
where id = (select id from auth.users where email='teacher@example.com');

-- 학부모 — 자녀(주의: child_id/child_name 은 PII. 가능하면 클라이언트 로컬 매핑 권장)
update public.profiles set role='parent', name='장지호 보호자', child_name='장지호'
where id = (select id from auth.users where email='parent@example.com');
```
> 키오스크는 로그인이 필요 없다(공개). RLS가 anon insert만 허용.

## 3-1. 데모 계정(클라우드) — 빠른 로그인 버튼과 연동
로그인 화면의 "데모 빠른 로그인" 4버튼은 아래 계정을 사용한다(대시보드 Add user + Auto Confirm로 생성, profiles 역할 지정):
| 이메일 | 비번 | 역할 | profiles |
|---|---|---|---|
| nurse@naum.kr | 123456 | 보건교사 | role=nurse |
| teacher@naum.kr | 123456 | 담임 | role=teacher, grade=1, class_no=1 |
| parent@naum.kr | 123456 | 학부모 | role=parent, child_id=s1_1_1(장지호) |
| edu@naum.kr | 123456 | 교육청 | role=edu |
> 비번/이메일 변경 시 `src/pages/Login.tsx`의 `DEMO_PW`·`DEMO_ACCOUNTS`도 맞춰야 함.
> ⚠️ relay/암호화링크가 기기·환경 간 복호화되려면 **`VITE_SCHOOL_LINK_SECRET`이 로컬·Vercel 동일**해야 함(현재 `.env.local` 값과 Vercel 값 일치 확인).

## 4. 로컬에서 클라우드 모드 시험(선택)
`.env.local` 에 추가 후 `npm run dev`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
# (날씨/지도 키는 기존대로)
```
- 로그인 화면이 **이메일+비밀번호 단일 폼**으로 바뀌면 클라우드 모드.
- 키오스크 접수 → Supabase `visits` 테이블에 비식별 행 생성(이름 없음) 확인.

## 5. Vercel 배포
1. https://vercel.com → **Add New → Project** → 이 저장소 import.
2. Framework: **Vite** 자동 인식. (`vercel.json` 포함)
3. **Environment Variables** 등록:
   | 키 | 값 | 노출 |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Supabase URL | 클라이언트 |
   | `VITE_SUPABASE_ANON_KEY` | anon key | 클라이언트 |
   | `VITE_KAKAO_JS_KEY` | 카카오 JS 키 | 클라이언트 |
   | `VITE_WEATHER_SOURCE` | `kma` (선택) | 클라이언트 |
   | `VITE_SCHOOL_ID` | 학교 식별자(선택, 기본 `demo`) | 클라이언트 |
   | `VITE_SCHOOL_LINK_SECRET` | 학교 공유 비밀(암호화 링크·relay 키 토대). 긴 무작위 문자열, **같은 학교 전 기기 동일** | 클라이언트 |
   | `DATAGOKR_KEY` | 공공데이터포털 Encoding 키 | **서버 전용**(VITE_ 없음) |
4. **Deploy**. 빌드 후 `https://<프로젝트>.vercel.app` 발급.
   - `/api/*` 서버리스 함수가 data.go.kr 프록시(serviceKey 서버 주입)를 담당 → 개발 Vite 프록시와 동일.
5. **카카오 도메인 등록**: Kakao Developers → 앱 → 플랫폼 → Web 사이트 도메인에 `https://<프로젝트>.vercel.app` 추가(지도 로드에 필수).

## 5-1. 토큰 서버 게이트(보안 강화) — `api/token.js`
> **왜**: 예전 토큰은 클라이언트 번들의 `VITE_SCHOOL_LINK_SECRET`에서 파생 → 번들에서 비밀을 꺼내 **가입/로그인 토큰 위조 가능**했고, 보건교사 가입이 클라이언트 `signUp(role 메타)`라 **토큰 없이도 자칭 가입**이 됐다. 이를 서버 HMAC 서명 + service-role 가입 게이트로 차단한다.
> **아래 3개(0008 마이그레이션 + 환경변수)를 함께 배포**해야 완성된다. 미설정 시 서버가 501을 반환 → 클라이언트가 기존 로컬 동작으로 폴백(앱은 안 깨짐)하지만 **보안 강화는 적용 안 됨**.

1. **마이그레이션 0008 적용**: `supabase/migrations/0008_role_from_app_meta.sql` 실행 → 가입 트리거가 role을 **`app_metadata`(service_role만 설정 가능)** 에서만 읽고, 없으면 최소권한 `teacher`. (클라이언트 `signUp`의 role 메타는 무시됨 → 무단 보건교사 가입 차단.)
2. **Vercel 환경변수 추가**(모두 **서버 전용**, VITE_ 없음):
   | 키 | 값 | 비고 |
   |---|---|---|
   | `TOKEN_SIGNING_SECRET` | 긴 무작위 문자열 | 토큰 HMAC 서명 키(서버만 보유, 번들 미포함) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` 키 | 가입 계정 생성(admin API)용. **절대 클라이언트 노출 금지** |
   | `EDU_ISSUE_SECRET` | 긴 무작위 문자열(선택) | 교육청이 데모(계정 없이) 가입토큰 발급 시 입력하는 발급 비밀. 실계정(role=edu)이 있으면 불필요 |
   - `SUPABASE_URL`/`SUPABASE_ANON_KEY`는 없으면 함수가 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`를 자동 사용(별도 등록 불필요).
3. **(권장) 공개 signUp 차단**: Supabase → Authentication → Providers → Email → "Allow new users to sign up" **OFF**. `api/token.js`의 admin 생성은 이 설정과 무관하게 동작하므로, 정상 가입은 유지되고 우회 가입만 막힌다.
- 발급 권한: **로그인 토큰(교사·학부모)** = 보건교사 로그인 세션(JWT role=nurse) 필요 / **가입 토큰(보건교사)** = 교육청 계정(role=edu) 또는 `EDU_ISSUE_SECRET`.
- 검증: 교사·학부모 토큰 로그인·보건교사 가입은 서버가 HMAC 검증. `v1.` 접두 토큰은 서버 검증 필수(위조 불가), 예전(레거시) 토큰은 서버 미설정 환경에서만 로컬 복호.

## 5-2. 키 서버 — 학교 비밀 번들 노출 제거(`api/keys.js`, **2단계 배포**)
> **왜**: `VITE_SCHOOL_LINK_SECRET`(E2E 마스터 키)이 클라이언트 번들에 있어 누구나 추출→전교 복호 가능했다.
> **해결**: 마스터 비밀을 서버 전용으로 옮기고, `/api/keys`가 인증·권한만큼만 키를 발급(학부모=자녀 키 1개 등). 파생 알고리즘은 동일 → **기존 암호문 그대로 복호(재암호화 불필요)**.

**Phase 1 — 서버 키 발급 활성화(데이터 무손실)**
1. Vercel 환경변수(서버 전용) 추가: **`SCHOOL_MASTER_SECRET` = 현재 `VITE_SCHOOL_LINK_SECRET`과 동일한 값**. (그래야 기존 링크·relay 암호문이 그대로 복호됨.) `TOKEN_SIGNING_SECRET`·`SUPABASE_*`는 §5-1 것 재사용.
2. 재배포. 이제 앱은 서버 발급 키를 우선 사용(미설정 시 로컬 폴백이라 무중단).
3. 확인: 보건교사 콘솔 이름 복원·교사/학부모 알림 정상.

**Phase 2 — 번들에서 비밀 제거 ✅ 완료·실검증(2026-07-29)**

> ✅ **완료(2026-07-29)**: Vercel `VITE_SCHOOL_LINK_SECRET` 삭제 + 무캐시 재배포. 실검증 — ① 새 번들 `index-ws1NaADO.js`에 비밀 문자열 **없음** ② 서버 발급 키가 제거 전과 **바이트 동일**(links·class·student·token) ③ 보건교사 콘솔이 서버 키로 복호 → **이름복원 정상**(실제 학생 이름·학부모 연락처 렌더), 콘솔 에러 0. 아래 절차는 재현/참고용.

4. Phase 1이 정상 확인되면, 클라이언트 env에서 **`VITE_SCHOOL_LINK_SECRET` 제거** 후 재배포.
   - Vercel → Project → Settings → Environment Variables → `VITE_SCHOOL_LINK_SECRET` 삭제(**Production·Preview 모두**) → Save.
   - **재배포는 반드시 새 빌드로**: Deployments → 최신 → Redeploy 시 **"Use existing Build Cache" 체크 해제**(캐시 재사용하면 옛 번들에 비밀이 남음). 또는 아무 커밋이나 push해서 새 빌드 유발.
   → 번들에 마스터 비밀이 더는 없음. 이후 키는 **오직 서버 발급**(비인증 추출 불가, 학부모는 자녀 키만).
5. **검증(제거 후)**: 아래 명령으로 번들에서 비밀이 사라졌는지 확인 + 앱에서 이름복원·교사/학부모 알림 정상 확인.
   ```bash
   # .env.local의 비밀 문자열이 배포 번들에 남아있는지 검사(NO여야 성공)
   node -e 'const https=require("https"),fs=require("fs");const s=(fs.readFileSync(".env.local","utf8").match(/VITE_SCHOOL_LINK_SECRET=(.*)/)||[])[1].trim();const g=u=>new Promise(r=>https.get(u,x=>{let d="";x.on("data",c=>d+=c);x.on("end",()=>r(d))}));(async()=>{const h=await g("https://naum-kappa.vercel.app/");const a=[...new Set([...h.matchAll(/\/assets\/([\w\-]+\.js)/g)].map(m=>m[1]))];let f=null;for(const x of a){if((await g("https://naum-kappa.vercel.app/assets/"+x)).includes(s)){f=x;break}}console.log("secret in bundle:",f?"YES "+f:"NO ✅")})()'
   ```
   - ⚠️ 레거시(non-`v1.`) 로그인 토큰은 클라 SECRET로 복호하므로, 비밀 제거 후엔 **기존에 발급한 옛 교사/학부모 토큰이 안 풀릴 수 있음**. 서버 `v1.` 토큰으로 재발급(로그인 토큰 모달에서 새로 발급)하면 해소. (연수/데모는 토큰 재발급이라 무관.)
6. 트레이드오프: 서버가 마스터 비밀을 보유(기술적으로 복호 가능) — "서버 복호 불가"에서 "서버가 키를 쥐지만 스코프·인증으로 제한"으로 신뢰 모델 변경. 완전 E2E는 교사·학부모 계정 모델 대변경이 필요해 후속.

## 5-3. 공용 멀티테넌트(다학교 운영, 2026-08 전환)
> **한 배포·한 DB로 여러 학교**. 격리는 RLS(0012)가 DB에서 강제: nurse=자기 학교만 조회·수정·삭제,
> edu=전 학교 **비식별** 조회(교육청 실시간 대시보드), 키·토큰은 학교별로 파생(타 학교 키 획득 불가).
> 테넌트 id = 부산 학교 명부(busanSchools) id(`b###`). `demo` = 시연용(실집계 제외).

**활성화 순서(1회)**
1. **마이그레이션 0012** 적용: `supabase/migrations/0012_multi_tenant_scope.sql` — 비파괴(기존 계정은 demo 귀속).
2. 코드 배포(Phase 2·3 — git push로 자동).
3. **정리 SQL 실행**(키 체계가 학교별로 바뀌어 기존 암호문·라우팅 토큰 무효 — 초기화 확정됨):
   ```sql
   truncate public.visit_links, public.relay_class_inbox,
            public.relay_student_inbox, public.relay_nurse_inbox;
   -- (선택) 연수 방문도 정리: delete from public.visits where school_id = 'demo';
   ```
4. 기존 발급 토큰(교사·학부모, 학교 정보 없음)은 demo 귀속 → 실학교 운영 계정에는 **재발급**.

**학교 온보딩 흐름(운영)**
1. 교육청 로그인 → 대시보드 "보건교사 가입 토큰" → **학교를 명부에서 검색·선택** → 토큰 발급(학교 id가 서명 포함).
2. 보건교사: 로그인 화면 "보건교사 회원가입" — 토큰+이메일/비번 → 계정이 그 학교로 귀속(profiles.school_id).
3. 보건교사 로그인 → **그 브라우저(기기)가 학교에 바인딩**(`naum.school`) → 같은 브라우저의 키오스크 탭이 그 학교로 접수. (키오스크 전용 기기는 보건교사 로그인 1회로 바인딩 — 미바인딩이면 키오스크에 안내 배너.)
4. 보건교사가 담임·학부모 토큰 발급(서버가 학교를 자동 스탬프) → 담임 가입/로그인, 학부모 토큰 로그인.
5. 접수가 시작되면 교육청 대시보드에 해당 학교 수치가 **실시간** 반영(지도·KPI·조기탐지).

**수용 리스크(P1 후속)**: 키오스크 anon INSERT의 school_id는 클라이언트 값(스푸핑 가능) — 데이터 위변조 방지는 rate-limit/Turnstile 후속. relay anon insert 크기·횟수 제한도 동일 후속.

## 6. 점검 체크리스트
- [ ] 로그인(이메일+비밀번호) 성공 → 역할별 화면 진입
- [ ] 키오스크 접수 → 콘솔 대기열 즉시 반영(Realtime)
- [ ] Supabase `visits` 행에 이름/반/번호/studentId **없음**(비식별 확인)
- [ ] 날씨·미세먼지·지도 정상(키/도메인 등록 확인)

## 7. 다기기 이름복원·알림(구현됨) — 키 공유 주의
- **다기기 이름 복원(암호화 링크)**: `visit_links`에 studentId를 **학교 키로 암호화**해 저장 → 다른 기기 콘솔도 복호화로 이름 복원. 서버는 복호화 불가.
- **교사·학부모 알림(relay)**: 접수/종료 시 나음이 `relay_*`에 **토큰+암호문** 발신, 교사(반 키)·학부모(학생 키)가 Realtime 수신·복호화.
- ⚠️ 키는 서버(`/api/keys`)가 `SCHOOL_MASTER_SECRET`에서 **학교별로** 파생해 인증·권한만큼 발급(5-2·5-3). 같은 학교 기기끼리는 자동으로 같은 키, 다른 학교는 키가 달라 복호 불가(격리).

## 7-1. 접수 도착 폰 푸시(Web Push) 설정 — `api/push.js`
앱이 닫혀 있어도 보건교사 폰/PC로 "새 접수 — 대기 N명" 알림(비식별)이 도착한다.
1. **SQL**: `supabase/migrations/0013_push_subs.sql` 실행(구독 저장소 `push_subs`, RLS로 클라이언트 접근 차단 — 서버 함수만 사용).
2. **Vercel env** 추가 후 재배포: `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` (`.env.local` 하단에 생성해 둔 값. 새로 만들려면 `node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"`). 선택: `PUSH_VAPID_SUBJECT`(mailto:주소).
3. **기기 등록**: 알림 받을 기기(폰 포함)에서 보건교사 로그인 → 콘솔 좌측 "이 기기에서 접수 푸시 알림 받기" → 권한 허용. 기기별 1회.
   - 아이폰은 iOS 16.4+ 에서 **홈 화면에 추가한 앱**으로 열었을 때만 푸시 가능. 안드로이드/PC 크롬은 브라우저에서도 동작.
- 발송 경로: 접수(키오스크·콘솔 수동) → `/api/push notify` → 학교의 모든 구독 기기. 학교당 분당 10건 상한, 만료 구독 자동 정리.

## 7-2. 증상 목록 다기기 동기화 + 교직원 접수 (0014·0015)
- `0014_school_settings.sql`: 증상 편집(콘솔)이 키오스크 등 다른 기기에 자동 반영되도록 학교별 공유 설정 테이블 생성. 미적용 시 기존처럼 편집 기기에만 반영.
- `0015_staff_visits.sql`: `visits.is_staff` 컬럼 — 콘솔 "교직원 접수"용. 미적용 시 교직원 접수가 클라우드 업로드에서 실패(로컬만 기록)하므로 교직원 접수 사용 전 필수.

## 8. 알려진 한계 / 후속
- **키 모델**: 학교 비밀이 클라이언트 번들에 포함 → "DB 유출 시 식별 불가"는 보장하나, 앱+계정 접근자는 복호화 가능. 진짜 사용자별 키 교환은 후속.
- **교사/학부모 계정**: profiles에 `grade/class_no`(교사)·`child_id`(학부모) 지정 필요(3장 SQL 예시).
- **휴대폰 OTP**: 지금은 비밀번호. 전환 시 `auth.tsx`의 `loginPassword` → `supabase.auth.signInWithOtp({phone})` + 검증으로 교체(폼만 변경, 나머지 구조 동일).
- 번들: 라우트 코드분할 적용(메인 ~520KB, Edu 등 분리). 추가 최적화 여지 있음.
