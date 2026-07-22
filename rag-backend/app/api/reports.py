from __future__ import annotations

import csv
import re
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse

from app.services.report_excel_service import (
    build_linked_reports_workbook,
    build_single_report_workbook,
)


router = APIRouter(prefix="/api/reports", tags=["보고서"])


BACKEND_ROOT = Path(__file__).resolve().parents[2]
GENERATED_REPORTS_ROOT = BACKEND_ROOT / "data" / "generated_reports"


REPORT_CONFIG: dict[str, dict[str, str]] = {
    "prediction": {
        "label": "발생 예측",
        "directory": "prediction_30",
    },
    "field_survey": {
        "label": "현장 예찰",
        "directory": "field_survey_30",
    },
    "control": {
        "label": "방제",
        "directory": "control_30",
    },
}


MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),
    "xlsx": (
        "application/vnd.openxmlformats-officedocument."
        "spreadsheetml.sheet"
    ),
    "zip": "application/zip",
}


def _require_report_type(report_type: str) -> dict[str, str]:
    config = REPORT_CONFIG.get(report_type)
    if config is None:
        raise HTTPException(
            status_code=404,
            detail=f"지원하지 않는 보고서 유형입니다: {report_type}",
        )
    return config


def _report_directory(report_type: str) -> Path:
    config = _require_report_type(report_type)
    directory = GENERATED_REPORTS_ROOT / config["directory"]

    if not directory.exists():
        raise HTTPException(
            status_code=500,
            detail=f"보고서 폴더를 찾을 수 없습니다: {directory}",
        )

    return directory


def _csv_path(report_type: str) -> Path:
    path = _report_directory(report_type) / "문서목록.csv"

    if not path.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"문서목록.csv를 찾을 수 없습니다: {path}",
        )

    return path


def _read_rows(report_type: str) -> list[dict[str, str]]:
    path = _csv_path(report_type)

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        return [
            {
                str(key).strip(): (value or "").strip()
                for key, value in row.items()
                if key is not None
            }
            for row in reader
        ]


def _normalize_risk_grade(value: str | None) -> str:
    text = (value or "").strip()
    replacements = {
        "매우높음": "매우 높음",
        "매우낮음": "매우 낮음",
    }
    return replacements.get(text, text)


def _to_number(value: str | None) -> int | float | str | None:
    text = (value or "").strip()
    if text == "":
        return None

    try:
        if re.fullmatch(r"-?\d+", text):
            return int(text)
        if re.fullmatch(r"-?\d+\.\d+", text):
            return float(text)
    except ValueError:
        return text

    return text


def _safe_file_name(file_name: str) -> str:
    name = Path(file_name).name
    if name != file_name or name in {"", ".", ".."}:
        raise HTTPException(status_code=400, detail="잘못된 파일명입니다.")
    return name


def _file_paths(
    report_type: str,
    row: dict[str, str],
) -> dict[str, Path]:
    directory = _report_directory(report_type)
    pdf_name = _safe_file_name(row.get("file_name", ""))
    docx_name = Path(pdf_name).with_suffix(".docx").name

    return {
        "pdf": directory / "pdf" / pdf_name,
        "docx": directory / "docx" / docx_name,
    }


def _public_row(
    report_type: str,
    row: dict[str, str],
) -> dict[str, Any]:
    paths = _file_paths(report_type, row)

    numeric_fields = {
        "center_annual_count",
        "center_cumulative_count",
        "block_annual_count",
        "block_cumulative_count",
        "risk_score",
        "priority_score",
        "total_trees",
        "suspicious_count",
        "sample_count",
        "field_suspicious_count",
        "planned_count",
        "planned_shred_count",
        "planned_fumigation_count",
        "planned_preventive_injection_count",
        "planned_area_ha",
    }

    result: dict[str, Any] = dict(row)

    for field in numeric_fields:
        if field in result:
            result[field] = _to_number(result.get(field))

    result["risk_grade"] = _normalize_risk_grade(
        str(result.get("risk_grade", ""))
    )
    result["report_type"] = report_type
    result["report_type_label"] = REPORT_CONFIG[report_type]["label"]
    result["available_formats"] = [
        fmt
        for fmt, path in paths.items()
        if path.is_file()
    ] + ["xlsx"]

    return result


