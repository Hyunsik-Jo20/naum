-- 나음 — 다기기 이름복원(암호화 링크) + relay 테이블/정책 보장(멱등).
-- Supabase SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)

-- ── visit_links — visit_id ↔ "암호화된 student_id". 평문 student_id 없음(학교 키로만 복호화). ──
create table if not exists public.visit_links (
  visit_id  text primary key,
  school_id text not null default 'demo',
  enc       jsonb not null,   -- {iv, ct} : 학교 키로 암호화된 studentId. 서버는 못 읽음.
  created_at bigint not null default 0
);
alter table public.visit_links enable row level security;

-- 키오스크(anon)가 접수 시 링크도 같이 생성 → insert anon+authenticated. 조회는 staff만.
drop policy if exists visit_links_insert_any on public.visit_links;
create policy visit_links_insert_any on public.visit_links
  for insert to anon, authenticated with check (true);
drop policy if exists visit_links_select_auth on public.visit_links;
create policy visit_links_select_auth on public.visit_links
  for select to authenticated using (true);

-- Realtime — 링크 생성도 구독(다른 기기 콘솔이 이름 복원).
do $$ begin
  alter publication supabase_realtime add table public.visit_links;
exception when duplicate_object then null; end $$;

-- ── relay_* 테이블/정책 보장(0001이 부분 적용됐을 수 있어 idempotent 재생성) ──
create table if not exists public.relay_class_inbox (
  id bigserial primary key, class_token text not null, student_token text not null,
  enc jsonb not null, ts bigint not null
);
create table if not exists public.relay_student_inbox (
  id bigserial primary key, student_token text not null,
  enc jsonb not null, ts bigint not null
);
alter table public.relay_class_inbox enable row level security;
alter table public.relay_student_inbox enable row level security;

-- 발신은 키오스크(anon)·스테이션(authenticated) 모두 insert. 수신(select)은 로그인 사용자만.
-- (토큰+암호문이라 평문/이름 노출 없음. 수신자만 학교 키로 복호화)
drop policy if exists relay_class_all on public.relay_class_inbox;
drop policy if exists relay_class_insert on public.relay_class_inbox;
drop policy if exists relay_class_select on public.relay_class_inbox;
create policy relay_class_insert on public.relay_class_inbox
  for insert to anon, authenticated with check (true);
create policy relay_class_select on public.relay_class_inbox
  for select to authenticated using (true);

drop policy if exists relay_student_all on public.relay_student_inbox;
drop policy if exists relay_student_insert on public.relay_student_inbox;
drop policy if exists relay_student_select on public.relay_student_inbox;
create policy relay_student_insert on public.relay_student_inbox
  for insert to anon, authenticated with check (true);
create policy relay_student_select on public.relay_student_inbox
  for select to authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table public.relay_class_inbox;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.relay_student_inbox;
exception when duplicate_object then null; end $$;
