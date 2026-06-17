-- 나음 — 토큰 로그인(교사·학부모는 Supabase 계정 없이 로컬 토큰 세션)을 위해
-- relay 인박스 "조회"를 anon 에도 허용. (내용은 학교 키로 암호화된 암호문이라 평문/이름 노출 없음)
-- Supabase SQL Editor 에 붙여넣고 Run. (멱등)

drop policy if exists relay_class_select on public.relay_class_inbox;
create policy relay_class_select on public.relay_class_inbox
  for select to anon, authenticated using (true);

drop policy if exists relay_student_select on public.relay_student_inbox;
create policy relay_student_select on public.relay_student_inbox
  for select to anon, authenticated using (true);
