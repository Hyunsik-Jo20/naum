-- 나음 — RLS 정책 보정(멱등). 0001 일부가 적용 안 됐을 때 이 블록만 다시 실행하면 정상화된다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

-- RLS 활성화(이미 켜져 있으면 무해)
alter table public.visits enable row level security;
alter table public.relay_reg enable row level security;
alter table public.relay_class_inbox enable row level security;
alter table public.relay_student_inbox enable row level security;

-- visits: 키오스크(anon) 접수 insert 허용 + staff 조회/수정
drop policy if exists visits_insert_any on public.visits;
create policy visits_insert_any on public.visits
  for insert to anon, authenticated with check (true);

drop policy if exists visits_select_auth on public.visits;
create policy visits_select_auth on public.visits
  for select to authenticated using (true);

drop policy if exists visits_update_auth on public.visits;
create policy visits_update_auth on public.visits
  for update to authenticated using (true) with check (true);

-- relay_*: 토큰+암호문만이라 authenticated 전체 허용
drop policy if exists relay_reg_all on public.relay_reg;
create policy relay_reg_all on public.relay_reg
  for all to authenticated using (true) with check (true);

drop policy if exists relay_class_all on public.relay_class_inbox;
create policy relay_class_all on public.relay_class_inbox
  for all to authenticated using (true) with check (true);

drop policy if exists relay_student_all on public.relay_student_inbox;
create policy relay_student_all on public.relay_student_inbox
  for all to authenticated using (true) with check (true);

-- 확인용: 현재 visits 정책 목록
select policyname, cmd, roles from pg_policies where schemaname='public' and tablename='visits';
