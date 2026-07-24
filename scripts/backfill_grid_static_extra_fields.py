#!/usr/bin/env python3
r"""기존 prediction_grid_static 행에 보고서용 지형·geometry 값을 백필한다.

로컬 precompute-venv312 전용 스크립트다. 기존 공간조인이나 14km 계산은
다시 수행하지 않고, 저장된 block_grid_ids와 terrain CSV만 사용한다.

Windows PowerShell:
    .\precompute-venv312\Scripts\python.exe `
      scripts\backfill_grid_static_extra_fields.py --apply
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from pyproj import Transformer
from psycopg2.extras import execute_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
TERRAIN_PATH = (
    PROJECT_ROOT / "data" / "terrain_pine_site_features_south_500m.csv"
)
LOG_DIRECTORY = PROJECT_ROOT / "data" / "precompute_logs"

EXPECTED_CENTER_ROWS = 37_548
GRID_SIZE_M = 500.0
DEFAULT_BATCH_SIZE = 500
DEFAULT_PROGRESS_EVERY = 5_000

WKT_FIRST_CORNER_RE = re.compile(
    r"POLYGON\s*\(\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)"
)


def log(message: str) -> None:
    print(message, flush=True)


def create_database_engine() -> Engine:
    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env")
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        raise RuntimeError("rag-backend/.env에 DATABASE_URL이 필요합니다.")

    return create_engine(database_url, pool_pre_ping=True)


def load_static_blocks(engine: Engine) -> list[tuple[int, list[int]]]:
    query = text(
        """
        select grid_id, block_grid_ids
        from prediction_grid_static
        order by grid_id
        """
    )

    with engine.connect() as connection:
        rows = connection.execute(query).all()

    result = [
        (int(row.grid_id), [int(value) for value in row.block_grid_ids])
        for row in rows
    ]

    if len(result) != EXPECTED_CENTER_ROWS:
        raise RuntimeError(
            "prediction_grid_static 행 수가 예상과 다릅니다: "
            f"{len(result):,} != {EXPECTED_CENTER_ROWS:,}"
        )

    if any(not block_ids for _, block_ids in result):
        raise RuntimeError("빈 block_grid_ids를 가진 행이 있습니다.")

    return result


def load_required_terrain(
    required_ids: set[int],
) -> dict[int, dict[str, Any]]:
    required_columns = [
        "id",
        "WKT",
        "pine_ratio",
        "elev_mean",
        "slope_mean",
    ]
    terrain = pd.read_csv(
        TERRAIN_PATH,
        usecols=required_columns,
        low_memory=False,
    )
    terrain["id"] = terrain["id"].astype("int64")
    terrain = terrain[terrain["id"].isin(required_ids)].copy()

    if terrain["id"].duplicated().any():
        duplicates = (
            terrain.loc[terrain["id"].duplicated(), "id"]
            .astype(int)
            .head(20)
            .tolist()
        )
        raise RuntimeError(f"terrain CSV 격자 ID 중복: {duplicates}")

    result: dict[int, dict[str, Any]] = {}

    for row in terrain.itertuples(index=False):
        match = WKT_FIRST_CORNER_RE.search(str(row.WKT))

        if not match:
            raise ValueError(
                f"격자 {int(row.id)}의 WKT 첫 좌표를 읽을 수 없습니다."
            )

        result[int(row.id)] = {
            "minx": float(match.group(1)),
            "maxy": float(match.group(2)),
            # 기존 보고서 계산과 동일하게 결측 지형값은 0으로 처리한다.
            "pine_ratio": (
                0.0 if pd.isna(row.pine_ratio) else float(row.pine_ratio)
            ),
            "elev_mean": (
                0.0 if pd.isna(row.elev_mean) else float(row.elev_mean)
            ),
            "slope_mean": (
                0.0 if pd.isna(row.slope_mean) else float(row.slope_mean)
            ),
        }

    return result


def build_geometry_cache(
    terrain_by_id: dict[int, dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    transformer = Transformer.from_crs(
        "EPSG:5186",
        "EPSG:4326",
        always_xy=True,
    )
    result: dict[int, dict[str, Any]] = {}

    for grid_id, terrain in terrain_by_id.items():
        minx = float(terrain["minx"])
        maxy = float(terrain["maxy"])
        ring_5186 = [
            (minx, maxy),
            (minx + GRID_SIZE_M, maxy),
            (minx + GRID_SIZE_M, maxy - GRID_SIZE_M),
            (minx, maxy - GRID_SIZE_M),
            (minx, maxy),
        ]
        ring_4326 = [
            [float(lon), float(lat)]
            for lon, lat in (
                transformer.transform(x, y) for x, y in ring_5186
            )
        ]
        result[grid_id] = {
            "type": "Polygon",
            "coordinates": [ring_4326],
        }

    return result


def build_update_row(
    grid_id: int,
    block_ids: Sequence[int],
    terrain_by_id: dict[int, dict[str, Any]],
    geometry_by_id: dict[int, dict[str, Any]],
) -> tuple[int, str, float, float, float]:
    count = len(block_ids)
    geometries = [geometry_by_id[value] for value in block_ids]
    pine_mean = math.fsum(
        float(terrain_by_id[value]["pine_ratio"]) for value in block_ids
    ) / count
    elevation_mean = math.fsum(
        float(terrain_by_id[value]["elev_mean"]) for value in block_ids
    ) / count
    slope_mean = math.fsum(
        float(terrain_by_id[value]["slope_mean"]) for value in block_ids
    ) / count

    return (
        grid_id,
        json.dumps(
            geometries,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        pine_mean,
        elevation_mean,
        slope_mean,
    )


UPDATE_SQL = """
update prediction_grid_static as target
set
  block_cell_geometries_4326 = source.geometries::jsonb,
  block_pine_mean = source.pine_mean,
  block_elevation_mean = source.elevation_mean,
  block_slope_mean = source.slope_mean,
  updated_at = now()
