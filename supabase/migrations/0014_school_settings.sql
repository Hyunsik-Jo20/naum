-- 학교별 공유 설정(증상 타일 목록) — 증상 편집이 편집한 기기에만 반영되던 문제 해결.
--  · 보건교사가 콘솔에서 편집·저장하면 이 테이블에 올라가고, 키오스크 등 다른 기기가
--    부팅/대기화면 복귀 시 읽어 localStorage와 다르면 갱신 후 새로고침한다.
--  · 내용은 비식별(증상 라벨·계통) — 키오스크는 비로그인이므로 SELECT는 공개.
--    쓰기는 자기 학교 보건교사만(0012 헬퍼 my_role/my_school_id 재사용).
create table if not exists public.school_settings (
  school_id  text primary key,
  symptoms   jsonb,
  updated_at timestamptz not null default now()
);

alter table public.school_settings enable row level security;

drop policy if exists school_settings_read on public.school_settings;
create policy school_settings_read on public.school_settings
  for select using (true);

drop policy if exists school_settings_insert_nurse on public.school_settings;
create policy school_settings_insert_nurse on public.school_settings
  for insert to authenticated
  with check (public.my_role() = 'nurse' and school_id = public.my_school_id());

drop policy if exists school_settings_update_nurse on public.school_settings;
create policy school_settings_update_nurse on public.school_settings
  for update to authenticated
  using (public.my_role() = 'nurse' and school_id = public.my_school_id())
  with check (public.my_role() = 'nurse' and school_id = public.my_school_id());
