from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.control_report_generator import (
    generate_single_control_report,
)
from app.services.report_draft_service import (
    load_draft,
    save_draft,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
GENERATED_DRAFT_ROOT = (
    PROJECT_ROOT
    / "rag-backend"
    / "data"
    / "generated_drafts"
)


def _read_single_grid_id(
    draft: dict[str, Any],
) -> int:
    values = [
        str(value).strip()
        for value in draft.get("center_grid_ids", [])
        if str(value).strip()
    ]

    if len(values) != 1:
        raise ValueError(
            "행정양식 적용은 중심 격자 ID 1개만 지원합니다."
        )

    try:
        return int(values[0])
    except ValueError as exc:
        raise ValueError(
            f"중심 격자 ID가 숫자가 아닙니다: {values[0]}"
        ) from exc


def apply_control_template(
    draft_id: str,
) -> dict[str, Any]:
    draft = load_draft(draft_id)

    if draft.get("report_type") != "control":
        raise ValueError(
            "이 함수는 방제 보고서만 지원합니다."
        )

    center_grid_id = _read_single_grid_id(draft)
    year = int(draft.get("year") or 2026)

    draft_directory = GENERATED_DRAFT_ROOT / draft_id
    output_directory = draft_directory / "control_template"

    draft_directory.mkdir(parents=True, exist_ok=True)
    output_directory.mkdir(parents=True, exist_ok=True)

    data_summary = draft.get("data_summary")
    center_metrics = (
        data_summary.get("center_grid")
        if isinstance(data_summary, dict)
        and isinstance(data_summary.get("center_grid"), dict)
        else {}
    )
    # prediction_template_service.py와 동일한 원칙: draft가 들고 있는 다른
    # 정규화 값까지 넘기면 기존 보고서 수치가 달라지므로 같은 입력만 전달한다.
    candidate_metrics = {
        "risk_score": center_metrics.get("risk_score"),
        "risk_grade": center_metrics.get("risk_grade"),
        "access_score_v3": center_metrics.get("access_score"),
    }
    result = generate_single_control_report(
        center_grid_id=center_grid_id,
        year=year,
        output_root=output_directory,
        report_no=1,
        candidate_metrics=candidate_metrics,
    )

    docx_path = Path(result["docx_path"]).resolve()
    pdf_path = Path(result["pdf_path"]).resolve()

    for label, path in {
        "DOCX": docx_path,
        "PDF": pdf_path,
    }.items():
        if not path.is_file():
            raise RuntimeError(
                f"{label} 생성 결과가 없습니다: {path}"
            )

    template_output = {
        "status": "generated",
        "center_grid_id": center_grid_id,
        "year": year,
        "sido_name": result.get("sido_name"),
        "sigungu_name": result.get("sigungu_name"),
        "risk_score": result.get("risk_score"),
        "risk_grade": result.get("risk_grade"),
        "priority_score": result.get("priority_score"),
        "priority_grade": result.get("priority_grade"),
        "suspicious_count": result.get("suspicious_count"),
        "sample_count": result.get("sample_count"),
        "field_survey_linked": result.get("field_survey_linked"),
        "docx_path": str(docx_path),
        "pdf_path": str(pdf_path),
    }

    draft["template_output"] = template_output
    save_draft(draft)

    return template_output


def get_control_template_file(
    draft_id: str,
    file_format: str,
) -> Path:
    if file_format not in {"docx", "pdf"}:
        raise ValueError(
            "행정양식 파일은 DOCX와 PDF만 지원합니다."
        )

    draft = load_draft(draft_id)
    template_output = draft.get("template_output")

    if not isinstance(template_output, dict):
        raise FileNotFoundError(
            "아직 행정양식이 적용되지 않았습니다."
        )

    path_value = template_output.get(
        f"{file_format}_path"
    )

    if not path_value:
        raise FileNotFoundError(
            f"{file_format.upper()} 경로가 없습니다."
        )

    path = Path(str(path_value)).resolve()

    if not path.is_file():
        raise FileNotFoundError(
            f"생성 파일을 찾을 수 없습니다: {path}"
        )

    return path
