from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]

TERRAIN_PATH = (
    PROJECT_ROOT
    / "data"
    / "terrain_pine_site_features_south_500m.csv"
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

    api_key = os.getenv("VWORLD_API_KEY", "").strip()
    domain = os.getenv("VWORLD_API_DOMAIN", "").strip()
    basemap = (
        os.getenv("VWORLD_BASEMAP", "GRAPHIC").strip()
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

    batch.validate_prediction_template(TEMPLATE_PATH)

    terrain_by_id, terrain_by_corner = (
        batch.load_terrain_index(TERRAIN_PATH)
    )

    infection = batch.load_infection_history(
        INFECTION_PATH
    )

    infection = batch.attach_admin_names(
        infection,
        SIGUNGU_PATH,
    )

    matching = infection[
        infection["id"].astype(int)
        == int(center_grid_id)
    ].copy()

    if matching.empty:
        raise ValueError(
            f"감염 발생 이력 파일에서 격자 "
            f"{center_grid_id}를 찾을 수 없습니다."
        )

    row = matching.iloc[0]
    annual_column = f"infection_count_{year}"

    annual_count = int(
        row.get(annual_column, 0) or 0
    )

    cumulative_count = int(
        row.get(
            "infection_count_2016_2021",
            0,
        )
        or 0
    )

    record = batch.ReportRecord(
        report_no=int(report_no),
        year=int(year),
        center_grid_id=int(center_grid_id),
        annual_count=annual_count,
        cumulative_count=cumulative_count,
        sido_name=str(
            row.get("sido_name") or "미상"
        ),
        sigungu_name=str(
            row.get("sigungu_name") or "미상"
        ),
    )

    cells = batch.get_3x3_cells(
        record.center_grid_id,
        terrain_by_id,
        terrain_by_corner,
    )

    infection_by_id = infection.set_index(
        "id",
        drop=False,
    )

    metrics = batch.calculate_metrics(
        record,
        cells,
        infection_by_id,
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
        f"소나무재선충병_발생예측보고서_"
        f"{record.sido_name}_"
        f"{record.sigungu_name}_"
        f"격자{record.center_grid_id}"
    )

    map_path = (
        map_directory
        / f"{base_name}.png"
    )

    docx_path = (
        docx_directory
        / f"{base_name}.docx"
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
        "cumulative_count": record.cumulative_count,
        "risk_score": round(
            float(metrics["risk_score"]),
            1,
        ),
        "risk_grade": metrics["risk_grade"],
        "priority_score": round(
            float(metrics["priority_score"]),
            1,
        ),
        "priority_grade": metrics["priority_grade"],
        "block_grid_ids": metrics["block_grid_ids"],
        "map_path": str(map_path),
        "docx_path": str(docx_path),
        "pdf_path": str(pdf_path),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "기존 발생 예측 빈양식을 이용해 "
            "중심 격자 1개의 DOCX·PDF를 생성합니다."
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
        "\n===== 단일 발생 예측 보고서 생성 완료 ====="
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