def _find_row(
    report_type: str,
    document_no: str,
) -> dict[str, str]:
    normalized = document_no.strip()

    for row in _read_rows(report_type):
        if row.get("document_no", "").strip() == normalized:
            return row

    raise HTTPException(
        status_code=404,
        detail=(
            f"{REPORT_CONFIG[report_type]['label']} 보고서에서 "
            f"문서번호 {document_no}를 찾을 수 없습니다."
        ),
    )


def _matches_filters(
    row: dict[str, str],
    *,
    year: str | None = None,
    sido_name: str | None = None,
    sigungu_name: str | None = None,
    center_grid_id: str | None = None,
    document_no: str | None = None,
) -> bool:
    filters = {
        "year": year,
        "sido_name": sido_name,
        "sigungu_name": sigungu_name,
        "center_grid_id": center_grid_id,
        "document_no": document_no,
    }

    for key, expected in filters.items():
        if expected is None or expected.strip() == "":
            continue
        if row.get(key, "").strip() != expected.strip():
            return False

    return True


def _content_disposition(disposition: str, filename: str) -> str:
    safe_ascii = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    encoded = quote(filename)
    return (
        f'{disposition}; filename="{safe_ascii}"; '
        f"filename*=UTF-8''{encoded}"
    )


def _linked_identity(rows: list[dict[str, str]]) -> dict[str, str]:
    if not rows:
        return {
            "document_no": "",
            "year": "",
            "center_grid_id": "",
            "sido_name": "",
            "sigungu_name": "",
        }

    row = rows[0]
    return {
        "document_no": row.get("document_no", ""),
        "year": row.get("year", ""),
        "center_grid_id": row.get("center_grid_id", ""),
        "sido_name": row.get("sido_name", ""),
        "sigungu_name": row.get("sigungu_name", ""),
    }


def _same_identity(rows: list[dict[str, str]]) -> bool:
    if len(rows) != 3:
        return False

    identity_fields = (
        "document_no",
        "year",
        "center_grid_id",
        "sido_name",
        "sigungu_name",
    )

    return all(
        len({row.get(field, "").strip() for row in rows}) == 1
        for field in identity_fields
    )


def _linked_status_for_document(document_no: str) -> dict[str, Any]:
    found: dict[str, dict[str, str] | None] = {}

    for report_type in REPORT_CONFIG:
        try:
            found[report_type] = _find_row(report_type, document_no)
        except HTTPException as exc:
            if exc.status_code == 404:
                found[report_type] = None
            else:
                raise

    existing_rows = [
        row
        for row in found.values()
        if row is not None
    ]

    identity = _linked_identity(existing_rows)

    prediction_exists = found["prediction"] is not None
    field_survey_exists = found["field_survey"] is not None
    control_exists = found["control"] is not None

    identity_matched = (
        _same_identity(existing_rows)
        if len(existing_rows) == 3
        else False
    )

    field_link_matched = (
        found["field_survey"] is not None
        and found["field_survey"].get(
            "prediction_link_status",
            "",
        ).upper() == "MATCHED"
    )

    control_link_matched = (
        found["control"] is not None
        and found["control"].get(
            "link_status",
            "",
        ).upper() == "MATCHED"
    )

    fully_linked = bool(
        prediction_exists
        and field_survey_exists
        and control_exists
        and identity_matched
        and field_link_matched
        and control_link_matched
    )

    reports: dict[str, Any] = {}
    for report_type, row in found.items():
        reports[report_type] = {
            "exists": row is not None,
            "matched": (
                True
                if report_type == "prediction" and row is not None
                else field_link_matched
                if report_type == "field_survey"
                else control_link_matched
                if report_type == "control"
                else False
            ),
            "item": (
                _public_row(report_type, row)
                if row is not None
                else None
            ),
        }

    return {
        **identity,
        "fully_linked": fully_linked,
        "identity_matched": identity_matched,
        "reports": reports,
    }


