-- 나음 — 공유 앱 상태(교육청 학교 설정 오버레이 등)를 모든 기기에 영구 저장.
--  key/value(jsonb). 학교 명부 변경(증설·폐교·수정·임시학교)을 여기에 저장 → 어느 기기에서나 동일.
-- Supabase SQL Editor 에 붙여넣고 Run. (멱등)

create table if not exists public.app_state (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;

-- 조회는 anon+authenticated(지도/집계 표시), 쓰기는 authenticated(교육청 등 로그인 사용자).
drop policy if exists app_state_select on public.app_state;
create policy app_state_select on public.app_state
  for select to anon, authenticated using (true);
drop policy if exists app_state_write on public.app_state;
create policy app_state_write on public.app_state
  for all to authenticated using (true) with check (true);
