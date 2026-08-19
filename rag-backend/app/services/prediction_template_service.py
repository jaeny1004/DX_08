from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from app.core.report_storage import draft_storage_key_for
from app.services.prediction_report_generator import (
    generate_single_prediction_report,
)
from app.services.report_draft_service import (
    load_draft,
    save_draft,
)
from app.services.report_template_service import (
    upload_storage_file,
)
from app.services.template_service_utils import read_single_grid_id


def apply_prediction_template(
    draft_id: str,
) -> dict[str, Any]:
    draft = load_draft(draft_id)

    if draft.get("report_type") != "prediction":
        raise ValueError(
            "현재 1차 연결은 신규 확산위험 분석 보고서만 지원합니다."
        )

    center_grid_id = read_single_grid_id(draft)
    year = int(draft.get("year") or 2026)
    start_date = str(draft.get("start_date") or "").strip()
    end_date = str(draft.get("end_date") or "").strip()

    if not start_date or not end_date:
        raise ValueError(
            "확산위험 분석 보고서의 시작일과 종료일이 없습니다."
        )

    data_summary = draft.get("data_summary")
    center_metrics = (
        data_summary.get("center_grid")
        if isinstance(data_summary, dict)
        and isinstance(data_summary.get("center_grid"), dict)
        else {}
    )
    # 기존 생성기는 후보 GeoJSON에서 risk_score/risk_grade와
    # access_score_v3만 실제 지표에 덮어썼다. draft의 정규화된 다른
    # 값까지 전달하면 기존 보고서 수치가 달라지므로 같은 입력만 넘긴다.
    candidate_metrics = {
        "risk_score": center_metrics.get("risk_score"),
        "risk_grade": center_metrics.get("risk_grade"),
        "access_score_v3": center_metrics.get("access_score"),
    }
    with TemporaryDirectory(prefix=f"{draft_id}-") as temporary_directory:
        output_directory = Path(temporary_directory) / "prediction_template"
        result = generate_single_prediction_report(
            center_grid_id=center_grid_id,
            year=year,
            output_root=output_directory,
            report_no=1,
            candidate_metrics=candidate_metrics,
            start_date=start_date,
            end_date=end_date,
        )

        docx_path = Path(result["docx_path"]).resolve()
        pdf_path = Path(result["pdf_path"]).resolve()
        map_path = Path(result["map_path"]).resolve()

        for label, path in {
            "DOCX": docx_path,
            "PDF": pdf_path,
            "지도": map_path,
        }.items():
            if not path.is_file():
                raise RuntimeError(
                    f"{label} 생성 결과가 없습니다: {path}"
                )

        docx_storage_key = upload_storage_file(
            docx_path,
            draft_storage_key_for(draft_id, docx_path.name),
        )
        pdf_storage_key = upload_storage_file(
            pdf_path,
            draft_storage_key_for(draft_id, pdf_path.name),
        )
        map_storage_key = upload_storage_file(
            map_path,
            draft_storage_key_for(draft_id, map_path.name),
        )

    template_output = {
        "status": "generated",
        "center_grid_id": center_grid_id,
        "year": year,
        "start_date": result.get("start_date"),
        "end_date": result.get("end_date"),
        "sido_name": result.get("sido_name"),
        "sigungu_name": result.get("sigungu_name"),
        "risk_score": result.get("risk_score"),
        "risk_grade": result.get("risk_grade"),
        "priority_score": result.get("priority_score"),
        "priority_grade": result.get("priority_grade"),
        "block_grid_ids": result.get(
            "block_grid_ids",
            [],
        ),
        "docx_storage_key": docx_storage_key,
        "pdf_storage_key": pdf_storage_key,
        "map_storage_key": map_storage_key,
        "docx_filename": docx_path.name,
        "pdf_filename": pdf_path.name,
        "map_filename": map_path.name,
    }

    draft["template_output"] = template_output
    save_draft(draft)

    return template_output


def get_prediction_template_file(
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
