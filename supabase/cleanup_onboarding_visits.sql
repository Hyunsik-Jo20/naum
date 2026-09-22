-- 온보딩·시험 접수 정리 — 2026-09-22 작성.
--
-- ⚠ 배경(중요): 이전 핸드오프에는 명진초(b259)·동원초(b83)가 "시뮬레이션"으로 적혀 있었고
--    `delete from visits where school_id in ('b259','b83')` 라는 학교 통째 삭제 SQL이 남아 있었다.
--    사용자 확인 결과 **주감초(b153)·명진초(b259)·동원초(b83)는 모두 실제 운영 중인 학교**다.
--    그 SQL은 실운영 기록을 지우므로 **절대 실행하면 안 된다.** 이 파일이 대체본이다.
--
-- 방식: 학교 단위가 아니라 **온보딩 때 만든 개별 방문만** 골라서 지운다.
--       ①로 현황을 보고 → ②로 후보를 확인하고 → ③에 지울 id만 적어 실행한다.
--       지우기 전 ④의 백업 조회 결과를 따로 저장해 두면 되돌릴 근거가 남는다.
--
-- 실행 위치: Supabase 대시보드 → SQL Editor (service_role 권한으로 동작).
-- 되돌리기: DELETE는 되돌릴 수 없다. ①②를 먼저 보고 id를 확정한 뒤에만 ③을 실행할 것.


-- ──────────────────────────────────────────────────────────────
-- ① 학교별 현황 — 뭐가 얼마나 들어 있는지부터 본다
-- ──────────────────────────────────────────────────────────────
select
  school_id,
  count(*)                                                      as 방문수,
  count(*) filter (where status = 'waiting')                    as 대기,
  count(*) filter (where status = 'treating')                   as 처치중,
  count(*) filter (where status = 'done')                       as 완료,
  count(*) filter (where is_staff)                              as 교직원,
  to_char(to_timestamp(min(created_at) / 1000) at time zone 'Asia/Seoul', 'YYYY-MM-DD') as 첫기록,
  to_char(to_timestamp(max(created_at) / 1000) at time zone 'Asia/Seoul', 'YYYY-MM-DD') as 마지막기록,
  count(distinct to_char(to_timestamp(created_at / 1000) at time zone 'Asia/Seoul', 'YYYY-MM-DD')) as 기록된_날수
from public.visits
group by school_id
order by 방문수 desc;


-- ──────────────────────────────────────────────────────────────
-- ② 삭제 후보 — 온보딩 기간(2026-08-26 ~ 08-31)에 만들어진 방문 전부
--    실제로 그날 학생을 본 기록이 섞여 있을 수 있으니 **눈으로 확인**하고 고른다.
--    epoch ms 기준: 2026-08-26 00:00 KST = 1787670000000
--                   2026-09-01 00:00 KST = 1788188400000
-- ──────────────────────────────────────────────────────────────
select
  id,
  school_id,
  to_char(to_timestamp(created_at / 1000) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as 접수시각,
  grade, sex, status, outcome,
  symptom_tile_ids,
  treatments,
  -- 처치란에 이메일·전화번호가 섞인 행(PII 가드 도입 전 입력분) 표시
  (array_to_string(treatments, ' ') ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Za-z]{2,}'
   or array_to_string(treatments, ' ') ~ '01[016-9][-  ]?[0-9]{3,4}[-  ]?[0-9]{4}') as PII_혼입
from public.visits
where created_at >= 1787670000000
  and created_at <  1788188400000
order by school_id, created_at;


-- ②-1 덤으로 걸러 보기 — 며칠째 'treating'에 멈춰 있는 방문(중복 접수 흔적)
select id, school_id,
       to_char(to_timestamp(created_at / 1000) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as 접수시각,
       grade, sex, status, treatments
from public.visits
where status <> 'done'
  and created_at < (extract(epoch from now()) * 1000) - 7 * 86400000
order by created_at;


-- ②-2 처치란에 개인정보가 남은 행 (기간 무관 — 전수)
select id, school_id,
       to_char(to_timestamp(created_at / 1000) at time zone 'Asia/Seoul', 'YYYY-MM-DD') as 날짜,
       treatments
from public.visits
where array_to_string(treatments, ' ') ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Za-z]{2,}'
   or array_to_string(treatments, ' ') ~ '01[016-9][-  ]?[0-9]{3,4}[-  ]?[0-9]{4}'
order by created_at;


-- ──────────────────────────────────────────────────────────────
-- ③ 삭제 — ②에서 고른 id만 아래 목록에 적는다. **빈 목록이면 아무것도 지워지지 않는다.**
--    visit_links(재식별 링크)를 먼저 지우고 visits를 지운다.
-- ──────────────────────────────────────────────────────────────
-- 지울 방문 id를 여기에 (따옴표·쉼표 그대로, 예: 'v-b259-abc-123', 'v-b83-def-456')
-- begin;
--
-- with victims(id) as (values
--   -- ('v-b259-...'),
--   -- ('v-b83-...')
--   (null::text)   -- ← 실제 id를 넣고 이 줄은 지운다
-- )
-- delete from public.visit_links l using victims v where l.visit_id = v.id;
--
-- with victims(id) as (values
--   -- ('v-b259-...'),
--   -- ('v-b83-...')
--   (null::text)
-- )
-- delete from public.visits t using victims v where t.id = v.id;
--
-- -- 결과를 확인하고 문제 없으면 commit; 이상하면 rollback;
-- commit;


-- ──────────────────────────────────────────────────────────────
-- ④ 지우기 전 백업 — 결과를 CSV로 내려받아 보관해 두면 되돌릴 근거가 된다
--    (Supabase SQL Editor 결과창 우측 "Download CSV")
-- ──────────────────────────────────────────────────────────────
-- select * from public.visits
-- where id in ('v-b259-...', 'v-b83-...');


-- ──────────────────────────────────────────────────────────────
-- ⑤ 테스트초등학교(demo) 정리 — 시연·연수용 데이터라 언제든 지워도 된다.
--    "테스트 학교 데이터만 남긴다"가 목적이면 이건 **실행하지 않는다.**
-- ──────────────────────────────────────────────────────────────
-- delete from public.visit_links where school_id = 'demo';
-- delete from public.visits      where school_id = 'demo';
