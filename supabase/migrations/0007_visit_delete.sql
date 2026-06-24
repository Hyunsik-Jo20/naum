-- 나음 — 방문 삭제(학생이 교실로 가버린 경우 등) 허용. 로그인 사용자(보건교사)만.
-- Supabase SQL Editor 에 붙여넣고 Run. (멱등)

drop policy if exists visits_delete_auth on public.visits;
create policy visits_delete_auth on public.visits
  for delete to authenticated using (true);

drop policy if exists visit_links_delete_auth on public.visit_links;
create policy visit_links_delete_auth on public.visit_links
  for delete to authenticated using (true);
