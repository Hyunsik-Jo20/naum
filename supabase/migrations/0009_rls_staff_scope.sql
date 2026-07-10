-- 0009 — RLS 강화: 직원(보건교사·교육청) 데이터의 조회/수정/삭제/쓰기를 staff 역할로 제한.
-- 배경(보안 점검 2026-07-10): 0001/0002/0007 정책이 `using(true)`라, 로그인만 하면 아무 계정이나
--   전 학교 visits/visit_links를 조회·수정·삭제하고 app_state(공유 학교설정)를 덮어쓸 수 있었다.
--   0008 이후 자칭 가입 계정은 'teacher'가 되지만, teacher 계정도 여전히 접근됐다.
-- 변경: 위 작업을 profiles.role in ('nurse','edu') 인 계정으로만 허용.
--
-- ★ 유지(그대로 둠 — 제거하면 기능 깨짐):
--   · visits/visit_links/relay_* 의 anon INSERT → 키오스크(비로그인) 접수·알림 발신에 필요.
--   · relay_* 의 anon SELECT(0004) → 교사·학부모는 Supabase에 anon(토큰 세션)이라 알림 수신에 필요.
--     (relay 내용은 E2E 암호문이라 anon이 읽어도 복호화 불가.)
--   · app_state anon SELECT → 학교설정(비PII) 읽기.
-- ※ 적용 전 스테이징에서 먼저 테스트 권장(보건교사 로그인→콘솔 방문 조회, 키오스크 접수, 교사·학부모 수신).
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

-- 호출자가 직원(보건교사·교육청)인지 — security definer로 profiles를 RLS 무관하게 확인(재귀/권한 이슈 회피).
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('nurse','edu'));
$$;

-- ── visits: 조회/수정/삭제를 staff로 제한(INSERT anon은 유지) ──
drop policy if exists visits_select_auth on public.visits;
create policy visits_select_staff on public.visits
  for select to authenticated using (public.is_staff());
drop policy if exists visits_update_auth on public.visits;
create policy visits_update_staff on public.visits
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists visits_delete_auth on public.visits;
create policy visits_delete_staff on public.visits
  for delete to authenticated using (public.is_staff());

-- ── visit_links: 조회/삭제를 staff로 제한(INSERT anon은 유지) ──
drop policy if exists visit_links_select_auth on public.visit_links;
create policy visit_links_select_staff on public.visit_links
  for select to authenticated using (public.is_staff());
drop policy if exists visit_links_delete_auth on public.visit_links;
create policy visit_links_delete_staff on public.visit_links
  for delete to authenticated using (public.is_staff());

-- ── app_state: 쓰기(INSERT/UPDATE/DELETE)를 staff로 제한(SELECT anon은 유지) ──
drop policy if exists app_state_write on public.app_state;
create policy app_state_write_staff on public.app_state
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 남은 후속(별도): visits/app_state를 school_id로 스코프(다학교 테넌시), relay anon insert 크기/횟수 제한.
