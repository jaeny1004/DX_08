-- 수종전환 추천의 입지 근거: 격자 중심의 기후대·산림토양형·토심·향을 저장한다.
-- 원본 terrain_pine_site_features_south_500m.csv(산림입지토양도 유래)의 중심 격자
-- *_mode 값을 한글로 해석해 jsonb로 저장한다. 고도/경사는 006 마이그레이션의
-- block_elevation_mean/block_slope_mean을 그대로 쓴다(중복 저장하지 않음).
-- 기존 행을 깨뜨리지 않도록 nullable로 추가한다.

alter table prediction_grid_static
  add column if not exists site_conditions jsonb;

comment on column prediction_grid_static.site_conditions is
  '수종전환 추천용 격자 중심 입지조건(산림입지토양도 유래). 객체 형태: '
  '{"climate_zone": text, "climate_zone_code": int(1~4), '
  '"forest_soil_type": text(산림토양형 기호 예 B2), '
  '"soil_depth_class": text(얕음/보통/깊음), "soil_depth_code": int, '
  '"aspect_deg": number}. '
  'terrain_pine_site_features_south_500m.csv의 climate_zone_mode/site_label_mode/'
  'soil_depth_mode/aspect_mean에서 backfill하며 UNKNOWN은 해당 키를 null로 둔다.';
