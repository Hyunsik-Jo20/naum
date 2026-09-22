-- 활력징후(체온·혈압·맥박·호흡수·산소포화도) 기록 — 요청 2026-09-22.
--  · 지금까지 체온만 처치 문자열("체온 측정 37.5℃")로 남아, 값을 다시 꺼내 쓸 수 없었다.
--    구조화해 저장하면 정상범위 경고·인계서 표기·재측정 비교가 가능해진다.
--  · 비식별 원칙 유지: visits에는 이름이 없고, 활력징후도 증상·병명과 같은 성격의 비식별 값이다.
--  · 형식: { "temp": [37.5], "bp": [120, 80], "pulse": [88], "resp": [20], "spo2": [98] }
--    (항목 id → 값 배열. 단일 항목은 [값], 혈압처럼 두 값이면 [수축기, 이완기])
alter table public.visits
  add column if not exists vitals jsonb;

-- 학교별 활력징후 항목·정상범위 설정 — 증상 목록(0014)과 같은 방식으로 기기 간 공유.
alter table public.school_settings
  add column if not exists vitals jsonb;
