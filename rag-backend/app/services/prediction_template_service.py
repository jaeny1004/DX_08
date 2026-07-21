from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

from app.services.report_draft_service import (
    load_draft,
    save_draft,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SINGLE_GENERATOR_PATH = (
    PROJECT_ROOT
    / "scripts"
    / "prediction_report_single.py"
)


def _load_single_generator() -> Any:
    if not SINGLE_GENERATOR_PATH.is_file():
        raise FileNotFoundError(
            "단일 발생 예측 보고서 생성기를 찾을 수 없습니다: "
            f"{SINGLE_GENERATOR_PATH}"
        )

    module_name = "prediction_report_single"

    if module_name in sys.modules:
        return sys.modules[module_name]

    spec = importlib.util.spec_from_file_location(
        module_name,
        SINGLE_GENERATOR_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(
            "단일 발생 예측 보고서 생성기를 불러올 수 없습니다."
        )

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _choose_center_grid_id(
    draft: dict[str, Any],
) -> int:
    selected = [
        str(value).strip()
        for value in draft.get("center_grid_ids", [])
        if str(value).strip()
    ]

    if len(selected) != 1:
        raise ValueError(
            "기존 발생 예측 보고서 양식 적용 시에는 "
            "중심 격자 ID를 정확히 1개 입력해야 합니다."
        )

    try:
        return int(selected[0])
    except ValueError as exc:
        raise ValueError(
            f"중심 격자 ID가 숫자가 아닙니다: {selected[0]}"
        ) from exc


def apply_prediction_template(
    draft_id: str,
) -> dict[str, Any]:
    draft = load_draft(draft_id)

    if draft.get("report_type") != "prediction":
        raise ValueError(
            "현재 1차 연결은 신규 확산위험 분석 보고서만 지원합니다."
        )

    center_grid_id = _choose_center_grid_id(draft)
    year = int(draft.get("year") or 2021)

    generator = _load_single_generator()

    draft_directory = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "generated_drafts"
        / draft_id
    )
    template_output_directory = (
        draft_directory
        / "prediction_template"
    )

    result = generator.generate_single_prediction_report(
        center_grid_id=center_grid_id,
        year=year,
        output_root=template_output_directory,
        report_no=1,
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

    draft["template_output"] = {
        "status": "generated",
        "generator": "prediction_report_single.py",
        "center_grid_id": center_grid_id,
        "year": year,
        "sido_name": result.get("sido_name"),
        "sigungu_name": result.get("sigungu_name"),
        "risk_score": result.get("risk_score"),
        "risk_grade": result.get("risk_grade"),
        "priority_score": result.get(
            "priority_score"
        ),
        "priority_grade": result.get(
            "priority_grade"
        ),
        "block_grid_ids": result.get(
            "block_grid_ids",
            [],
        ),
        "docx_path": str(docx_path),
        "pdf_path": str(pdf_path),
        "map_path": str(map_path),
    }

    save_draft(draft)
    return draft["template_output"]


def get_prediction_template_file(
    draft_id: str,
    file_format: str,
) -> Path:
    draft = load_draft(draft_id)
    template_output = draft.get("template_output")

    if not isinstance(template_output, dict):
        raise FileNotFoundError(
            "아직 행정양식이 적용되지 않았습니다."
        )

    if file_format not in {"docx", "pdf"}:
        raise ValueError(
            "기존 발생 예측 양식은 DOCX와 PDF만 지원합니다."
        )

    path_value = template_output.get(
        f"{file_format}_path"
    )
    if not path_value:
        raise FileNotFoundError(
            f"{file_format.upper()} 경로가 저장되지 않았습니다."
        )

    path = Path(path_value).resolve()
    if not path.is_file():
        raise FileNotFoundError(
            f"생성 파일을 찾을 수 없습니다: {path}"
        )

    return path
