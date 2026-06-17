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

## 6. 점검 체크리스트
- [ ] 로그인(이메일+비밀번호) 성공 → 역할별 화면 진입
- [ ] 키오스크 접수 → 콘솔 대기열 즉시 반영(Realtime)
- [ ] Supabase `visits` 행에 이름/반/번호/studentId **없음**(비식별 확인)
- [ ] 날씨·미세먼지·지도 정상(키/도메인 등록 확인)

## 7. 다기기 이름복원·알림(구현됨) — 키 공유 주의
- **다기기 이름 복원(암호화 링크)**: `visit_links`에 studentId를 **학교 키로 암호화**해 저장 → 다른 기기 콘솔도 복호화로 이름 복원. 서버는 복호화 불가.
- **교사·학부모 알림(relay)**: 접수/종료 시 나음이 `relay_*`에 **토큰+암호문** 발신, 교사(반 키)·학부모(학생 키)가 Realtime 수신·복호화.
- ⚠️ 위 둘은 **`VITE_SCHOOL_LINK_SECRET`이 같은 학교 전 기기에 동일**해야 동작(키 파생 토대). 값이 다르면 복호화 실패로 이름/알림이 안 풀림.

## 8. 알려진 한계 / 후속
- **키 모델**: 학교 비밀이 클라이언트 번들에 포함 → "DB 유출 시 식별 불가"는 보장하나, 앱+계정 접근자는 복호화 가능. 진짜 사용자별 키 교환은 후속.
- **교사/학부모 계정**: profiles에 `grade/class_no`(교사)·`child_id`(학부모) 지정 필요(3장 SQL 예시).
- **휴대폰 OTP**: 지금은 비밀번호. 전환 시 `auth.tsx`의 `loginPassword` → `supabase.auth.signInWithOtp({phone})` + 검증으로 교체(폼만 변경, 나머지 구조 동일).
- 번들: 라우트 코드분할 적용(메인 ~520KB, Edu 등 분리). 추가 최적화 여지 있음.
