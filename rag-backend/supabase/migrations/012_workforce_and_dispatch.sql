-- 현장 모바일 앱(pine-app-main)과 웹 대시보드를 잇는 두 축을 DB로 올린다.
--
-- 배경
--   지금까지 요원 배정(dispatchAssignments)은 웹의 React state에만 있었다.
--   새로고침하면 사라지고, 같은 Supabase를 보는 모바일 앱에서는 아예 볼 수 없었다.
--   요원 명단도 public/data/workforce_v2/*.json 정적 파일이라 앱이 읽을 수 없었다.
--   그래서 "웹에서 배정 -> 앱에서 수행 -> 웹에서 확인"이 끊겨 있었다.
--
--   사진·음성은 이미 연결돼 있다. pine_records.id 를 field_photos.related_record_id 와
--   confirmed_trees.source_report_id 가 함께 가리키는 구조다. 이 마이그레이션은
--   같은 방식으로 "작업 지시" 축을 추가한다.
--
-- 원칙
--   기존 테이블은 건드리지 않는다. 전부 신규 테이블이다.
--   RLS 정책은 이 프로젝트의 기존 관례(<테이블>_<cmd>, anon/authenticated 전면 허용)를
--   그대로 따른다. 경진대회 시연용이라 별도 인증 체계를 두지 않는다.

-- ---------------------------------------------------------------------------
-- 1. 요원 명단 (public/data/workforce_v2/workers.json, 914건)
-- ---------------------------------------------------------------------------
create table if not exists workforce_workers (
  worker_id           text primary key,
  user_id             bigint,
  worker_name         text not null,
  organization        text,
  department          text,
  position_name       text,
  phone_masked        text,

  home_sido_code      text,
  home_sido_name      text,
  home_sigungu_code   text,
  home_sigungu_name   text,
  base_location_name  text,
  base_lat            double precision,
  base_lon            double precision,

  experience_years    integer,
  daily_max_minutes   integer,
  employment_status   text,
  is_dispatchable     boolean not null default true,

  dataset_version     text,
  data_source         text,
  is_sample           boolean not null default false,
  import_batch_id     text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists workforce_workers_sigungu_idx
  on workforce_workers (home_sigungu_code);

comment on table workforce_workers is
  '현장 요원 명단. workforce_v2/workers.json 을 옮긴 것이며 웹 배정 화면과 '
  '모바일 앱 로그인(요원 선택)이 공통으로 읽는다.';

-- ---------------------------------------------------------------------------
-- 2. 요원 역량 (worker_capabilities.json, 1,825건)
--    한 요원이 SURVEY/DRONE/CONTROL 중 여러 개를 가질 수 있다.
-- ---------------------------------------------------------------------------
create table if not exists workforce_capabilities (
  worker_capability_id text primary key,
  worker_id            text not null references workforce_workers(worker_id) on delete cascade,
  task_type            text not null,
  skill_level          integer,
  can_work_solo        boolean not null default false,
  is_primary_skill     boolean not null default false,
  valid_from           date,
  valid_until          date,
  is_active            boolean not null default true,
  dataset_version      text,
  import_batch_id      text
);

create index if not exists workforce_capabilities_worker_idx
  on workforce_capabilities (worker_id);

comment on column workforce_capabilities.task_type is
  'SURVEY(예찰) / DRONE(드론) / CONTROL(방제). 요원의 고정 직군이 아니라 보유 역량이다.';

-- ---------------------------------------------------------------------------
-- 3. 근무 가능 시간 (worker_availability.json, 914건)
-- ---------------------------------------------------------------------------
create table if not exists workforce_availability (
  availability_id      text primary key,
  worker_id            text not null references workforce_workers(worker_id) on delete cascade,
  work_date            date,
  available_start_at   text,
  available_end_at     text,
  break_minutes        integer,
  capacity_minutes     integer,
  assigned_minutes     integer,
  remaining_minutes    integer,
  availability_status  text,
  reason               text,
  dataset_version      text,
  import_batch_id      text
);

create index if not exists workforce_availability_worker_idx
  on workforce_availability (worker_id);

-- ---------------------------------------------------------------------------
-- 4. 요원 현재 상태 (worker_current_status.json, 914건)
--    앱이 위치·배터리를 갱신하고 웹이 읽는다. 그래서 update 정책을 함께 둔다.
-- ---------------------------------------------------------------------------
create table if not exists workforce_status (
  worker_id            text primary key references workforce_workers(worker_id) on delete cascade,
  status               text,
  current_dispatch_id  text,
  current_task_id      text,
  current_lat          double precision,
  current_lon          double precision,
  location_accuracy_m  double precision,
  battery_level        integer,
  network_status       text,
  last_seen_at         timestamptz,
  last_location_at     timestamptz,
  status_updated_at    timestamptz,
  dataset_version      text,
  import_batch_id      text
);

-- ---------------------------------------------------------------------------
-- 5. 작업 배정 — 이번 연동의 핵심
--    컬럼은 프론트 src/types/dispatch.ts 의 DispatchAssignment 를 그대로 옮긴 것이다.
--    타입을 바꿀 때는 두 곳을 함께 고쳐야 한다.
-- ---------------------------------------------------------------------------
create table if not exists dispatch_assignments (
  assignment_id        text primary key,

  worker_id            text not null,
  worker_name          text not null,
  worker_type          text not null,
  task_type            text not null,
  assigned_skill_level integer,
  worker_capabilities  jsonb not null default '[]'::jsonb,

  home_sido_name       text,
  home_sigungu_code    text,
  home_sigungu_name    text,

  target_sido_name     text,
  target_sigungu_code  text,
  target_sigungu_name  text,
  target_emd_code      text,
  target_emd_name      text,

  grid_id              text not null,
  target_latitude      double precision,
  target_longitude     double precision,

  -- 방제 작업 완료 시 어느 확진목을 방제완료로 바꿀지 찾는 열쇠.
  -- confirmed_trees.id 를 가리키지만 FK를 걸지 않는다.
  -- 확진목이 지워져도 배정 이력은 남겨야 하기 때문이다.
  source_tree_id       text,

  priority_grade       text,
  risk_grade           text,
  risk_score           double precision,
  access_score         double precision,

  distance_km                    double precision,
  travel_time_hour               double precision,
  battery_percent                double precision,
  remaining_minutes_at_assignment integer,

  recommendation_reason text,
  assignment_type       text,

  status                text not null default '배정 대기',
  assigned_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz
);

create index if not exists dispatch_assignments_worker_idx
  on dispatch_assignments (worker_id, status);

create index if not exists dispatch_assignments_tree_idx
  on dispatch_assignments (source_tree_id);

comment on table dispatch_assignments is
  '웹에서 만든 요원 배정. 모바일 앱이 worker_id 로 조회해 "내 작업"으로 보여주고, '
  '상태 변경을 여기에 되돌려 쓴다. src/types/dispatch.ts 의 DispatchAssignment 와 1:1.';

comment on column dispatch_assignments.status is
  '배정 대기 / 배정 수락 / 출동 / 현장 도착 / 작업 중 / 작업 완료 / 복귀 / 복귀 완료';

-- ---------------------------------------------------------------------------
-- RLS — 기존 테이블(pine_records, field_photos 등)과 같은 관례를 따른다.
-- ---------------------------------------------------------------------------
alter table workforce_workers        enable row level security;
alter table workforce_capabilities   enable row level security;
alter table workforce_availability   enable row level security;
alter table workforce_status         enable row level security;
alter table dispatch_assignments     enable row level security;

-- create policy 에는 if not exists 가 없다. 두 번 돌려도 안전하도록 감싼다.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='workforce_workers' and policyname='workforce_workers_select') then
    -- 명단·역량·근무가능: 읽기 전용
    create policy workforce_workers_select on workforce_workers
      for select to anon, authenticated using (true);
    create policy workforce_capabilities_select on workforce_capabilities
      for select to anon, authenticated using (true);
    create policy workforce_availability_select on workforce_availability
      for select to anon, authenticated using (true);

    -- 현재 상태: 앱이 위치·배터리를 갱신한다
    create policy workforce_status_select on workforce_status
      for select to anon, authenticated using (true);
    create policy workforce_status_update on workforce_status
      for update to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='dispatch_assignments' and policyname='dispatch_assignments_select') then
    -- 배정: 웹이 만들고 양쪽이 상태를 바꾼다
    create policy dispatch_assignments_select on dispatch_assignments
      for select to anon, authenticated using (true);
    create policy dispatch_assignments_insert on dispatch_assignments
      for insert to anon, authenticated with check (true);
    create policy dispatch_assignments_update on dispatch_assignments
      for update to anon, authenticated using (true) with check (true);
    create policy dispatch_assignments_delete on dispatch_assignments
      for delete to anon, authenticated using (true);
  end if;
end $$;

-- Supabase 기본 권한이 신규 테이블에 자동으로 붙지 않는 경우가 있어 명시한다.
grant select on workforce_workers, workforce_capabilities, workforce_availability
  to anon, authenticated;
grant select, update on workforce_status to anon, authenticated;
grant select, insert, update, delete on dispatch_assignments to anon, authenticated;

-- 모바일 앱이 배정을 즉시 받아보도록 Realtime 발행 대상에 넣는다.
-- 이미 등록돼 있으면 오류가 나므로 조건부로 처리한다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispatch_assignments'
  ) then
    alter publication supabase_realtime add table dispatch_assignments;
  end if;
end $$;
