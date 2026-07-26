"""data/generated_reports/{type}_30/pdf(·docx)/*.* ↔ Supabase Storage 'reports' 버킷 키 매핑.

doc_storage.py와 동일한 이유(Storage object key는 한글 등 ASCII 외 문자를 허용하지
않음)로 파일명의 sha1 해시를 키로 쓴다. report_type을 키 경로의 prefix로 넣어
prediction/field_survey/control 3종의 파일명이 우연히 겹치더라도 서로 다른 키가
되도록 한다(버킷은 3종 공용으로 하나만 쓴다 — app.api.reports가 이 모듈을 씀).
"""
from __future__ import annotations

import hashlib
from pathlib import Path

BUCKET = "reports"


def storage_key_for(report_type: str, filename: str) -> str:
    ext = Path(filename).suffix.lower() or ".pdf"
    digest = hashlib.sha1(filename.encode("utf-8")).hexdigest()[:16]
    return f"{report_type}/{digest}{ext}"


def draft_storage_key_for(draft_id: str, filename: str) -> str:
    """Return the Storage object key for a draft artifact."""
    safe_draft_id = str(draft_id).strip()
    safe_filename = Path(filename).name
    if not safe_draft_id or safe_draft_id in {".", ".."}:
        raise ValueError("draft_id가 비어 있습니다.")
    if "/" in safe_draft_id or "\\" in safe_draft_id:
        raise ValueError(f"잘못된 draft_id입니다: {draft_id}")
    if not safe_filename or safe_filename in {".", ".."}:
        raise ValueError("파일명이 비어 있습니다.")
    ext = Path(safe_filename).suffix.lower() or ".bin"
    digest = hashlib.sha1(safe_filename.encode("utf-8")).hexdigest()[:16]
    return f"drafts/{safe_draft_id}/{digest}{ext}"
