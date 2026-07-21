from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from pathlib import Path
from typing import Any

import geopandas as gpd
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]

TERRAIN_PATH = (
    PROJECT_ROOT
    / "data"
    / "terrain_pine_site_features_south_500m.csv"
)

CANDIDATE_PATH = (
    PROJECT_ROOT
    / "rag-backend"
    / "data"
    / "final_ui_candidate_v4.geojson"
)

INFECTION_PATH = (
    PROJECT_ROOT
    / "public"
    / "data"
    / "infection_history_2016_2021.geojson"
)

SIGUNGU_PATH = (
    PROJECT_ROOT
    / "public"
    / "data"
    / "sigungu_boundary.geojson"
)

TEMPLATE_PATH = (
    PROJECT_ROOT
    / "rag-backend"
    / "data"
    / "report_templates"
    / "[양식]소나무재선충병 발생 예측 보고서_빈양식.docx"
)

DEFAULT_OUTPUT_ROOT = (
    PROJECT_ROOT
    / "rag-backend"
    / "data"
    / "generated_drafts"
    / "prediction_template_test"
)

BATCH_SCRIPT_PATH = (
    PROJECT_ROOT
    / "scripts"
    / "generate_vworld_prediction_reports.py"
)


def _load_batch_module() -> Any:
    if not BATCH_SCRIPT_PATH.is_file():
        raise FileNotFoundError(
            f"기존 발생 예측 생성 스크립트를 찾을 수 없습니다: "
            f"{BATCH_SCRIPT_PATH}"
        )

    spec = importlib.util.spec_from_file_location(
        "generate_vworld_prediction_reports",
        BATCH_SCRIPT_PATH,
    )

    if spec is None or spec.loader is None:
        raise RuntimeError(
            "기존 발생 예측 생성 스크립트를 불러올 수 없습니다."
        )

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _validate_input_paths() -> None:
    paths = {
        "지형·소나무 피처": TERRAIN_PATH,
        "현재 신규 확산위험 후보": CANDIDATE_PATH,
        "감염 발생 이력": INFECTION_PATH,
        "시군구 경계": SIGUNGU_PATH,
        "발생 예측 빈양식": TEMPLATE_PATH,
        "기존 생성 스크립트": BATCH_SCRIPT_PATH,
    }

    missing = [
        f"{label}: {path}"
        for label, path in paths.items()
        if not path.is_file()
    ]

    if missing:
        raise FileNotFoundError(
            "필수 파일이 없습니다.\n" + "\n".join(missing)
        )


def _first_value(
    row: Any,
    keys: list[str],
    default: Any = None,
) -> Any:
    for key in keys:
        if key not in row.index:
            continue

        value = row.get(key)

        if value is None:
            continue

        try:
            if value != value:
                continue
        except Exception:
            pass

        if str(value).strip() == "":
            continue

        return value

    return default


def _to_float(
    value: Any,
    default: float | None = None,
) -> float | None:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _load_candidate_row(
    center_grid_id: int,
) -> tuple[Any, gpd.GeoDataFrame]:
    candidates = gpd.read_file(CANDIDATE_PATH)

    if candidates.crs is None:
        candidates = candidates.set_crs("EPSG:4326")

    id_column = next(
        (
            column
            for column in [
                "id",
                "grid_id",
                "center_grid_id",
            ]
            if column in candidates.columns
        ),
        None,
    )

    if id_column is None:
        raise ValueError(
            "현재 후보 GeoJSON에서 격자 ID 컬럼을 찾을 수 없습니다."
        )

    normalized_ids = (
        candidates[id_column]
        .astype(str)
        .str.replace(r"\.0$", "", regex=True)
        .str.strip()
    )

    matching = candidates[
        normalized_ids == str(int(center_grid_id))
    ].copy()

    if matching.empty:
        raise ValueError(
            f"현재 신규 확산위험 후보 파일에서 "
            f"격자 {center_grid_id}를 찾을 수 없습니다."
        )

    return matching.iloc[0], candidates


def _resolve_admin_names(
    candidate_row: Any,
    center_cell: Any,
) -> tuple[str, str]:
    sido_name = str(
        _first_value(
            candidate_row,
            [
                "sido_name",
                "ctpv_nm",
                "sido",
            ],
            "",
        )
        or ""
    ).strip()

    sigungu_name = str(
        _first_value(
            candidate_row,
            [
                "sigungu_name",
                "sgg_nm",
                "sigungu",
            ],
            "",
        )
        or ""
    ).strip()

    if (
        sido_name
        and sido_name != "미상"
        and sigungu_name
        and sigungu_name != "미상"
    ):
        return sido_name, sigungu_name

    sigungu = gpd.read_file(SIGUNGU_PATH)

    if sigungu.crs is None:
        sigungu = sigungu.set_crs("EPSG:4326")

    sigungu = sigungu.to_crs("EPSG:5186")

    point = gpd.GeoDataFrame(
        {"id": [center_cell.grid_id]},
        geometry=[center_cell.geometry.centroid],
        crs="EPSG:5186",
    )

    joined = gpd.sjoin(
        point,
        sigungu[
            [
                "sido_name",
                "sigungu_name",
                "geometry",
            ]
        ],
        how="left",
        predicate="within",
    )

    if not joined.empty:
        row = joined.iloc[0]

        sido_name = str(
            row.get("sido_name") or "미상"
        )
        sigungu_name = str(
            row.get("sigungu_name") or "미상"
        )

    return (
        sido_name or "미상",
        sigungu_name or "미상",
    )


