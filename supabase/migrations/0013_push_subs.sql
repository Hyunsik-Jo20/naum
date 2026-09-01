-- 접수 도착 폰 푸시(Web Push) 구독 저장소.
--  · endpoint = 브라우저 푸시 서비스가 발급한 고유 URL(기기·브라우저별 1개).
--  · RLS 활성 + 정책 없음 → 클라이언트(anon/authenticated) 직접 접근 전면 차단.
--    읽기/쓰기는 서버 함수(/api/push, service role)만 수행한다.
create table if not exists push_subs (
  endpoint   text primary key,
  school_id  text not null,
  sub        jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subs_school_idx on push_subs (school_id);

alter table push_subs enable row level security;
