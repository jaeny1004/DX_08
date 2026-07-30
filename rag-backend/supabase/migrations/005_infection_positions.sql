-- 14km 주변 감염 이력 격자를 행 단위 관계 테이블 대신 bigint[]로 저장한다.
-- 감염 이력 격자의 지도 geometry와 연도별 건수는 별도 기준 테이블에서 한 번만 저장한다.

drop table if exists grid_nearby_infection;

alter table prediction_grid_static
  add column if not exists nearby_infection_grid_ids bigint[]
  not null default '{}'::bigint[];

comment on column prediction_grid_static.nearby_infection_grid_ids is
  '중심점 14km buffer와 교차하는 감염 발생 이력 격자 ID 배열';

create table if not exists infection_grid_positions (
  grid_id bigint primary key,
  geometry_4326 jsonb not null
    check (jsonb_typeof(geometry_4326) = 'object'),
  infection_count_2016 integer not null default 0
    check (infection_count_2016 >= 0),
  infection_count_2017 integer not null default 0
    check (infection_count_2017 >= 0),
  infection_count_2018 integer not null default 0
    check (infection_count_2018 >= 0),
  infection_count_2019 integer not null default 0
    check (infection_count_2019 >= 0),
  infection_count_2020 integer not null default 0
    check (infection_count_2020 >= 0),
  infection_count_2021 integer not null default 0
    check (infection_count_2021 >= 0),
  infection_count_2016_2021 integer not null default 0
    check (infection_count_2016_2021 >= 0),
  infection_data_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table infection_grid_positions is
  '지도 표출에 필요한 감염 발생 이력 격자의 EPSG:4326 geometry와 2016~2021 연도별·누적 건수';
comment on column infection_grid_positions.geometry_4326 is
  'EPSG:4326 감염 발생 이력 격자 GeoJSON 객체';
comment on column infection_grid_positions.infection_data_version is
  'geometry와 감염 발생 건수의 원본 데이터 버전';

create index if not exists infection_grid_positions_version_idx
  on infection_grid_positions (infection_data_version);

alter table infection_grid_positions enable row level security;

-- 004 마이그레이션으로 적재한 100개·600개 테스트 데이터는 새 구조에서 다시 생성한다.
truncate table grid_infection_stats, prediction_grid_static;

-- 기존 테이블과 같은 보안 패턴을 적용한다.
-- anon/authenticated 정책은 만들지 않으며 FastAPI의 service_role만 RLS를 우회해 접근한다.