def _apply_candidate_metrics(
    batch: Any,
    metrics: dict[str, Any],
    candidate_row: Any,
) -> dict[str, Any]:
    result = dict(metrics)

    risk_score = _to_float(
        _first_value(
            candidate_row,
            [
                "risk_score",
                "prediction_score",
                "pred_score",
                "ensemble_score",
                "risk_probability",
            ],
        )
    )

    if risk_score is not None:
        if 0.0 <= risk_score <= 1.0:
            risk_score *= 100.0

        risk_score = max(
            0.0,
            min(100.0, risk_score),
        )
        stage, calculated_grade = batch.risk_grade(
            risk_score
        )

        risk_grade = str(
            _first_value(
                candidate_row,
                [
                    "risk_grade",
                    "risk_label",
                    "risk_level",
                ],
                calculated_grade,
            )
        )

        result["risk_score"] = risk_score
        result["risk_stage"] = stage
        result["risk_grade"] = risk_grade

    priority_score = _to_float(
        _first_value(
            candidate_row,
            [
                "priority_score",
                "field_priority_score",
                "survey_priority_score",
            ],
        )
    )

    if priority_score is not None:
        if 0.0 <= priority_score <= 1.0:
            priority_score *= 100.0

        priority_score = max(
            0.0,
            min(100.0, priority_score),
        )

        priority_grade = str(
            _first_value(
                candidate_row,
                [
                    "priority_grade",
                    "priority_label",
                    "priority_stage_label",
                    "field_priority_label",
                ],
                batch.priority_grade(priority_score),
            )
        )

        result["priority_score"] = priority_score
        result["priority_grade"] = priority_grade

    infection_pressure = _to_float(
        _first_value(
            candidate_row,
            [
                "infection_pressure",
                "recent_infection_pressure",
                "infection_pressure_score",
            ],
        )
    )

    if infection_pressure is not None:
        if 0.0 <= infection_pressure <= 1.0:
            infection_pressure *= 100.0

        result["infection_pressure"] = max(
            0.0,
            min(100.0, infection_pressure),
        )

    access_score = _to_float(
        _first_value(
            candidate_row,
            [
                "access_score",
                "access_score_v3",
                "accessibility_score",
            ],
        )
    )

    if access_score is not None:
        if 0.0 <= access_score <= 1.0:
            access_score *= 100.0

        result["access_score"] = max(
            0.0,
            min(100.0, access_score),
        )

    road_distance = _to_float(
        _first_value(
            candidate_row,
            [
                "road_distance_m",
                "distance_to_road_m",
                "nearest_road_distance_m",
            ],
        )
    )

    if road_distance is not None:
        result["road_distance"] = max(
            0.0,
            road_distance,
        )

    return result


