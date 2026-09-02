-- 교직원 방문 구분 — 콘솔 수동 접수로 교직원도 접수 가능. 학생 통계(교장 보고·교육청
--  집계·보건일지)에서는 제외하고 별도 집계한다. 기존 행은 null(=학생)로 남아 비파괴.
alter table public.visits
  add column if not exists is_staff boolean;
