-- 0008 — 가입 역할을 클라이언트가 조작할 수 없는 app_metadata 에서만 신뢰.
-- 배경: 0001 트리거는 role 을 raw_user_meta_data(클라이언트 signUp 시 임의 지정 가능)에서 읽고
--       기본값이 'nurse' 였다 → 토큰 없이도 아무나 보건교사 계정 자칭 가입 가능(권한 상승 구멍).
-- 변경: role 을 raw_app_meta_data(service_role/admin 만 설정 가능)에서 읽고, 없으면 최소권한 'teacher'.
--       보건교사·교육청 계정은 api/token.js(service-role, app_metadata.role 지정)로만 생성된다.
-- ※ 이 마이그레이션은 api/token.js 환경변수 설정과 "함께" 배포해야 한다(가입 경로가 서버로 이전됨).
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text;
begin
  -- app_metadata.role 만 신뢰(클라이언트 조작 불가). 미지정/비정상이면 최소권한 teacher.
  r := coalesce(new.raw_app_meta_data->>'role', 'teacher');
  if r not in ('nurse','teacher','parent','edu') then r := 'teacher'; end if;
  insert into public.profiles (id, role, name, org)
  values (
    new.id,
    r,
    coalesce(new.raw_user_meta_data->>'name',''),
    coalesce(new.raw_app_meta_data->>'org', new.raw_user_meta_data->>'org','')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- 트리거 자체는 0001 에서 생성됨(on_auth_user_created). 함수만 교체하면 적용된다.
-- (선택 권장) Supabase 대시보드 > Authentication > Providers > Email 에서
--   "Allow new users to sign up" 을 꺼두면 공개 signUp 자체가 막혀 방어가 완전해진다.
--   api/token.js 의 admin 생성은 이 설정과 무관하게 동작한다.
