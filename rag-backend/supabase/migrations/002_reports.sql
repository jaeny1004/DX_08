-- rag-backend Supabase 스키마 확장: 예측/현장예찰/방제 보고서 3종 저장
-- 근거: app/services/report_template_service.py의 register_report(),
-- app/api/reports.py의 _read_rows()/_matches_filters()/_find_row()/_public_row()
-- (기존에는 report_type별 data/generated_reports/{type}_30/문서목록.csv 파일로
-- 저장하던 것을 이 테이블로 옮긴다).
--
-- reports.py의 _matches_filters()가 SQL WHERE로 필터링하는 컬럼(year, sido_name,
-- sigungu_name, center_grid_id, document_no)만 구조화 컬럼으로 두고, 그 외
-- report_type마다 달라지는 필드(risk_score, risk_grade, priority_score,
-- total_trees, prediction_link_status, link_status, control_status,
-- survey_datetime, planned_shred_count 등 _public_row()가 dict(row)로 통째로
-- 읽던 필드들)는 report_drafts(003_report_drafts.sql)와 동일하게 유동적인
-- JSONB data 컬럼에 저장한다. 3종 연계 판정 로직(_linked_status_for_document 등)은
-- 이 JSONB 필드들을 Python에서 그대로 읽어서 처리한다.

create table if not exists reports (
  id bigserial primary key,
  report_type text not null check (report_type in ('prediction', 'field_survey', 'control')),
  -- 기존 문서목록.csv의 document_no(문자열, report_type별로 1부터 순번)를 그대로 유지.
  -- register_report()가 "select coalesce(max(document_no::int), 0) + 1 ... where
  -- report_type = :t"로 다음 번호를 계산하므로 int가 아닌 text로 둔다.
  document_no text not null,
  file_name text not null,
  year text not null default '',
  center_grid_id text not null default '',
  sido_name text not null default '',
  sigungu_name text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- register_report()가 insert 시 이 제약 위반(중복 키)을 감지해서
  -- document_no를 재계산 후 한 번만 재시도하는 로직의 기반이 되는 제약.
  unique (report_type, document_no)
);

-- reports.py의 list_reports/get_report_options/export_linked_reports가
-- report_type + year/sido_name/sigungu_name 조합으로 자주 조회하므로 복합 인덱스로 커버.
-- (report_type, document_no) 단건 조회는 위 unique 제약이 이미 인덱스를 만들어주므로
-- 별도 인덱스가 필요 없음.
create index if not exists reports_filter_idx
  on reports (report_type, year, sido_name, sigungu_name);

alter table reports enable row level security;

-- document_chunks(001_init.sql), report_drafts(003_report_drafts.sql)와 동일한
-- 보안 패턴: 이 테이블은 서버(FastAPI, service_role 키)만 접근한다.
-- anon/authenticated 대상 정책은 의도적으로 만들지 않음 —
-- RLS를 켜고 정책을 비워두면 service_role만 우회 접근 가능해지고
-- 나머지 키는 자동으로 차단됨.
