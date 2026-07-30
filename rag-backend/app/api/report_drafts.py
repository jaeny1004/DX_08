from __future__ import annotations

from pathlib import Path
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field

from app.api.auth import get_current_user
from app.models.user import User
from app.services.report_draft_service import (
    REPORT_LABELS,
    build_xlsx,
    create_draft,
    load_draft,
    update_draft,
)
from app.services.control_template_service import apply_control_template
from app.services.field_survey_template_service import (
    apply_field_survey_template,
)
from app.services.prediction_template_service import (
    apply_prediction_template,
)
from app.services.report_template_service import (
    create_storage_signed_url,
    get_template_storage_key,
    register_report,
)

router = APIRouter(prefix="/api/report-drafts", tags=["신규 보고서 생성"])


def _apply_template(report_type: str, draft_id: str) -> dict:
    if report_type == "prediction":
        return apply_prediction_template(draft_id)
    if report_type == "field_survey":
        return apply_field_survey_template(draft_id)
    if report_type == "control":
        return apply_control_template(draft_id)
    raise ValueError(f"지원하지 않는 문서 유형입니다: {report_type}")


class IncludeSections(BaseModel):
    risk_summary: bool = True
    priority_summary: bool = True
    infection_history: bool = True
    workforce_plan: bool = False
    control_scenario: bool = False


class DraftCreateRequest(BaseModel):
    report_type: Literal["prediction", "field_survey", "control"]
    title: str = Field(default="", max_length=200)
    year: int = Field(ge=2016, le=2100)
    start_date: str
    end_date: str
    sido_name: str = Field(min_length=1, max_length=50)
    sigungu_name: str = Field(min_length=1, max_length=50)
    center_grid_ids: list[str] = Field(min_length=1, max_length=1)
    include_sections: IncludeSections = Field(default_factory=IncludeSections)
    user_notes: str = Field(default="", max_length=3000)


class DraftSectionUpdate(BaseModel):
    key: str
    heading: str
    content: str


class DraftUpdateRequest(BaseModel):
    title: str | None = None
    status: Literal["draft", "reviewed", "approved", "registered"] | None = None
    sections: list[DraftSectionUpdate] | None = None


@router.get("/types")
def get_types() -> dict:
    return {"items": [{"value": key, "label": label} for key, label in REPORT_LABELS.items()]}


@router.post("")
def create_new_draft(
    request: DraftCreateRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        draft = create_draft(request.model_dump(), created_by=current_user.email)
        template_output = _apply_template(request.report_type, draft["draft_id"])
        draft = load_draft(draft["draft_id"])
        draft["template_output"] = template_output
        return draft
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{draft_id}")
def get_draft(draft_id: str, current_user: User = Depends(get_current_user)) -> dict:
    try:
        return load_draft(draft_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{draft_id}")
def save_draft_changes(
    draft_id: str,
    request: DraftUpdateRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        payload = request.model_dump()
        if payload.get("sections") is not None:
            payload["sections"] = [section.model_dump() for section in request.sections or []]
        return update_draft(draft_id, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{draft_id}/apply-template")
def apply_template(draft_id: str, current_user: User = Depends(get_current_user)) -> dict:
    try:
        output = _apply_template(load_draft(draft_id)["report_type"], draft_id)
        return {"draft_id": draft_id, "status": "generated", "template_output": output}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{draft_id}/preview/pdf")
def preview_template_pdf(
    draft_id: str,
    current_user: User = Depends(get_current_user),
) -> RedirectResponse:
    try:
        storage_key = get_template_storage_key(draft_id, "pdf")
        signed_url = create_storage_signed_url(storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail="PDF Storage 객체를 찾을 수 없습니다.",
        ) from exc
    return RedirectResponse(signed_url)


@router.post("/{draft_id}/register")
def register_draft(draft_id: str, current_user: User = Depends(get_current_user)) -> dict:
    try:
        registered = register_report(draft_id)
        return {"draft_id": draft_id, "status": "registered", "registered_report": registered}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{draft_id}/export/{file_format}")
def export_draft(
    draft_id: str,
    file_format: Literal["docx", "pdf", "xlsx"],
    current_user: User = Depends(get_current_user),
) -> Response:
    try:
        draft = load_draft(draft_id)
        if file_format == "xlsx":
            workbook = build_xlsx(draft)
            filename = Path(workbook.name).name
            return Response(
                content=workbook.getvalue(),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": (
                        "attachment; "
                        f"filename*=UTF-8''{quote(filename)}"
                    )
                },
            )

        storage_key = get_template_storage_key(draft_id, file_format)
        template_output = draft.get("template_output")
        filename = (
            str(template_output.get(f"{file_format}_filename", "")).strip()
            if isinstance(template_output, dict)
            else ""
        ) or Path(storage_key).name
        signed_url = create_storage_signed_url(
            storage_key,
            download_filename=filename,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"{file_format.upper()} Storage 객체를 찾을 수 없습니다.",
        ) from exc

    return RedirectResponse(signed_url)
