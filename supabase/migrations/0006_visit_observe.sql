-- 나음 — 관찰 결과: 보건실 관찰 종료 예정 시각 컬럼 추가(비식별: 시각만).
-- Supabase SQL Editor 에 붙여넣고 Run. (멱등)
alter table public.visits add column if not exists observe_until bigint;
