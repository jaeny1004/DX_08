from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.auth import get_current_user
from app.models.user import User
from app.services.report_draft_service import (
    REPORT_LABELS,
    build_docx,
    build_pdf,
    build_xlsx,
    create_draft,
    load_draft,
    update_draft,
)

router = APIRouter(prefix="/api/report-drafts", tags=["신규 보고서 생성"])


class IncludeSections(BaseModel):
    risk_summary: bool = True
    priority_summary: bool = True
    infection_history: bool = True
    workforce_plan: bool = False
    control_scenario: bool = False


class DraftCreateRequest(BaseModel):
    report_type: Literal["prediction", "field_survey_plan", "field_survey_result", "control_plan", "integrated"]
    title: str = Field(default="", max_length=200)
    year: int = Field(ge=2016, le=2100)
    start_date: str
    end_date: str
    sido_name: str = Field(min_length=1, max_length=50)
    sigungu_name: str = Field(default="", max_length=50)
    center_grid_ids: list[str] = Field(default_factory=list)
    reference_document_nos: list[str] = Field(default_factory=list)
    include_sections: IncludeSections = Field(default_factory=IncludeSections)
    user_notes: str = Field(default="", max_length=3000)


class DraftSectionUpdate(BaseModel):
    key: str
    heading: str
    content: str


class DraftUpdateRequest(BaseModel):
    title: str | None = None
    status: Literal["draft", "reviewed", "approved"] | None = None
    sections: list[DraftSectionUpdate] | None = None


@router.get("/types")
def get_types() -> dict:
    return {"items": [{"value": key, "label": label} for key, label in REPORT_LABELS.items()]}


@router.post("")
def create_new_draft(request: DraftCreateRequest, current_user: User = Depends(get_current_user)) -> dict:
    try:
        return create_draft(request.model_dump(), created_by=current_user.email)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{draft_id}")
def get_draft(draft_id: str, current_user: User = Depends(get_current_user)) -> dict:
    try:
        return load_draft(draft_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{draft_id}")
def save_draft_changes(draft_id: str, request: DraftUpdateRequest, current_user: User = Depends(get_current_user)) -> dict:
    try:
        payload = request.model_dump()
        if payload.get("sections") is not None:
            payload["sections"] = [section.model_dump() for section in request.sections or []]
        return update_draft(draft_id, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{draft_id}/export/{file_format}")
def export_draft(draft_id: str, file_format: Literal["docx", "pdf", "xlsx"], current_user: User = Depends(get_current_user)) -> FileResponse:
    try:
        draft = load_draft(draft_id)
        path = build_docx(draft) if file_format == "docx" else build_xlsx(draft) if file_format == "xlsx" else build_pdf(draft)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc

    media_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    return FileResponse(path=path, filename=Path(path).name, media_type=media_types[file_format])
