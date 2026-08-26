-- 0012 — 공용 멀티테넌트: RLS를 school_id로 스코프(2학기 다학교 실사용).
-- 배경: 0009는 "직원(nurse/edu)만" 제한이었지 학교 구분이 없어, A학교 보건교사가
--   B학교 visits를 읽고 수정/삭제까지 가능했다(0009 말미 후속 항목). 다학교 공용 배포를 위해
--   nurse는 자기 학교(profiles.school_id)로 스코프하고, edu(교육청)는 전 학교 비식별 조회를 유지한다.
-- 함께 배포되는 것: api/token.js(토큰에 학교 스탬프)·api/keys.js(학교별 키 파생)·가입 트리거 확장.
--   이 마이그레이션 자체는 비파괴 — 기존 계정은 전부 school_id='demo'라 기존 동작 유지,
--   코드 배포 전에 먼저 적용해도 안전하다.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

-- ── (1) 스키마 보강: relay_nurse_inbox 학교 컬럼 + 조회 인덱스 ──
alter table public.relay_nurse_inbox
  add column if not exists school_id text not null default 'demo';
create index if not exists relay_nurse_inbox_school_ts_idx
  on public.relay_nurse_inbox (school_id, ts desc);
-- edu 90일 창 집계 + nurse 자교 조회용
create index if not exists visits_school_created_idx
  on public.visits (school_id, created_at);

-- ── (2) 헬퍼 — 호출자의 역할/학교(0009 is_staff와 동일하게 security definer로 RLS 무관 조회) ──
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.my_school_id()
returns text language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid()
$$;

-- ── (3) visits: edu=전 학교 조회(비식별) / nurse=자기 학교만 조회·수정·삭제 / 키오스크 anon INSERT 유지 ──
drop policy if exists visits_select_staff on public.visits;
create policy visits_select_scoped on public.visits
  for select to authenticated
  using (public.my_role() = 'edu'
     or (public.my_role() = 'nurse' and school_id = public.my_school_id()));
drop policy if exists visits_update_staff on public.visits;
create policy visits_update_scoped on public.visits
  for update to authenticated
  using (public.my_role() = 'nurse' and school_id = public.my_school_id())
  with check (public.my_role() = 'nurse' and school_id = public.my_school_id());
drop policy if exists visits_delete_staff on public.visits;
create policy visits_delete_scoped on public.visits
  for delete to authenticated
  using (public.my_role() = 'nurse' and school_id = public.my_school_id());

-- ── (4) visit_links(암호화 재식별 링크): nurse 자기 학교만. edu는 제외(복호 불필요 — 최소권한) ──
drop policy if exists visit_links_select_staff on public.visit_links;
create policy visit_links_select_scoped on public.visit_links
  for select to authenticated
  using (public.my_role() = 'nurse' and school_id = public.my_school_id());
drop policy if exists visit_links_delete_staff on public.visit_links;
create policy visit_links_delete_scoped on public.visit_links
  for delete to authenticated
  using (public.my_role() = 'nurse' and school_id = public.my_school_id());

-- ── (5) app_state: 쓰기 edu 전용(schools.overlay = 교육청 학교 명부 오버레이. SELECT anon은 0005 유지) ──
drop policy if exists app_state_write_staff on public.app_state;
create policy app_state_write_edu on public.app_state
  for all to authenticated
  using (public.my_role() = 'edu') with check (public.my_role() = 'edu');

-- ── (6) relay_nurse_inbox: 0010의 개방 SELECT/DELETE → nurse 자기 학교만. INSERT anon 유지(교사 발신) ──
drop policy if exists relay_nurse_select on public.relay_nurse_inbox;
create policy relay_nurse_select_scoped on public.relay_nurse_inbox
  for select to authenticated
  using (public.my_role() = 'nurse' and school_id = public.my_school_id());
drop policy if exists relay_nurse_delete on public.relay_nurse_inbox;
create policy relay_nurse_delete_scoped on public.relay_nurse_inbox
  for delete to authenticated
  using (public.my_role() = 'nurse' and school_id = public.my_school_id());

-- ── (7) 가입 트리거: app_metadata.schoolId도 profiles.school_id에 기록(0011 확장) ──
--   schoolId는 api/token.js(service-role)만 설정 — 클라이언트 위조 불가(0008 원칙 동일).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text;
begin
  r := coalesce(new.raw_app_meta_data->>'role', 'teacher');
  if r not in ('nurse','teacher','parent','edu') then r := 'teacher'; end if;
  insert into public.profiles (id, role, name, org, school_id, grade, class_no, child_id, child_name)
  values (
    new.id,
    r,
    coalesce(new.raw_user_meta_data->>'name',''),
    coalesce(new.raw_app_meta_data->>'org', new.raw_user_meta_data->>'org',''),
    coalesce(nullif(new.raw_app_meta_data->>'schoolId',''), 'demo'),
    nullif(new.raw_app_meta_data->>'grade','')::int,
    nullif(new.raw_app_meta_data->>'classNo','')::int,
    nullif(new.raw_app_meta_data->>'childId',''),
    nullif(new.raw_app_meta_data->>'childName','')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- ── (8) 백필: 기존 계정은 전부 데모 학교 귀속(비어 있으면) ──
update public.profiles set school_id = 'demo'
 where school_id is null or school_id = '';

-- ── 검증 프로브(참고) ──
-- edu 계정:    select count(*) from visits;                      → 전체 행
-- nurse(demo): select count(*) from visits;                      → school_id='demo' 행만
-- nurse(demo): update visits set ticket=ticket where school_id<>'demo';  → 0 rows
-- teacher:     select count(*) from visits;                      → 0 행
-- 남은 후속(P1, 문서화): anon INSERT의 school_id 스푸핑(rate-limit/Turnstile 후속), relay anon insert 크기 제한.
