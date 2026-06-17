-- 나음(NaUM) — Supabase 초기 스키마
-- 원칙: 클라우드(이 DB)에는 "비식별" 데이터만. 이름·반·번호·보호자연락처·visit↔student 링크는
--       절대 저장하지 않는다(보건교사 브라우저 로컬 = "로컬 스테이션"에만 보관).
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (또는 supabase db push)

-- ──────────────────────────────────────────────────────────────
-- 1) profiles — 로그인 사용자 ↔ 역할/소속 (auth.users 1:1)
--    비밀번호(email+password) 로그인. 향후 휴대폰 OTP로 전환 시에도 이 테이블 재사용.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  role      text not null check (role in ('nurse','teacher','parent','edu')),
  name      text not null default '',
  org       text not null default '',
  school_id text not null default 'demo',
  grade     int,           -- 교사: 담당 학년
  class_no  int,           -- 교사: 담당 반
  child_id  text,          -- 학부모: 자녀 학생 id (PII성 — 필요 시 클라이언트 로컬 매핑 권장)
  child_name text,         -- 학부모: 자녀 이름 (선택)
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 본인 프로필만 조회/수정. 생성은 트리거(아래) 또는 service_role(관리자)로.
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- 신규 가입 시 빈 프로필 자동 생성(역할은 관리자가 대시보드에서 지정).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name, org)
  values (new.id, coalesce(new.raw_user_meta_data->>'role','nurse'),
          coalesce(new.raw_user_meta_data->>'name',''),
          coalesce(new.raw_user_meta_data->>'org',''))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────────────────────
-- 2) visits — 비식별 방문 (서버 방문 레코드)
--    PII 컬럼(name/class_no/number/student_id/guardian_phone) 자체가 존재하지 않는다.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.visits (
  id               text primary key,         -- 클라이언트 생성 난수 id
  school_id        text not null default 'demo',
  grade            int  not null,
  sex              text not null check (sex in ('남','여')),
  symptom_tile_ids text[] not null default '{}',
  status           text not null default 'waiting' check (status in ('waiting','treating','done')),
  ticket           int  not null default 0,
  diseases         jsonb not null default '[]',
  treatments       text[] not null default '{}',
  outcome          text,
  escort           text[],
  transport        text,
  guardian_handoff boolean,
  created_at       bigint not null,           -- epoch ms (클라이언트 시각 그대로)
  called_at        bigint,
  treated_at       bigint
);
alter table public.visits enable row level security;

-- 키오스크는 로그인 없이(anon) 접수해야 하므로 insert 는 anon+authenticated 허용.
-- 데이터가 비식별이라 staff 간 조회 공유는 허용(프로토타입). 운영 시 school_id/region로 강화 권장.
create policy visits_insert_any on public.visits
  for insert to anon, authenticated with check (true);
create policy visits_select_auth on public.visits
  for select to authenticated using (true);
create policy visits_update_auth on public.visits
  for update to authenticated using (true) with check (true);

-- Realtime(실시간 동기화) — 방문 변경을 구독.
alter publication supabase_realtime add table public.visits;

-- ──────────────────────────────────────────────────────────────
-- 3) relay_* — 익명 중계(토큰 + E2E 암호문만). 내용 평문/이름 없음.
--    (이번 단계 클라이언트는 visits 중심. relay 연동은 후속 — 테이블은 미리 준비.)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.relay_reg (
  token     text primary key,   -- 불투명 라우팅 토큰(누구인지 모름)
  channel   text not null,
  school_id text not null default 'demo',
  ts        bigint not null
);
create table if not exists public.relay_class_inbox (
  id            bigserial primary key,
  class_token   text not null,
  student_token text not null,
  enc           jsonb not null,  -- 반 키로 암호화된 {kind,sym,outcome}
  ts            bigint not null
);
create table if not exists public.relay_student_inbox (
  id            bigserial primary key,
  student_token text not null,
  enc           jsonb not null,  -- 학생 키로 암호화된 페이로드
  ts            bigint not null
);
alter table public.relay_reg enable row level security;
alter table public.relay_class_inbox enable row level security;
alter table public.relay_student_inbox enable row level security;

-- 토큰+암호문이라 평문 노출이 없으므로 authenticated 읽기/쓰기 허용(수신자만 복호화 가능).
create policy relay_reg_all on public.relay_reg
  for all to authenticated using (true) with check (true);
create policy relay_class_all on public.relay_class_inbox
  for all to authenticated using (true) with check (true);
create policy relay_student_all on public.relay_student_inbox
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.relay_class_inbox;
alter publication supabase_realtime add table public.relay_student_inbox;