def generate_single_prediction_report(
    *,
    center_grid_id: int,
    year: int,
    output_root: Path | None = None,
    report_no: int = 1,
    zoom: int | None = None,
) -> dict[str, Any]:
    if year < 2016 or year > 2100:
        raise ValueError(
            "보고서 연도는 2016~2100 범위여야 합니다."
        )

    _validate_input_paths()

    load_dotenv(
        PROJECT_ROOT / "rag-backend" / ".env"
    )
    load_dotenv()

    api_key = os.getenv(
        "VWORLD_API_KEY",
        "",
    ).strip()
    domain = os.getenv(
        "VWORLD_API_DOMAIN",
        "",
    ).strip()
    basemap = (
        os.getenv(
            "VWORLD_BASEMAP",
            "GRAPHIC",
        ).strip()
        or "GRAPHIC"
    )

    if not api_key:
        raise RuntimeError(
            "rag-backend/.env에 VWORLD_API_KEY가 없습니다."
        )

    if not domain:
        raise RuntimeError(
            "rag-backend/.env에 VWORLD_API_DOMAIN이 없습니다."
        )

    batch = _load_batch_module()

    selected_zoom = (
        zoom
        or int(
            os.getenv(
                "VWORLD_ZOOM",
                str(batch.DEFAULT_ZOOM),
            )
        )
    )

    batch.validate_prediction_template(
        TEMPLATE_PATH
    )

    terrain_by_id, terrain_by_corner = (
        batch.load_terrain_index(TERRAIN_PATH)
    )

    center_grid_id = int(center_grid_id)

    if center_grid_id not in terrain_by_id:
        raise ValueError(
            f"지형·소나무 격자 파일에서 "
            f"격자 {center_grid_id}를 찾을 수 없습니다."
        )

    center_cell = terrain_by_id[center_grid_id]
    candidate_row, _ = _load_candidate_row(
        center_grid_id
    )

    infection = batch.load_infection_history(
        INFECTION_PATH
    )

    infection_by_id = infection.set_index(
        "id",
        drop=False,
    )

    cells = batch.get_3x3_cells(
        center_grid_id,
        terrain_by_id,
        terrain_by_corner,
    )

    sido_name, sigungu_name = (
        _resolve_admin_names(
            candidate_row,
            center_cell,
        )
    )

    center_history = (
        infection_by_id.loc[center_grid_id]
        if center_grid_id
        in infection_by_id.index
        else None
    )

    if center_history is not None:
        if isinstance(
            center_history,
            gpd.GeoDataFrame,
        ):
            center_history = center_history.iloc[0]

        annual_count = int(
            center_history.get(
                f"infection_count_{year}",
                0,
            )
            or 0
        )
        cumulative_count = int(
            center_history.get(
                "infection_count_2016_2021",
                0,
            )
            or 0
        )
    else:
        annual_count = 0
        cumulative_count = 0

    record = batch.ReportRecord(
        report_no=int(report_no),
        year=int(year),
        center_grid_id=center_grid_id,
        annual_count=annual_count,
        cumulative_count=cumulative_count,
        sido_name=sido_name,
        sigungu_name=sigungu_name,
    )

    metrics = batch.calculate_metrics(
        record,
        cells,
        infection_by_id,
    )

    metrics = _apply_candidate_metrics(
        batch,
        metrics,
        candidate_row,
    )

    root = (
        output_root.resolve()
        if output_root is not None
        else DEFAULT_OUTPUT_ROOT.resolve()
    )

    docx_directory = root / "docx"
    pdf_directory = root / "pdf"
    map_directory = root / "maps"
    appendix_directory = root / "appendices"

    for directory in (
        root,
        docx_directory,
        pdf_directory,
        map_directory,
        appendix_directory,
    ):
        directory.mkdir(
            parents=True,
            exist_ok=True,
        )

    base_name = batch.sanitize_filename(
        f"{record.report_no:02d}_"
        f"{record.year}_"
        f"소나무재선충병_신규확산위험분석보고서_"
        f"{record.sido_name}_"
        f"{record.sigungu_name}_"
        f"격자{record.center_grid_id}"
    )

    map_path = (
        map_directory / f"{base_name}.png"
    )
    docx_path = (
        docx_directory / f"{base_name}.docx"
    )

    batch.build_vworld_overlay_map(
        output_path=map_path,
        record=record,
        cells=cells,
        infection=infection,
        api_key=api_key,
        domain=domain,
        zoom=selected_zoom,
        basemap=basemap,
    )

    batch.create_docx(
        template_path=TEMPLATE_PATH,
        output_path=docx_path,
        map_path=map_path,
        appendix_dir=appendix_directory,
        record=record,
        cells=cells,
        metrics=metrics,
    )

    pdf_path = batch.convert_docx_to_pdf(
        docx_path,
        pdf_directory,
    )

    if not docx_path.is_file():
        raise RuntimeError(
            f"DOCX 생성 결과를 찾을 수 없습니다: "
            f"{docx_path}"
        )

    if not pdf_path.is_file():
        raise RuntimeError(
            f"PDF 생성 결과를 찾을 수 없습니다: "
            f"{pdf_path}"
        )

    return {
        "center_grid_id": record.center_grid_id,
        "year": record.year,
        "sido_name": record.sido_name,
        "sigungu_name": record.sigungu_name,
        "annual_count": record.annual_count,
        "cumulative_count": (
            record.cumulative_count
        ),
        "risk_score": round(
            float(metrics["risk_score"]),
            2,
        ),
        "risk_grade": metrics["risk_grade"],
        "priority_score": round(
            float(metrics["priority_score"]),
            2,
        ),
        "priority_grade": (
            metrics["priority_grade"]
        ),
        "block_grid_ids": (
            metrics["block_grid_ids"]
        ),
        "map_path": str(map_path),
        "docx_path": str(docx_path),
        "pdf_path": str(pdf_path),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "현재 신규 확산위험 후보 격자 1개를 "
            "기존 발생 예측 행정양식 DOCX·PDF로 생성합니다."
        )
    )

    parser.add_argument(
        "--center-grid-id",
        type=int,
        required=True,
    )

    parser.add_argument(
        "--year",
        type=int,
        required=True,
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
    )

    parser.add_argument(
        "--report-no",
        type=int,
        default=1,
    )

    parser.add_argument(
        "--zoom",
        type=int,
        default=None,
    )

    return parser


def main() -> int:
    args = build_parser().parse_args()

    result = generate_single_prediction_report(
        center_grid_id=args.center_grid_id,
        year=args.year,
        output_root=args.output,
        report_no=args.report_no,
        zoom=args.zoom,
    )

    print(
        "\n===== 단일 신규 확산위험 보고서 생성 완료 ====="
    )

    for key, value in result.items():
        print(f"{key}: {value}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print(
            "사용자에 의해 중단되었습니다.",
            file=sys.stderr,
        )
        raise SystemExit(130)
    except Exception as exc:
        print(
            f"오류: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        raise SystemExit(1)