from (values %s) as source(
  grid_id,
  geometries,
  pine_mean,
  elevation_mean,
  slope_mean
)
where target.grid_id = source.grid_id
"""


def update_batch(engine: Engine, rows: Sequence[tuple[Any, ...]]) -> None:
    raw_connection = engine.raw_connection()

    try:
        with raw_connection.cursor() as cursor:
            execute_values(
                cursor,
                UPDATE_SQL,
                list(rows),
                template="(%s,%s,%s,%s,%s)",
                page_size=len(rows),
            )

            if cursor.rowcount != len(rows):
                raise RuntimeError(
                    "백필 UPDATE 대상 행 수 불일치: "
                    f"{cursor.rowcount:,} != {len(rows):,}"
                )

        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def update_resilient(
    engine: Engine,
    rows: Sequence[tuple[Any, ...]],
    failures: list[dict[str, Any]],
) -> None:
    try:
        update_batch(engine, rows)
    except Exception as exc:
        if len(rows) > 1:
            middle = len(rows) // 2
            update_resilient(engine, rows[:middle], failures)
            update_resilient(engine, rows[middle:], failures)
            return

        failures.append(
            {
                "grid_id": int(rows[0][0]),
                "error": f"{type(exc).__name__}: {exc}",
            }
        )


def backfill(
    engine: Engine,
    static_blocks: Sequence[tuple[int, list[int]]],
    terrain_by_id: dict[int, dict[str, Any]],
    geometry_by_id: dict[int, dict[str, Any]],
    batch_size: int,
    progress_every: int,
) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    processed = 0
    next_progress = progress_every

    for start in range(0, len(static_blocks), batch_size):
        source_rows = static_blocks[start : start + batch_size]
        update_rows = [
            build_update_row(
                grid_id,
                block_ids,
                terrain_by_id,
                geometry_by_id,
            )
            for grid_id, block_ids in source_rows
        ]
        update_resilient(engine, update_rows, failures)
        processed += len(source_rows)

        if processed >= next_progress or processed == len(static_blocks):
            log(
                f"      진행률 {processed:,}/{len(static_blocks):,} "
                f"({processed / len(static_blocks) * 100:.1f}%) / "
                f"실패 {len(failures):,}건"
            )

            while next_progress <= processed:
                next_progress += progress_every

    return failures


def verify_backfill(
    engine: Engine,
    static_blocks: Sequence[tuple[int, list[int]]],
    terrain_by_id: dict[int, dict[str, Any]],
    geometry_by_id: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    summary_query = text(
        """
        select
          count(*) as total_rows,
          count(*) filter (
            where block_cell_geometries_4326 is null
          ) as geometry_nulls,
          count(*) filter (
            where block_pine_mean is null
          ) as pine_nulls,
          count(*) filter (
            where block_elevation_mean is null
          ) as elevation_nulls,
          count(*) filter (
            where block_slope_mean is null
          ) as slope_nulls,
          count(*) filter (
            where block_cell_geometries_4326 is not null
              and (
                jsonb_typeof(block_cell_geometries_4326) <> 'array'
                or jsonb_array_length(block_cell_geometries_4326)
                   <> cardinality(block_grid_ids)
              )
          ) as geometry_length_mismatches
        from prediction_grid_static
        """
    )
    sample_ids = [
        static_blocks[0][0],
        static_blocks[len(static_blocks) // 4][0],
        static_blocks[len(static_blocks) // 2][0],
        static_blocks[len(static_blocks) * 3 // 4][0],
        static_blocks[-1][0],
    ]
    sample_query = text(
        """
        select
          grid_id,
          block_grid_ids,
          block_cell_geometries_4326,
          block_pine_mean,
          block_elevation_mean,
          block_slope_mean
        from prediction_grid_static
        where grid_id = any(:sample_ids)
        order by grid_id
        """
    )

    with engine.connect() as connection:
        summary = dict(
            connection.execute(summary_query).mappings().one()
        )
        samples = [
            dict(row)
            for row in connection.execute(
                sample_query,
                {"sample_ids": sample_ids},
            ).mappings()
        ]

    blocks_by_id = dict(static_blocks)
    checked_samples: list[dict[str, Any]] = []

    for sample in samples:
        grid_id = int(sample["grid_id"])
        expected = build_update_row(
            grid_id,
            blocks_by_id[grid_id],
            terrain_by_id,
            geometry_by_id,
        )
        actual_geometry = sample["block_cell_geometries_4326"]

        if isinstance(actual_geometry, str):
            actual_geometry = json.loads(actual_geometry)

        checks = {
            "geometry_matches": (
                actual_geometry == json.loads(expected[1])
            ),
            "pine_matches": math.isclose(
                float(sample["block_pine_mean"]),
                expected[2],
                rel_tol=0.0,
                abs_tol=1e-12,
            ),
            "elevation_matches": math.isclose(
                float(sample["block_elevation_mean"]),
                expected[3],
                rel_tol=0.0,
                abs_tol=1e-12,
            ),
            "slope_matches": math.isclose(
                float(sample["block_slope_mean"]),
                expected[4],
                rel_tol=0.0,
                abs_tol=1e-12,
            ),
        }
        checked_samples.append(
            {
                "grid_id": grid_id,
                "block_count": len(sample["block_grid_ids"]),
                **checks,
            }
        )

    summary["samples"] = checked_samples
    return summary


def write_failure_log(
    failures: Sequence[dict[str, Any]],
) -> Path:
    LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
    path = LOG_DIRECTORY / (
        "grid_static_extra_fields_failures_"
        f"{datetime.now():%Y%m%d_%H%M%S}.json"
    )
    path.write_text(
        json.dumps(
            {
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "failure_count": len(failures),
                "failures": list(failures),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="prediction_grid_static 추가 필드 로컬 백필"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="검증 후 실제 Supabase PostgreSQL UPDATE를 수행한다.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=DEFAULT_PROGRESS_EVERY,
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    if args.batch_size <= 0 or args.progress_every <= 0:
        raise ValueError("batch-size와 progress-every는 양수여야 합니다.")

    log("[1/10] 환경변수와 Supabase PostgreSQL 연결 확인")
    engine = create_database_engine()

    log("[2/10] 기존 prediction_grid_static 행과 block_grid_ids 조회")
    static_blocks = load_static_blocks(engine)
    total_references = sum(len(values) for _, values in static_blocks)
    required_ids = {
        value for _, block_ids in static_blocks for value in block_ids
    }
    log(
        f"      중심 {len(static_blocks):,}행 / "
        f"총 참조 {total_references:,}개 / "
        f"고유 격자 {len(required_ids):,}개"
    )

    log("[3/10] terrain CSV에서 고유 격자 지형값·좌표 로딩")
    terrain_by_id = load_required_terrain(required_ids)

    log("[4/10] terrain CSV 누락 ID 검증")
    missing_ids = sorted(required_ids - set(terrain_by_id))

    if missing_ids:
        log(
            f"      누락 {len(missing_ids):,}개: "
            f"{missing_ids[:100]}"
        )
        log("      업데이트를 시작하지 않고 중단합니다.")
        return 2

    log(f"      누락 0개 / 고유 격자 {len(required_ids):,}개 검증 통과")

    log("[5/10] 고유 격자 EPSG:4326 GeoJSON geometry 캐시 생성")
    geometry_by_id = build_geometry_cache(terrain_by_id)
    log(f"      geometry {len(geometry_by_id):,}개 생성")

    log("[6/10] 중심 행별 geometry 배열·지형 평균 구성 준비")
    preview = build_update_row(
        static_blocks[0][0],
        static_blocks[0][1],
        terrain_by_id,
        geometry_by_id,
    )
    log(
        f"      표본 grid_id={preview[0]}, "
        f"block_count={len(static_blocks[0][1])}"
    )

    if not args.apply:
        log("[7/10] --apply가 없어 DB 업데이트 없이 종료")
        return 0

    log(
        f"[7/10] {args.batch_size:,}행 단위 PostgreSQL 배치 UPDATE"
    )
    failures = backfill(
        engine,
        static_blocks,
        terrain_by_id,
        geometry_by_id,
        args.batch_size,
        args.progress_every,
    )

    log("[8/10] 배치 실패 결과 기록")
    failure_log = write_failure_log(failures)
    log(f"      실패 {len(failures):,}건 / {failure_log}")

    log("[9/10] 전체 NULL·geometry 배열 길이 집계")
    verification = verify_backfill(
        engine,
        static_blocks,
        terrain_by_id,
        geometry_by_id,
    )
    log(
        "      "
        f"NULL geometry={verification['geometry_nulls']:,}, "
        f"pine={verification['pine_nulls']:,}, "
        f"elevation={verification['elevation_nulls']:,}, "
        f"slope={verification['slope_nulls']:,}, "
        "배열 길이 불일치="
        f"{verification['geometry_length_mismatches']:,}"
    )

    log("[10/10] 평균값·geometry 표본 재조회 교차 검증")

    for sample in verification["samples"]:
        log(
            f"      grid_id={sample['grid_id']}: "
            f"block={sample['block_count']}, "
            f"geometry={sample['geometry_matches']}, "
            f"pine={sample['pine_matches']}, "
            f"elevation={sample['elevation_matches']}, "
            f"slope={sample['slope_matches']}"
        )

    invalid_summary = any(
        int(verification[key]) != 0
        for key in [
            "geometry_nulls",
            "pine_nulls",
            "elevation_nulls",
            "slope_nulls",
            "geometry_length_mismatches",
        ]
    )
    invalid_samples = any(
        not all(
            bool(sample[key])
            for key in [
                "geometry_matches",
                "pine_matches",
                "elevation_matches",
                "slope_matches",
            ]
        )
        for sample in verification["samples"]
    )

    if failures or invalid_summary or invalid_samples:
        raise RuntimeError(
            "백필 최종 검증에 실패했습니다. 위 결과와 실패 로그를 확인하세요."
        )

    log("완료: prediction_grid_static 37,548행 추가 필드 백필 검증 통과")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("사용자에 의해 중단되었습니다.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(
            f"오류: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        raise SystemExit(1)
