-- 0010 — 교사 → 보건교사 방향 relay 채널(보건실 요청·전학 안내).
-- 기존 relay는 보건교사→교사/학부모 방향뿐이었다. 교사가 학생을 보건실로 보내거나 전학생을 알릴 때
-- 사용할 역방향 채널을 추가한다. 내용은 반 키로 암호화(토큰+암호문만) — 서버는 누구·내용 모름.
--   · class_token: 발신 반 라우팅 토큰(결정적 해시). 보건교사가 자기 학교 반 토큰들과 대조해 반 식별.
--   · enc: 반 키로 암호화된 { kind, grade, classNo, number, symIds?, name?, sex? }.
-- RLS: 교사(anon)가 insert, 보건교사(authenticated)가 select. 암호문이라 평문 노출 없음.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

create table if not exists public.relay_nurse_inbox (
  id          bigserial primary key,
  class_token text not null,
  enc         jsonb not null,
  ts          bigint not null,
  created_at  timestamptz not null default now()
);
alter table public.relay_nurse_inbox enable row level security;

create policy relay_nurse_insert on public.relay_nurse_inbox
  for insert to anon, authenticated with check (true);
create policy relay_nurse_select on public.relay_nurse_inbox
  for select to authenticated using (true);
-- 보건교사가 처리(접수/추가) 후 삭제할 수 있게.
create policy relay_nurse_delete on public.relay_nurse_inbox
  for delete to authenticated using (true);

alter publication supabase_realtime add table public.relay_nurse_inbox;