def _linked_status_rows(
    document_numbers: list[str],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []

    for document_no in document_numbers:
        status = _linked_status_for_document(document_no)
        output.append({
            "document_no": status.get("document_no", document_no),
            "year": status.get("year", ""),
            "center_grid_id": status.get("center_grid_id", ""),
            "sido_name": status.get("sido_name", ""),
            "sigungu_name": status.get("sigungu_name", ""),
            "prediction_exists": status["reports"]["prediction"]["exists"],
            "field_survey_exists": (
                status["reports"]["field_survey"]["exists"]
            ),
            "control_exists": status["reports"]["control"]["exists"],
            "fully_linked": status["fully_linked"],
        })

    return output


@router.get("/options")
def get_report_options(
    report_type: str = Query(default="prediction"),
    year: str | None = Query(default=None),
    sido_name: str | None = Query(default=None),
) -> dict[str, Any]:
    _require_report_type(report_type)
    rows = _read_rows(report_type)

    years = sorted({
        row.get("year", "")
        for row in rows
        if row.get("year", "")
    })

    rows_for_sido = [
        row
        for row in rows
        if year is None or row.get("year", "") == year
    ]
    sidos = sorted({
        row.get("sido_name", "")
        for row in rows_for_sido
        if row.get("sido_name", "")
    })

    rows_for_sigungu = [
        row
        for row in rows_for_sido
        if sido_name is None
        or row.get("sido_name", "") == sido_name
    ]
    sigungus = sorted({
        row.get("sigungu_name", "")
        for row in rows_for_sigungu
        if row.get("sigungu_name", "")
    })

    return {
        "report_types": [
            {
                "value": key,
                "label": config["label"],
            }
            for key, config in REPORT_CONFIG.items()
        ],
        "years": years,
        "sidos": sidos,
        "sigungus": sigungus,
    }


@router.get("")
def list_reports(
    report_type: str = Query(default="prediction"),
    year: str | None = Query(default=None),
    sido_name: str | None = Query(default=None),
    sigungu_name: str | None = Query(default=None),
    center_grid_id: str | None = Query(default=None),
    document_no: str | None = Query(default=None),
) -> dict[str, Any]:
    _require_report_type(report_type)

    rows = [
        row
        for row in _read_rows(report_type)
        if _matches_filters(
            row,
            year=year,
            sido_name=sido_name,
            sigungu_name=sigungu_name,
            center_grid_id=center_grid_id,
            document_no=document_no,
        )
    ]

    items = [_public_row(report_type, row) for row in rows]

    return {
        "report_type": report_type,
        "report_type_label": REPORT_CONFIG[report_type]["label"],
        "total": len(items),
        "items": items,
    }


@router.get("/export/linked.xlsx")
def export_linked_reports(
    year: str | None = Query(default=None),
    sido_name: str | None = Query(default=None),
    sigungu_name: str | None = Query(default=None),
) -> Response:
    filtered: dict[str, list[dict[str, str]]] = {}

    for report_type in REPORT_CONFIG:
        filtered[report_type] = [
            row
            for row in _read_rows(report_type)
            if _matches_filters(
                row,
                year=year,
                sido_name=sido_name,
                sigungu_name=sigungu_name,
            )
        ]

    document_numbers = sorted(
        {
            row.get("document_no", "")
            for rows in filtered.values()
            for row in rows
            if row.get("document_no", "")
        },
        key=lambda value: int(value) if value.isdigit() else value,
    )

    workbook = build_linked_reports_workbook(
        prediction_rows=[
            _public_row("prediction", row)
            for row in filtered["prediction"]
        ],
        field_survey_rows=[
            _public_row("field_survey", row)
            for row in filtered["field_survey"]
        ],
        control_rows=[
            _public_row("control", row)
            for row in filtered["control"]
        ],
        linked_rows=_linked_status_rows(document_numbers),
    )

    filename = "소나무재선충병_예측_현장예찰_방제_통합.xlsx"

    return Response(
        content=workbook,
        media_type=MIME_TYPES["xlsx"],
        headers={
            "Content-Disposition": _content_disposition(
                "attachment",
                filename,
            )
        },
    )


@router.get("/linked/{document_no}")
def get_linked_report_status(document_no: str) -> dict[str, Any]:
    status = _linked_status_for_document(document_no)

    if not any(
        report["exists"]
        for report in status["reports"].values()
    ):
        raise HTTPException(
            status_code=404,
            detail=f"문서번호 {document_no}에 해당하는 보고서가 없습니다.",
        )

    return status


@router.get("/linked/{document_no}/download")
def download_linked_report_zip(document_no: str) -> StreamingResponse:
    status = _linked_status_for_document(document_no)

    if not status["fully_linked"]:
        raise HTTPException(
            status_code=409,
            detail=(
                "예측·현장예찰·방제 보고서 3종이 모두 정상 연결된 "
                "문서만 ZIP으로 내려받을 수 있습니다."
            ),
        )

    zip_buffer = BytesIO()
    rows_by_type: dict[str, dict[str, str]] = {}

    with zipfile.ZipFile(
        zip_buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        for report_type in REPORT_CONFIG:
            row = _find_row(report_type, document_no)
            rows_by_type[report_type] = row
            paths = _file_paths(report_type, row)
            label = REPORT_CONFIG[report_type]["label"].replace(" ", "_")

            for fmt in ("pdf", "docx"):
                path = paths[fmt]
                if path.is_file():
                    archive.write(
                        path,
                        arcname=f"{label}/{path.name}",
                    )

        linked_workbook = build_linked_reports_workbook(
            prediction_rows=[
                _public_row("prediction", rows_by_type["prediction"])
            ],
            field_survey_rows=[
                _public_row(
                    "field_survey",
                    rows_by_type["field_survey"],
                )
            ],
            control_rows=[
                _public_row("control", rows_by_type["control"])
            ],
            linked_rows=_linked_status_rows([document_no]),
        )

        archive.writestr(
            f"3종_연계현황_{document_no}.xlsx",
            linked_workbook,
        )

    zip_buffer.seek(0)
    filename = f"연결보고서_3종_문서번호_{document_no}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type=MIME_TYPES["zip"],
        headers={
            "Content-Disposition": _content_disposition(
                "attachment",
                filename,
            )
        },
    )


@router.get("/{report_type}/{document_no}/preview")
def preview_report(
    report_type: str,
    document_no: str,
) -> FileResponse:
    row = _find_row(report_type, document_no)
    pdf_path = _file_paths(report_type, row)["pdf"]

    if not pdf_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"PDF 파일을 찾을 수 없습니다: {pdf_path.name}",
        )

    return FileResponse(
        path=pdf_path,
        media_type=MIME_TYPES["pdf"],
        headers={
            "Content-Disposition": _content_disposition(
                "inline",
                pdf_path.name,
            )
        },
    )


@router.get("/{report_type}/{document_no}/download")
def download_report(
    report_type: str,
    document_no: str,
    format: str = Query(default="pdf"),
) -> Response:
    row = _find_row(report_type, document_no)
    fmt = format.lower().strip()

    if fmt not in {"pdf", "docx", "xlsx"}:
        raise HTTPException(
            status_code=400,
            detail="format은 pdf, docx, xlsx 중 하나여야 합니다.",
        )

    if fmt == "xlsx":
        workbook = build_single_report_workbook(
            report_type=report_type,
            row=_public_row(report_type, row),
        )
        filename = (
            f"{Path(row['file_name']).stem}.xlsx"
        )

        return Response(
            content=workbook,
            media_type=MIME_TYPES["xlsx"],
            headers={
                "Content-Disposition": _content_disposition(
                    "attachment",
                    filename,
                )
            },
        )

    path = _file_paths(report_type, row)[fmt]

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"{fmt.upper()} 파일을 찾을 수 없습니다: {path.name}",
        )

    return FileResponse(
        path=path,
        media_type=MIME_TYPES[fmt],
        headers={
            "Content-Disposition": _content_disposition(
                "attachment",
                path.name,
            )
        },
    )
