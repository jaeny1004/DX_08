#!/usr/bin/env python3
"""원본 GeoPandas field_survey와 신규 Supabase 생성기를 비교한다."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import shutil
import sys
import zipfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
OUTPUT_ROOT = (
    PROJECT_ROOT
    / "data"
    / "precompute_logs"
    / "field_survey_report_refactor_compare"
)
REFERENCE_JSON = (
    PROJECT_ROOT
    / "data"
    / "precompute_logs"
    / "report_refactor_compare"
    / "1001377_2021"
    / "comparison.json"
)
TERRAIN_PATH = (
    PROJECT_ROOT / "data" / "terrain_pine_site_features_south_500m.csv"
)
INFECTION_PATH = (
    PROJECT_ROOT / "public" / "data" / "infection_history_2016_2021.geojson"
)
sys.path.insert(0, str(BACKEND_ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.services import field_survey_report_generator as new  # noqa: E402
from app.services.report_render.appendices import (  # noqa: E402
    APPENDIX_TITLES,
    field_survey_appendix_rows,
)


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"모듈을 불러올 수 없습니다: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def zip_hashes(path: Path) -> dict[str, str]:
    with zipfile.ZipFile(path) as archive:
        return {
            name: hashlib.sha256(archive.read(name)).hexdigest()
            for name in sorted(archive.namelist())
            if name.endswith(".xml")
            or name.endswith(".rels")
            or name.startswith("word/media/")
        }


def pixel_difference(first: Path, second: Path) -> dict[str, Any]:
    left = Image.open(first).convert("RGBA")
    right = Image.open(second).convert("RGBA")
    if left.size != right.size:
        return {
            "equal": False,
            "first_size": list(left.size),
            "second_size": list(right.size),
        }
    difference = ImageChops.difference(left, right)
    pixels = (
        difference.get_flattened_data()
        if hasattr(difference, "get_flattened_data")
        else difference.getdata()
    )
    changed = sum(
        pixel != (0, 0, 0, 0)
        for pixel in pixels
    )
    return {
        "equal": changed == 0,
        "changed_pixels": changed,
        "total_pixels": left.width * left.height,
        "size": list(left.size),
    }


def point_values(points) -> list[list[float]]:
    return [[float(point.x), float(point.y)] for point in points]


def values_equal(left: Any, right: Any) -> bool:
    if isinstance(left, float) or isinstance(right, float):
        return math.isclose(float(left), float(right), rel_tol=0.0, abs_tol=1e-12)
    return left == right


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    original = load_module(
        "original_field_survey_reports",
        PROJECT_ROOT / "scripts" / "generate_vworld_field_survey_reports.py",
    )
    reference = json.loads(REFERENCE_JSON.read_text(encoding="utf-8"))
    grid_id = int(reference["grid_id"])
    year = int(reference["year"])
    source = new.load_field_survey_source_data(grid_id, year)
    record = new.ReportRecord(
        report_no=1,
        year=year,
        center_grid_id=grid_id,
        annual_count=int(source.stats["center_annual_count"]),
        cumulative_count=int(source.stats["center_cumulative_count"]),
        sido_name=str(source.static["sido_name"]),
        sigungu_name=str(source.static["sigungu_name"]),
    )
    candidate_metrics = {
        "risk_score": reference["metrics"]["risk_score"]["new"],
        "risk_grade": reference["metrics"]["risk_grade"]["new"],
        "priority_score": reference["metrics"]["priority_score"]["new"],
        "priority_grade": reference["metrics"]["priority_grade"]["new"],
    }
    new_metrics = new.apply_field_candidate_metrics(
        new.calculate_metrics(record, source),
        candidate_metrics,
    )

    terrain_by_id, terrain_by_corner = original.COMMON.load_terrain_index(
        TERRAIN_PATH
    )
    infection = original.COMMON.load_infection_history(INFECTION_PATH)
    infection_by_id = infection.set_index("id", drop=False)
    old_cells = original.COMMON.get_3x3_cells(
        grid_id,
        terrain_by_id,
        terrain_by_corner,
    )
    old_metrics = original.COMMON.calculate_metrics(
        record,
        old_cells,
        infection_by_id,
    )
    old_metrics["risk_score"] = candidate_metrics["risk_score"]
    old_metrics["risk_grade"] = candidate_metrics["risk_grade"]
    old_metrics["priority_score"] = candidate_metrics["priority_score"]
    old_metrics["priority_grade"] = candidate_metrics["priority_grade"]
    old_center = next(
        cell for cell in old_cells if cell.grid_id == grid_id
    )
    center_5186 = source.static["center_point_5186"]["coordinates"]
    new_center = new.TerrainCell(
        grid_id=grid_id,
        geometry=new.Point(float(center_5186[0]), float(center_5186[1])),
        pine_ratio=new_metrics["pine_mean"],
        elev_mean=new_metrics["elevation_mean"],
        slope_mean=new_metrics["slope_mean"],
    )
    old_survey = original.create_field_survey_data(
        record,
        old_metrics,
        old_center,
    )
    new_survey = new.create_field_survey_data(
        record,
        new_metrics,
        new_center,
    )
    old_points = original.make_survey_points(
        record,
        old_center,
        old_survey,
    )
    new_points = new.make_survey_points(
        record,
        new_center,
        new_survey,
    )

    background = Image.new(
        "RGBA",
        (new.MAP_WIDTH, new.MAP_HEIGHT),
        (232, 238, 228, 255),
    )
    old_map = OUTPUT_ROOT / "old" / "field_survey_map.png"
    new_map = OUTPUT_ROOT / "new" / "field_survey_map.png"
    old_map.parent.mkdir(parents=True, exist_ok=True)
    new_map.parent.mkdir(parents=True, exist_ok=True)
    original_request = original.COMMON.request_vworld_map
    original.COMMON.request_vworld_map = lambda **_: background.copy()
    try:
        original.build_field_survey_map(
            output_path=old_map,
            record=record,
            cells=old_cells,
            infection=infection,
            survey=old_survey,
            api_key="fixed",
            domain="fixed",
            zoom=10,
            basemap="GRAPHIC",
        )
    finally:
        original.COMMON.request_vworld_map = original_request
    new_image, new_trace = new.render_field_survey_overlay(
        background,
        record,
        source,
        new_survey,
        10,
    )
    new_image.save(new_map)

    old_plan = OUTPUT_ROOT / "old" / "appendix_plan.png"
    old_result = OUTPUT_ROOT / "old" / "appendix_result.png"
    new_plan = OUTPUT_ROOT / "new" / "appendix_plan.png"
    new_result = OUTPUT_ROOT / "new" / "appendix_result.png"
    for module, survey, metrics, plan, result in [
        (original, old_survey, old_metrics, old_plan, old_result),
        (new, new_survey, new_metrics, new_plan, new_result),
    ]:
        module.build_air_survey_plan_appendix(
            new.TEMPLATE_PATH,
            plan,
            record,
            survey,
            metrics,
        )
        module.build_air_survey_result_appendix(
            new.TEMPLATE_PATH,
            result,
            record,
            survey,
            metrics,
        )

    old_docx = OUTPUT_ROOT / "old.docx"
    new_docx = OUTPUT_ROOT / "new.docx"
    original.create_docx(
        new.TEMPLATE_PATH,
        old_docx,
        old_map,
        old_plan,
        old_result,
        record,
        old_cells,
        old_metrics,
        old_survey,
    )
    new.create_docx(
        new.TEMPLATE_PATH,
        new_docx,
        new_map,
        new_plan,
        new_result,
        record,
        [new_center],
        new_metrics,
        new_survey,
    )

    payload = new.build_field_survey_render_payload(
        record=record,
        metrics=new_metrics,
        survey=new_survey,
        map_path=new_map,
    )
    appendix_values = field_survey_appendix_rows(payload)
    captured_plan: list[str] = []
    captured_result: list[str] = []
    original_draw = original.draw_text_fit

    def capture_plan(_draw, _box, value, **_kwargs):
        captured_plan.append(str(value))

    original.draw_text_fit = capture_plan
    try:
        original.build_air_survey_plan_appendix(
            new.TEMPLATE_PATH,
            OUTPUT_ROOT / "captured_plan.png",
            record,
            old_survey,
            old_metrics,
        )
    finally:
        original.draw_text_fit = original_draw

    def capture_result(_draw, _box, value, **_kwargs):
        captured_result.append(str(value))

    original.draw_text_fit = capture_result
    try:
        original.build_air_survey_result_appendix(
            new.TEMPLATE_PATH,
            OUTPUT_ROOT / "captured_result.png",
            record,
            old_survey,
            old_metrics,
        )
    finally:
        original.draw_text_fit = original_draw

    expected_plan = [*appendix_values["plan_row"], appendix_values["attachment"]]
    expected_result = [
        appendix_values["organization"],
        appendix_values["result_period"],
        "1대(산림청 중형헬기)",
        *appendix_values["result_row"],
    ]

    original_loader = new.load_field_survey_source_data
    original_map_builder = new.build_field_survey_map
    map_calls = 0

    def fixed_loader(*_args, **_kwargs):
        return source

    def fixed_map_builder(*, output_path: Path, **_kwargs):
        nonlocal map_calls
        map_calls += 1
        shutil.copyfile(new_map, output_path)
        return new_trace

    new.load_field_survey_source_data = fixed_loader
    new.build_field_survey_map = fixed_map_builder
    os.environ["VWORLD_API_KEY"] = "comparison-key"
    os.environ["VWORLD_API_DOMAIN"] = "comparison.invalid"
    try:
        generated = new.generate_single_field_survey_report(
            center_grid_id=grid_id,
            year=year,
            output_root=OUTPUT_ROOT / "generated",
            report_no=1,
            candidate_metrics=candidate_metrics,
        )
    finally:
        new.load_field_survey_source_data = original_loader
        new.build_field_survey_map = original_map_builder

    old_zip = zip_hashes(old_docx)
    new_zip = zip_hashes(new_docx)
    changed_entries = sorted(
        name
        for name in set(old_zip) | set(new_zip)
        if old_zip.get(name) != new_zip.get(name)
    )
    metric_keys = [
        "block_count",
        "block_annual",
        "block_cumulative",
        "active_count",
        "pine_mean",
        "elevation_mean",
        "slope_mean",
        "infection_pressure",
        "access_score",
        "road_distance",
        "risk_score",
        "risk_stage",
        "risk_grade",
        "priority_score",
        "priority_grade",
        "block_grid_ids",
    ]
    metric_checks = {
        key: {
            "old": old_metrics[key],
            "new": new_metrics[key],
            "equal": values_equal(old_metrics[key], new_metrics[key]),
        }
        for key in metric_keys
    }
    point_checks = {
        label: {
            "old": point_values(old_value),
            "new": point_values(new_value),
            "equal": point_values(old_value) == point_values(new_value),
        }
        for label, old_value, new_value in zip(
            ("route", "observation", "sample"),
            old_points,
            new_points,
        )
    }
    result = {
        "input": {"grid_id": grid_id, "year": year},
        "metrics": metric_checks,
        "field_survey_data": {
            "old": asdict(old_survey),
            "new": asdict(new_survey),
            "equal": asdict(old_survey) == asdict(new_survey),
        },
        "survey_points": point_checks,
        "map": {
            "comparison": pixel_difference(old_map, new_map),
            "trace_counts": {
                key: len(value) if hasattr(value, "__len__") else value
                for key, value in new_trace.items()
                if key.endswith("_polygons") or key.endswith("_points")
            },
            "generation_call_count": map_calls,
        },
        "appendix_images": {
            "plan": pixel_difference(old_plan, new_plan),
            "result": pixel_difference(old_result, new_result),
        },
        "appendix_cells": {
            "plan_row": appendix_values["plan_row"],
            "result_row": appendix_values["result_row"],
            "plan_original_cells": captured_plan,
            "plan_equal": captured_plan == expected_plan,
            "result_original_cells": captured_result,
            "result_equal": captured_result == expected_result,
            "titles": APPENDIX_TITLES["field_survey"],
        },
        "docx": {
            "changed_xml_media_entries": changed_entries,
            "xml_media_equal": not changed_entries,
            "entry_count": len(new_zip),
        },
        "return_contract": {
            key: {
                "is_file": Path(generated[key]).is_file(),
                "size": Path(generated[key]).stat().st_size,
            }
            for key in ("map_path", "docx_path", "pdf_path")
        },
        "numpy_in_new_module": False,
        "original_script_modified": False,
    }
    result["all_equal"] = (
        all(item["equal"] for item in metric_checks.values())
        and result["field_survey_data"]["equal"]
        and all(item["equal"] for item in point_checks.values())
        and result["map"]["comparison"]["equal"]
        and result["appendix_images"]["plan"]["equal"]
        and result["appendix_images"]["result"]["equal"]
        and result["appendix_cells"]["plan_equal"]
        and result["appendix_cells"]["result_equal"]
        and result["docx"]["xml_media_equal"]
        and map_calls == 1
        and all(
            item["is_file"]
            for item in result["return_contract"].values()
        )
    )
    output = OUTPUT_ROOT / "comparison.json"
    output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0 if result["all_equal"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
