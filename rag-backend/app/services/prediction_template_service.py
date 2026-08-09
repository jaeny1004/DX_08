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

    data_summary = draft.get("data_summary")
    center_metrics = (
        data_summary.get("center_grid")
        if isinstance(data_summary, dict)
        and isinstance(data_summary.get("center_grid"), dict)
        else {}
    )
    # 예찰 우선순위도 함께 넘긴다.
    # 넘기지 않으면 생성기가 자체 공식(risk*0.72+압력*0.20+접근성*0.08)으로
    # 다시 계산해, 화면에는 "우선 예찰 65.0점"인데 발행된 문서에는
    # "집중 관찰 56.2점"이 찍히는 불일치가 생긴다. 등급은 곧 인력 배치
    # 근거이므로 화면·대시보드와 같은 실측 예측값으로 통일한다.
    candidate_metrics = {
        "risk_score": center_metrics.get("risk_score"),
        "risk_grade": center_metrics.get("risk_grade"),
        "access_score_v3": center_metrics.get("access_score"),
        "priority_score": center_metrics.get("priority_score"),
        "priority_grade": center_metrics.get("priority_grade"),
    }

    # 인접 격자 표에 채울 실제 값(방위·거리·위험도·우선순위).
    # 생성기는 격자 ID만 알고 있어 표가 전부 "-"로 비어 있었다.
    neighbor_metrics = (
        data_summary.get("neighbor_grids")
        if isinstance(data_summary, dict)
        and isinstance(data_summary.get("neighbor_grids"), list)
        else []
    )
    with TemporaryDirectory(prefix=f"{draft_id}-") as temporary_directory:
        output_directory = Path(temporary_directory) / "prediction_template"
        result = generate_single_prediction_report(
            center_grid_id=center_grid_id,
            year=year,
            output_root=output_directory,
            report_no=1,
            candidate_metrics=candidate_metrics,
            neighbor_metrics=neighbor_metrics,
            # 사용자가 입력한 기간·제목을 문서에 그대로 반영한다.
            start_date=str(draft.get("start_date") or "").strip() or None,
            end_date=str(draft.get("end_date") or "").strip() or None,
            title=str(draft.get("title") or "").strip() or None,
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
