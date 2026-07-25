-- rag-backend Supabase 스키마 확장: 보고서 초안(draft) 저장
-- 근거: app/services/report_draft_service.py의 save_draft/load_draft/update_draft
-- (기존에는 data/generated_drafts/{draft_id}/draft.json 파일로 저장하던 것을
-- 이 테이블로 옮긴다). draft 딕셔너리는 report_template_service.py /
-- prediction_template_service.py가 template_output, registered_report 등
-- 임의의 키를 계속 덧붙이는 유동적 구조라 JSONB 컬럼(data)에 통째로 저장한다.

create table if not exists report_drafts (
  -- 기존 "DRAFT-YYYYMMDD-XXXXXXXX" 포맷(report_draft_service.create_draft)을 그대로 유지
  draft_id text primary key,
  report_type text not null check (report_type in ('prediction', 'field_survey', 'control')),
  status text not null default 'draft',
  created_by text,
  -- draft.json 전체를 그대로 저장 (draft_id/report_type/status도 중복 포함되지만
  -- load_draft()가 파일 전체를 그대로 반환하던 기존 동작을 그대로 재현하기 위함)
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- report_drafts.py의 상태별 목록 조회(향후 확장) 대비
create index if not exists report_drafts_status_idx
  on report_drafts (status);

alter table report_drafts enable row level security;

-- document_chunks(001_init.sql)와 동일한 보안 패턴:
-- 이 테이블은 서버(FastAPI, service_role 키)만 접근한다.
-- anon/authenticated 대상 정책은 의도적으로 만들지 않음 —
-- RLS를 켜고 정책을 비워두면 service_role만 우회 접근 가능해지고
-- 나머지 키는 자동으로 차단됨.
