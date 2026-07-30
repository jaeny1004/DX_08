#!/usr/bin/env python3
"""백필 reports.data 대표 행으로 ReportLab 별지 8종 PDF·PNG를 만든다."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import fitz
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
OUTPUT_ROOT = (
    PROJECT_ROOT
    / "data"
    / "precompute_logs"
    / "reportlab_appendix_render"
)
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.report_render.appendices import (  # noqa: E402
    APPENDIX_TITLES,
    _block_ids,
    control_appendix_rows,
    field_survey_appendix_rows,
    prediction_appendix_rows,
)
from app.services.report_render.renderer import render_report_pdf  # noqa: E402


def load_representative_rows() -> dict[str, dict[str, Any]]:
    load_dotenv(BACKEND_ROOT / ".env")
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("rag-backend/.env에 DATABASE_URL이 필요합니다.")
    engine = create_engine(database_url, pool_pre_ping=True)
    order_fields = {
        "prediction": "risk_score",
        "field_survey": "suspicious_count",
        "control": "planned_count",
    }
    rows: dict[str, dict[str, Any]] = {}
    with engine.connect() as connection:
        for report_type, order_field in order_fields.items():
            query = text(
                f"""
                select
                  report_type,
                  document_no,
                  year,
                  center_grid_id,
                  sido_name,
                  sigungu_name,
                  data
                from reports
                where report_type = :report_type
                order by coalesce(
                  nullif(data ->> '{order_field}', '')::numeric,
                  0
                ) desc,
                document_no
                limit 1
                """
            )
            row = connection.execute(
                query,
                {"report_type": report_type},
            ).mappings().one()
            rows[report_type] = dict(row)
    return rows


def draft_payload(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row.get("data") or {})
    year = int(row["year"])
    grid_id = int(row["center_grid_id"])
    return {
        **row,
        "title": f"{year}년 {row['sigungu_name']} 별지 렌더링 검증",
        "start_date": f"{year}-01-01",
        "end_date": data.get("survey_datetime") or f"{year}-12-20",
        "user_notes": "",
        "center_grid_ids": [str(grid_id)],
        "data": data,
        "data_summary": {
            "selected_grid_count": 1,
            "region_candidate_count": 1,
            "grid_ids": [str(grid_id)],
            "center_grid": {
                "grid_id": str(grid_id),
                "sido_name": row["sido_name"],
                "sigungu_name": row["sigungu_name"],
                "risk_score": data.get("risk_score"),
                "risk_grade": data.get("risk_grade"),
                "priority_score": data.get("priority_score"),
                "priority_grade": data.get("priority_grade"),
                "pine_ratio": data.get("pine_ratio"),
            },
            "neighbor_grids": [],
        },
    }


def validate_source_values(
    report_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    data = payload["data"]
    if report_type == "prediction":
        report_rows, plan_rows = prediction_appendix_rows(payload)
        parsed_block_ids = _block_ids(payload)
        if not parsed_block_ids:
            raise RuntimeError("prediction block_grid_ids 파싱 결과가 비었습니다.")
        return {
            "risk_score_source": data.get("risk_score"),
            "block_grid_ids_source": data.get("block_grid_ids"),
            "parsed_block_grid_ids": parsed_block_ids,
            "parsed_block_count": len(parsed_block_ids),
            "report_row_count": len(report_rows),
            "plan_row_count": len(plan_rows),
        }
    if report_type == "field_survey":
        values = field_survey_appendix_rows(payload)
        expected_suspicious = int(data.get("suspicious_count") or 0)
        expected_sample = int(data.get("sample_count") or 0)
        if int(values["result_row"][3]) != expected_suspicious:
            raise RuntimeError("field_survey suspicious_count 우선순위 불일치")
        expected_note = (
            f"시료 {expected_sample}점\n현장 확인 필요"
            if expected_sample > 0
            else "이상징후 미미\n정기 관찰"
        )
        if values["result_row"][6] != expected_note:
            raise RuntimeError("field_survey sample_count 분기 불일치")
        return {
            "suspicious_count": expected_suspicious,
            "sample_count": expected_sample,
            "survey_datetime": values["survey_datetime"],
            "area_ha": values["area_ha"],
        }

    values = control_appendix_rows(payload)["values"]
    expected = {
        "planned": int(data.get("planned_count") or 0),
        "shred": int(data.get("planned_shred_count") or 0),
        "fumigate": int(data.get("planned_fumigation_count") or 0),
        "preventive": int(
            data.get("planned_preventive_injection_count") or 0
        ),
    }
    for key, expected_value in expected.items():
        if values[key] != expected_value:
            raise RuntimeError(
                f"control 실제값 우선순위 불일치: {key} "
                f"{values[key]} != {expected_value}"
            )
    return {**expected, "after_score": values["after_score"]}


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    rows = load_representative_rows()
    summary: dict[str, Any] = {}

    for report_type in ["prediction", "field_survey", "control"]:
        payload = draft_payload(rows[report_type])
        source_validation = validate_source_values(report_type, payload)
        pdf_bytes = render_report_pdf(report_type, payload)
        pdf_path = OUTPUT_ROOT / f"{report_type}.pdf"
        pdf_path.write_bytes(pdf_bytes)
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
        titles = APPENDIX_TITLES[report_type]
        appendix_count = len(titles)
        appendix_start = len(document) - appendix_count
        png_paths: list[str] = []
        text_checks: list[bool] = []

        for index, title in enumerate(titles, start=1):
            page = document[appendix_start + index - 1]
            page_text = page.get_text()
            text_checks.append(title in page_text)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
            png_path = OUTPUT_ROOT / (
                f"{report_type}_appendix_{index}.png"
            )
            pixmap.save(png_path)
            png_paths.append(str(png_path))

        if not all(text_checks):
            raise RuntimeError(
                f"{report_type} 별지 제목 텍스트 검증 실패: {text_checks}"
            )
        summary[report_type] = {
            "document_no": rows[report_type]["document_no"],
            "center_grid_id": rows[report_type]["center_grid_id"],
            "pdf_pages": len(document),
            "appendix_pages": appendix_count,
            "title_checks": text_checks,
            "source_validation": source_validation,
            "pdf_path": str(pdf_path),
            "png_paths": png_paths,
        }

    summary["total_appendix_pngs"] = sum(
        item["appendix_pages"]
        for item in summary.values()
        if isinstance(item, dict) and "appendix_pages" in item
    )
    summary_path = OUTPUT_ROOT / "render_summary.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
