-- control 보고서가 원래 쓰던 "중심 격자 단일 소나무 면적/비율" 값을 저장한다.
-- prediction_grid_static.block_pine_mean(3x3 평균, 006 마이그레이션)과는
-- 다른 값이다 — 표본 20개 비교 결과 평균 8.5pp, 최대 27.5pp 차이가 나서
-- block_pine_mean으로 대체할 수 없다고 판단해 별도 컬럼으로 추가한다.
-- 기존 행을 깨뜨리지 않도록 모두 nullable로 추가한다.

alter table prediction_grid_static
  add column if not exists center_pine_area_ha double precision,
  add column if not exists center_pine_ratio double precision;

comment on column prediction_grid_static.center_pine_area_ha is
  '중심 격자(3x3 평균이 아닌 단일 격자) 소나무 면적(ha). '
  'terrain_pine_site_features_south_500m.csv의 pine_area(㎡)를 10,000으로 나눈 값';
comment on column prediction_grid_static.center_pine_ratio is
  '중심 격자 단일 소나무 비율. block_pine_mean과 동일하게 0~1 스케일로 저장 '
  '(백분율 변환은 표시 시점의 _percent()가 처리 — 여기서 미리 곱하지 않음). '
  'terrain_pine_site_features_south_500m.csv의 pine_ratio 컬럼값 그대로';
