-- 0017 — 담임·학부모 알림 relay에 학교 칸(school_id) 추가.
-- 배경(2026-10 현장 이슈): relay_class_inbox / relay_student_inbox에는 학교 구분이 없어 "반 토큰"만으로
--   수신을 나눴다. 키 서버 폴백(로그아웃한 키오스크·비밀번호 로그인 담임 등) 때는 모든 학교의 토큰이
--   같아져, 다른 학교·테스트초(demo) 시뮬레이션 접수가 남의 학교 담임·학부모 화면과 보건교사의
--   '잃어버린 접수 찾기' 후보에 섞였다.
-- 조치: 발신 시 school_id를 찍고(클라이언트), 수신은 school_id로 거른다.
--   · 기존 행은 학교를 알 수 없어 null로 둔다 → 새 코드의 수신 화면에서는 보이지 않는다(과거 알림만 해당).
--   · 비파괴·멱등. 코드 배포 전/후 어느 쪽에 적용해도 된다(클라이언트가 컬럼 유무를 감지해 폴백).
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

alter table public.relay_class_inbox   add column if not exists school_id text;
alter table public.relay_student_inbox add column if not exists school_id text;

create index if not exists relay_class_inbox_school_token_idx
  on public.relay_class_inbox (school_id, class_token, ts desc);
create index if not exists relay_student_inbox_school_token_idx
  on public.relay_student_inbox (school_id, student_token, ts desc);

-- PostgREST 스키마 캐시 갱신(새 컬럼 즉시 인식)
notify pgrst, 'reload schema';

-- ── 함께 실행 권장: 보건교사 접수 푸시 구독 정리 ──
--   push_subs.school_id는 "켤 때" 학교로 고정돼, 테스트초(demo)로 켠 실학교 보건교사 폰이 테스트초
--   시뮬레이션 접수 푸시를 계속 받았다. 새 코드는 보건교사가 앱을 열 때 자기 학교로 다시 등록하므로,
--   demo 구독을 지워도 테스트초를 실제로 쓰는 기기는 다음 접속 때 자동 재등록된다.
-- select school_id, count(*) from public.push_subs group by school_id order by 2 desc;  -- 현황
-- delete from public.push_subs where school_id = 'demo';
