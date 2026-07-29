-- 수종전환 추천 기능용: 격자별 임상도 수종구성을 저장한다.
-- 원본 임상도(TB_FGDI_FS_IM5000)를 500m 격자에 면적조인한 결과
-- (data/terrain_species_composition_south_500m.csv)에서 backfill한다.
-- 기존 prediction_grid_static 행을 깨뜨리지 않도록 nullable로 추가한다.
-- 산림이 없는 격자(임상도 산림 폴리곤 미교차)는 NULL로 남긴다.

alter table prediction_grid_static
  add column if not exists species_composition jsonb;

comment on column prediction_grid_static.species_composition is
  '격자 임상도 수종구성(수종전환 추천용). 객체 형태: '
  '{"composition": {수종명: 비율, ...}, "forest_ratio": 0~1, '
  '"dominant_species": text, "n_species": int}. '
  'composition은 산림 수종끼리 정규화되어 비율 합이 1이다(비산림 코드 제외). '
  'forest_ratio는 산림면적/250,000㎡. '
  'data/terrain_species_composition_south_500m.csv에서 backfill하며 '
  '임상도 산림 폴리곤과 교차하지 않는 격자는 NULL이다.';
