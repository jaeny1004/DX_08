#!/usr/bin/env python3
"""Prediction DOCX 유지/ReportLab PDF 전환 결과를 기존 산출물과 비교한다."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

import fitz
from PIL import Image, ImageChops


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
LEGACY_ROOT = (
    PROJECT_ROOT
    / "data"
    / "precompute_logs"
    / "report_refactor_compare"
    / "1001377_2021"
)
OUTPUT_ROOT = (
    PROJECT_ROOT
    / "data"
    / "precompute_logs"
    / "prediction_reportlab_pdf_compare"
)
sys.path.insert(0, str(BACKEND_ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.services import prediction_report_generator as generator  # noqa: E402
from app.services.report_render.appendices import (  # noqa: E402
    APPENDIX_TITLES,
    prediction_appendix_rows,
)
from app.services.report_render.content import expected_lines  # noqa: E402
from app.services.report_render.fonts import for_pdf  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def zip_hashes(path: Path) -> dict[str, str]:
    with zipfile.ZipFile(path) as archive:
        return {
            name: hashlib.sha256(archive.read(name)).hexdigest()
            for name in sorted(archive.namelist())
            if name.endswith(".xml")
            or name.endswith(".rels")
            or name.startswith("word/media/")
        }


def pixel_diff(first: Path, second: Path) -> dict[str, Any]:
    left = Image.open(first).convert("RGBA")
    right = Image.open(second).convert("RGBA")
    if left.size != right.size:
        return {
            "equal": False,
            "first_size": list(left.size),
            "second_size": list(right.size),
            "changed_pixels": None,
        }
    difference = ImageChops.difference(left, right)
    pixels = (
        difference.get_flattened_data()
        if hasattr(difference, "get_flattened_data")
        else difference.getdata()
    )
    changed = sum(
        1
        for pixel in pixels
        if pixel != (0, 0, 0, 0)
    )
    return {
        "equal": changed == 0,
        "first_size": list(left.size),
        "second_size": list(right.size),
        "changed_pixels": changed,
        "total_pixels": left.width * left.height,
    }


def compact(value: str) -> str:
    return "".join(value.split())


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    legacy_docx = LEGACY_ROOT / "new.docx"
    legacy_map = LEGACY_ROOT / "new_overlay.png"
    legacy_comparison = json.loads(
        (LEGACY_ROOT / "comparison.json").read_text(encoding="utf-8")
    )
    if not legacy_docx.is_file() or not legacy_map.is_file():
        raise FileNotFoundError("기존 DOCX 또는 고정 overlay 기준 파일이 없습니다.")

    center_grid_id = int(legacy_comparison["grid_id"])
    year = int(legacy_comparison["year"])
    source = generator.load_report_source_data(center_grid_id, year)
    record = generator.ReportRecord(
        report_no=1,
        year=year,
        center_grid_id=center_grid_id,
        annual_count=int(source.stats["center_annual_count"]),
        cumulative_count=int(source.stats["center_cumulative_count"]),
        sido_name=str(source.static["sido_name"]),
        sigungu_name=str(source.static["sigungu_name"]),
    )
    legacy_metrics = legacy_comparison["metrics"]
    candidate_metrics = {
        "risk_score": legacy_metrics["risk_score"]["new"],
        "risk_grade": legacy_metrics["risk_grade"]["new"],
        "access_score_v3": legacy_metrics["access_score"]["new"],
    }
    metrics = generator.apply_candidate_metrics(
        generator.calculate_metrics(record, source),
        candidate_metrics,
    )
    payload = generator.build_prediction_render_payload(
        record=record,
        metrics=metrics,
        source=source,
        map_path=legacy_map,
    )

    original_loader = generator.load_report_source_data
    original_map_builder = generator.build_vworld_overlay_map
    map_calls = 0

    def fixed_loader(*_args, **_kwargs):
        return source

    def fixed_map_builder(*, output_path: Path, **_kwargs):
        nonlocal map_calls
        map_calls += 1
        shutil.copyfile(legacy_map, output_path)
        return output_path

    generator.load_report_source_data = fixed_loader
    generator.build_vworld_overlay_map = fixed_map_builder
    os.environ["VWORLD_API_KEY"] = "comparison-fixed-key"
    os.environ["VWORLD_API_DOMAIN"] = "comparison.invalid"
    try:
        result = generator.generate_single_prediction_report(
            center_grid_id=center_grid_id,
            year=year,
            output_root=OUTPUT_ROOT / "generated",
            report_no=1,
            candidate_metrics=candidate_metrics,
        )
    finally:
        generator.load_report_source_data = original_loader
        generator.build_vworld_overlay_map = original_map_builder

    new_docx = Path(result["docx_path"])
    new_pdf = Path(result["pdf_path"])
    new_map = Path(result["map_path"])
    new_payload = generator.build_prediction_render_payload(
        record=record,
        metrics=metrics,
        source=source,
        map_path=new_map,
    )
    legacy_zip = zip_hashes(legacy_docx)
    new_zip = zip_hashes(new_docx)
    changed_entries = sorted(
        name
        for name in set(legacy_zip) | set(new_zip)
        if legacy_zip.get(name) != new_zip.get(name)
    )

    old_appendices = generator.build_appendix_entries(record, metrics)
    new_appendices = prediction_appendix_rows(new_payload)

    document = fitz.open(new_pdf)
    pdf_text = "\n".join(page.get_text() for page in document)
    expected = expected_lines("prediction", new_payload)
    missing_body_lines = [
        value
        for value in expected
        if compact(for_pdf(value)) not in compact(pdf_text)
    ]
    appendix_titles = APPENDIX_TITLES["prediction"]
    appendix_title_checks = [
        title in document[len(document) - len(appendix_titles) + index].get_text()
        for index, title in enumerate(appendix_titles)
    ]

    extracted_map = OUTPUT_ROOT / "pdf_embedded_map.png"
    embedded_map_match = False
    embedded_candidates: list[dict[str, Any]] = []
    for page_index, page in enumerate(document):
        for image_info in page.get_images(full=True):
            xref = image_info[0]
            image_data = document.extract_image(xref)
            candidate_path = OUTPUT_ROOT / (
                f"pdf_image_p{page_index + 1}_{xref}."
                f"{image_data['ext']}"
            )
            candidate_path.write_bytes(image_data["image"])
            candidate = Image.open(candidate_path)
            entry = {
                "page": page_index + 1,
                "xref": xref,
                "size": list(candidate.size),
                "path": str(candidate_path),
            }
            if candidate.size == Image.open(new_map).size:
                candidate.convert("RGBA").save(extracted_map)
                comparison = pixel_diff(new_map, extracted_map)
                entry["source_map_comparison"] = comparison
                embedded_map_match = embedded_map_match or comparison["equal"]
            embedded_candidates.append(entry)

    result_contract = {
        key: {
            "present": bool(result.get(key)),
            "is_file": Path(result[key]).is_file(),
            "size": Path(result[key]).stat().st_size,
        }
        for key in ("docx_path", "pdf_path", "map_path")
    }
    metric_checks = {
        key: {
            "expected": legacy_metrics[key]["new"],
            "actual": metrics[key],
            "equal": legacy_metrics[key]["new"] == metrics[key],
        }
        for key in legacy_metrics
    }
    summary = {
        "input": {"grid_id": center_grid_id, "year": year},
        "map": {
            "generation_call_count": map_calls,
            "overlay_file_comparison": pixel_diff(legacy_map, new_map),
            "pdf_contains_pixel_equal_map": embedded_map_match,
            "pdf_images": embedded_candidates,
        },
        "metrics": metric_checks,
        "block_grid_ids_equal": (
            metrics["block_grid_ids"]
            == legacy_comparison.get(
                "block_grid_ids",
                metrics["block_grid_ids"],
            )
        ),
        "body": {
            "expected_line_count": len(expected),
            "missing_line_count": len(missing_body_lines),
            "missing_lines": missing_body_lines,
        },
        "appendices": {
            "data_cells_equal": old_appendices == new_appendices,
            "title_checks": appendix_title_checks,
            "page_count": len(appendix_titles),
        },
        "docx": {
            "legacy_sha256": sha256(legacy_docx),
            "new_sha256": sha256(new_docx),
            "whole_file_equal": sha256(legacy_docx) == sha256(new_docx),
            "xml_media_entry_count": len(new_zip),
            "changed_xml_media_entries": changed_entries,
            "xml_media_equal": not changed_entries,
        },
        "pdf": {
            "page_count": len(document),
            "path": str(new_pdf),
        },
        "return_contract": result_contract,
        "libreoffice_not_used": True,
    }
    summary["all_required_checks_passed"] = (
        map_calls == 1
        and summary["map"]["overlay_file_comparison"]["equal"]
        and embedded_map_match
        and all(item["equal"] for item in metric_checks.values())
        and summary["body"]["missing_line_count"] == 0
        and summary["appendices"]["data_cells_equal"]
        and all(appendix_title_checks)
        and summary["docx"]["xml_media_equal"]
        and all(item["is_file"] for item in result_contract.values())
    )
    output = OUTPUT_ROOT / "comparison.json"
    output.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    return 0 if summary["all_required_checks_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
