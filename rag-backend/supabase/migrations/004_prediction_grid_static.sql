-- 신규 확산위험 후보 격자의 보고서 생성용 공간 전처리 결과를 저장한다.
-- geometry 값은 PostGIS 타입을 사용하지 않고 GeoJSON 객체를 JSONB로 저장한다.
-- 이 마이그레이션은 테이블과 RLS만 구성하며 원본 데이터 적재는 별도 작업으로 수행한다.

create table if not exists prediction_grid_static (
  grid_id bigint primary key,
  risk_candidate_flag boolean not null default true
    check (risk_candidate_flag = true),

  center_point_5186 jsonb not null
    check (jsonb_typeof(center_point_5186) = 'object'),
  center_point_4326 jsonb not null
    check (jsonb_typeof(center_point_4326) = 'object'),
  cell_geometry_5186 jsonb not null
    check (jsonb_typeof(cell_geometry_5186) = 'object'),
  cell_geometry_4326 jsonb not null
    check (jsonb_typeof(cell_geometry_4326) = 'object'),
  block_geometry_5186 jsonb not null
    check (jsonb_typeof(block_geometry_5186) = 'object'),
  block_geometry_4326 jsonb not null
    check (jsonb_typeof(block_geometry_4326) = 'object'),

  block_grid_ids bigint[] not null
    check (cardinality(block_grid_ids) between 4 and 9),

  sido_code text,
  sido_name text not null,
  sigungu_code text,
  sigungu_name text not null,
  admin_base_date date,
  admin_match_method text,

  grid_source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table prediction_grid_static is
  'risk_candidate_flag=true인 신규 확산위험 후보 격자만 저장하는 보고서 생성용 정적 전처리 테이블';
comment on column prediction_grid_static.risk_candidate_flag is
  '신규 확산위험 후보 여부. 이 테이블은 true인 격자만 허용한다.';
comment on column prediction_grid_static.center_point_5186 is
  'EPSG:5186 중심점 GeoJSON 객체';
comment on column prediction_grid_static.center_point_4326 is
  'EPSG:4326 중심점 GeoJSON 객체';
comment on column prediction_grid_static.cell_geometry_5186 is
  'EPSG:5186 단일 격자 GeoJSON 객체';
comment on column prediction_grid_static.cell_geometry_4326 is
  'EPSG:4326 단일 격자 GeoJSON 객체';
comment on column prediction_grid_static.block_geometry_5186 is
  'EPSG:5186 중심 격자 포함 3x3 권역 외곽선 GeoJSON 객체';
comment on column prediction_grid_static.block_geometry_4326 is
  'EPSG:4326 중심 격자 포함 3x3 권역 외곽선 GeoJSON 객체';
comment on column prediction_grid_static.block_grid_ids is
  '중심 격자를 포함한 3x3 권역의 격자 ID 배열';
comment on column prediction_grid_static.grid_source_version is
  '좌표와 3x3 권역을 산출할 때 사용한 격자 원본 버전';

create index if not exists prediction_grid_static_admin_idx
  on prediction_grid_static (sido_code, sigungu_code);

create table if not exists grid_nearby_infection (
  center_grid_id bigint not null
    references prediction_grid_static (grid_id)
    on delete cascade,
  infection_grid_id bigint not null,
  infection_data_version text not null,
  distance_m double precision
    check (distance_m is null or distance_m >= 0),
  created_at timestamptz not null default now(),

  primary key (
    center_grid_id,
    infection_grid_id,
    infection_data_version
  )
);

comment on table grid_nearby_infection is
  '신규 확산위험 후보 중심 격자별 14km 검색영역과 교차하는 감염 발생 이력 격자 관계';
comment on column grid_nearby_infection.center_grid_id is
  'prediction_grid_static에 등록된 risk_candidate_flag=true 중심 격자 ID';
comment on column grid_nearby_infection.infection_grid_id is
  '14km 검색영역과 교차하는 감염 발생 이력 격자 ID';
comment on column grid_nearby_infection.infection_data_version is
  '공간 교차 관계 산출에 사용한 감염 발생 이력 데이터 버전';

create index if not exists grid_nearby_infection_lookup_idx
  on grid_nearby_infection (
    center_grid_id,
    infection_data_version
  );

create index if not exists grid_nearby_infection_reverse_idx
  on grid_nearby_infection (
    infection_grid_id,
    infection_data_version
  );

create table if not exists grid_infection_stats (
  grid_id bigint not null
    references prediction_grid_static (grid_id)
    on delete cascade,
  year smallint not null
    check (year between 2016 and 2100),
  infection_data_version text not null,

  center_annual_count integer not null default 0
    check (center_annual_count >= 0),
  center_cumulative_count integer not null default 0
    check (center_cumulative_count >= 0),
  block_annual_count integer not null default 0
    check (block_annual_count >= 0),
  block_cumulative_count integer not null default 0
    check (block_cumulative_count >= 0),
  block_active_grid_count smallint not null default 0
    check (block_active_grid_count between 0 and 9),
  nearby_14km_grid_count integer not null default 0
    check (nearby_14km_grid_count >= 0),
  nearby_14km_annual_count integer not null default 0
    check (nearby_14km_annual_count >= 0),
  nearby_14km_cumulative_count integer not null default 0
    check (nearby_14km_cumulative_count >= 0),
  nearby_14km_active_grid_count integer not null default 0
    check (nearby_14km_active_grid_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (
    grid_id,
    year,
    infection_data_version
  )
);

comment on table grid_infection_stats is
  '신규 확산위험 후보 격자의 연도별 중심·3x3 권역·14km 주변 감염 발생 이력 집계';
comment on column grid_infection_stats.grid_id is
  'prediction_grid_static에 등록된 risk_candidate_flag=true 격자 ID';
comment on column grid_infection_stats.year is
  '연도별 발생 이력 집계 기준 연도';
comment on column grid_infection_stats.infection_data_version is
  '통계 산출에 사용한 감염 발생 이력 데이터 버전';

create index if not exists grid_infection_stats_year_idx
  on grid_infection_stats (
    year,
    infection_data_version
  );

alter table prediction_grid_static enable row level security;
alter table grid_nearby_infection enable row level security;
alter table grid_infection_stats enable row level security;

-- 기존 Supabase 테이블과 같은 보안 패턴을 적용한다.
-- anon/authenticated 정책은 만들지 않으며 FastAPI의 service_role만 RLS를 우회해 접근한다.
