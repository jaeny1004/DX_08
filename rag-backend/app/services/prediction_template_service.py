from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from app.services.report_draft_service import (
    load_draft,
    save_draft,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
REPORT_PYTHON = PROJECT_ROOT / "report-venv" / "bin" / "python"
SINGLE_GENERATOR = (
    PROJECT_ROOT
    / "scripts"
    / "prediction_report_single.py"
)
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


def _validate_runtime() -> None:
    if not REPORT_PYTHON.is_file():
        raise FileNotFoundError(
            f"보고서 가상환경 Python이 없습니다: {REPORT_PYTHON}"
        )

    if not SINGLE_GENERATOR.is_file():
        raise FileNotFoundError(
            f"단일 보고서 생성기가 없습니다: {SINGLE_GENERATOR}"
        )


def apply_prediction_template(
    draft_id: str,
) -> dict[str, Any]:
    draft = load_draft(draft_id)

    if draft.get("report_type") != "prediction":
        raise ValueError(
            "현재 1차 연결은 신규 확산위험 분석 보고서만 지원합니다."
        )

    _validate_runtime()

    center_grid_id = _read_single_grid_id(draft)
    year = int(draft.get("year") or 2026)

    draft_directory = GENERATED_DRAFT_ROOT / draft_id
    output_directory = draft_directory / "prediction_template"
    result_json = draft_directory / "prediction_template_result.json"

    draft_directory.mkdir(parents=True, exist_ok=True)
    output_directory.mkdir(parents=True, exist_ok=True)

    runner_code = r"""
import importlib.util
import json
import sys
from pathlib import Path

script_path = Path(sys.argv[1])
center_grid_id = int(sys.argv[2])
year = int(sys.argv[3])
output_directory = Path(sys.argv[4])
result_json = Path(sys.argv[5])

spec = importlib.util.spec_from_file_location(
    "prediction_report_single_runtime",
    script_path,
)
if spec is None or spec.loader is None:
    raise RuntimeError(
        f"생성기를 불러올 수 없습니다: {script_path}"
    )

module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

result = module.generate_single_prediction_report(
    center_grid_id=center_grid_id,
    year=year,
    output_root=output_directory,
    report_no=1,
)

result_json.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
"""

    completed = subprocess.run(
        [
            str(REPORT_PYTHON),
            "-c",
            runner_code,
            str(SINGLE_GENERATOR),
            str(center_grid_id),
            str(year),
            str(output_directory),
            str(result_json),
        ],
        cwd=str(PROJECT_ROOT),
        text=True,
        capture_output=True,
        timeout=300,
        check=False,
    )

    if completed.returncode != 0:
        detail = (
            completed.stderr.strip()
            or completed.stdout.strip()
            or "알 수 없는 생성 오류"
        )
        raise RuntimeError(
            "기존 양식 보고서 생성에 실패했습니다.\n"
            f"{detail}"
        )

    if not result_json.is_file():
        raise RuntimeError(
            f"생성 결과 JSON이 없습니다: {result_json}"
        )

    result = json.loads(
        result_json.read_text(encoding="utf-8")
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
        "docx_path": str(docx_path),
        "pdf_path": str(pdf_path),
        "map_path": str(map_path),
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
