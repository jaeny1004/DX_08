-- 보고서 생성 시 필요한 3x3 격자별 geometry와 지형 요약값을 저장한다.
-- 기존 prediction_grid_static 행을 깨뜨리지 않도록 모든 컬럼은 nullable로 추가한다.

alter table prediction_grid_static
  add column if not exists block_cell_geometries_4326 jsonb,
  add column if not exists block_pine_mean double precision,
  add column if not exists block_elevation_mean double precision,
  add column if not exists block_slope_mean double precision;

comment on column prediction_grid_static.block_cell_geometries_4326 is
  'block_grid_ids 순서와 동일한 개별 500m 격자 EPSG:4326 GeoJSON geometry 배열';
comment on column prediction_grid_static.block_pine_mean is
  'block_grid_ids에 포함된 격자의 pine_ratio 산술평균';
comment on column prediction_grid_static.block_elevation_mean is
  'block_grid_ids에 포함된 격자의 elev_mean 산술평균(m)';
comment on column prediction_grid_static.block_slope_mean is
  'block_grid_ids에 포함된 격자의 slope_mean 산술평균';
