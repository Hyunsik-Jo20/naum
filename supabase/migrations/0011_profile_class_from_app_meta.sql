-- 0011 — 가입 트리거가 담당 학년·반(및 자녀)도 app_metadata에서 profiles에 기록.
-- 배경: 담임교사 계정(토큰→가입)이 도입되면서, api/token.js가 app_metadata에
--   { role:'teacher', grade, classNo }를 넣는다. 0008 트리거는 role/name/org만 기록했으므로
--   grade/class_no가 비어 담임 화면이 반을 못 잡는다. → 트리거를 확장해 함께 기록.
-- app_metadata는 service_role(admin)만 설정 가능 → 클라이언트 위조 불가(0008과 동일 원칙).
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text;
begin
  r := coalesce(new.raw_app_meta_data->>'role', 'teacher');
  if r not in ('nurse','teacher','parent','edu') then r := 'teacher'; end if;
  insert into public.profiles (id, role, name, org, grade, class_no, child_id, child_name)
  values (
    new.id,
    r,
    coalesce(new.raw_user_meta_data->>'name',''),
    coalesce(new.raw_app_meta_data->>'org', new.raw_user_meta_data->>'org',''),
    nullif(new.raw_app_meta_data->>'grade','')::int,
    nullif(new.raw_app_meta_data->>'classNo','')::int,
    nullif(new.raw_app_meta_data->>'childId',''),
    nullif(new.raw_app_meta_data->>'childName','')
  )
  on conflict (id) do nothing;
  return new;
end; $$;
