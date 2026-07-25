#!/usr/bin/env python3
r"""신규 확산위험 후보 격자의 보고서용 공간 값을 로컬에서 사전 계산한다.

Windows PowerShell:
    .\precompute-venv312\Scripts\python.exe `
      scripts\precompute_prediction_grid_static.py `
      --limit 100 --batch-size 500 --upload

기본 실행은 Supabase에 쓰지 않는 dry-run이다. 실제 적재에는 --upload가 필요하다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections.abc import Iterator, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from dotenv import load_dotenv
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"

CANDIDATE_PATH = (
    BACKEND_ROOT / "data" / "final_ui_candidate_v4.geojson"
)
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

GRID_SIZE_M = 500.0
NEARBY_RADIUS_M = 14_000.0
DEFAULT_BATCH_SIZE = 500
DEFAULT_TEST_LIMIT = 100
DEFAULT_COMPUTE_CHUNK_SIZE = 100
DEFAULT_PROGRESS_EVERY = 5_000

ANNUAL_COLUMN_RE = re.compile(r"^infection_count_(\d{4})$")


def log(message: str) -> None:
    print(message, flush=True)


def batched(
    rows: Sequence[dict[str, Any]],
    batch_size: int,
) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), batch_size):
        yield list(rows[start : start + batch_size])


def file_version(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)

    return f"{path.name}:sha256:{digest.hexdigest()[:16]}"


def geojson_object(geometry: Any) -> dict[str, Any]:
    # mapping()의 좌표 tuple을 JSON 배열로 정규화한다.
    return json.loads(json.dumps(mapping(geometry)))


def nullable_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None

    text = str(value).strip()
    return text or None


def nullable_date(value: Any) -> str | None:
    text = nullable_text(value)

    if text is None:
        return None

    parsed = pd.to_datetime(text, errors="coerce")
    return None if pd.isna(parsed) else parsed.date().isoformat()


def load_candidates(limit: int | None) -> gpd.GeoDataFrame:
    log(f"[1/7] 신규 확산위험 후보 로딩: {CANDIDATE_PATH}")
    candidates = gpd.read_file(CANDIDATE_PATH)

    if candidates.crs is None:
        candidates = candidates.set_crs("EPSG:4326")

    required = {
        "id",
        "risk_candidate_flag",
        "sido_name",
        "sigungu_name",
        "geometry",
    }
    missing = required - set(candidates.columns)

    if missing:
        raise ValueError(f"후보 GeoJSON 필수 컬럼 누락: {sorted(missing)}")

    candidates = candidates[
        candidates["risk_candidate_flag"].eq(True)  # noqa: E712
    ].copy()
    candidates["id"] = candidates["id"].astype("int64")
    candidates = candidates.sort_values("id").reset_index(drop=True)

    if candidates["id"].duplicated().any():
        duplicates = (
            candidates.loc[candidates["id"].duplicated(), "id"]
            .astype(str)
            .head(10)
            .tolist()
        )
        raise ValueError(f"후보 격자 ID 중복: {duplicates}")

    total = len(candidates)
    log(f"      risk_candidate_flag=true: {total:,}개")

    if total != 37_549:
        raise ValueError(
            "예상한 신규 확산위험 후보 37,549개와 실제 개수가 다릅니다: "
            f"{total:,}개"
        )

    if limit is not None:
        candidates = candidates.head(limit).copy()
        log(f"      이번 실행 대상: {len(candidates):,}개")

    return candidates


def parse_first_wkt_corner(wkt_text: str) -> tuple[float, float]:
    match = re.search(
        r"POLYGON\s*\(\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)",
        str(wkt_text),
    )

    if not match:
        raise ValueError(
            f"WKT 시작 좌표를 읽을 수 없습니다: {str(wkt_text)[:100]}"
        )

    return float(match.group(1)), float(match.group(2))


def load_terrain_index() -> tuple[
    dict[int, tuple[float, float]],
    dict[tuple[float, float], int],
]:
    log(f"[2/7] 500m 격자 좌표 인덱스 로딩: {TERRAIN_PATH}")
    terrain = pd.read_csv(
        TERRAIN_PATH,
        usecols=["id", "WKT"],
        low_memory=False,
    )
    by_id: dict[int, tuple[float, float]] = {}
    by_corner: dict[tuple[float, float], int] = {}

    for row in terrain.itertuples(index=False):
        grid_id = int(row.id)
        minx, maxy = parse_first_wkt_corner(row.WKT)
        by_id[grid_id] = (minx, maxy)
        by_corner[(round(minx, 3), round(maxy, 3))] = grid_id

    return by_id, by_corner


def cell_polygon(minx: float, maxy: float) -> Polygon:
    return Polygon(
        [
            (minx, maxy),
            (minx + GRID_SIZE_M, maxy),
            (minx + GRID_SIZE_M, maxy - GRID_SIZE_M),
            (minx, maxy - GRID_SIZE_M),
            (minx, maxy),
        ]
    )


def get_block_grid_ids(
    center_grid_id: int,
    terrain_by_id: dict[int, tuple[float, float]],
    terrain_by_corner: dict[tuple[float, float], int],
) -> list[int]:
    if center_grid_id not in terrain_by_id:
        raise KeyError(f"terrain CSV에 중심 격자 {center_grid_id}가 없습니다.")

    center_minx, center_maxy = terrain_by_id[center_grid_id]
    result: list[int] = []

    for dy in (GRID_SIZE_M, 0.0, -GRID_SIZE_M):
        for dx in (-GRID_SIZE_M, 0.0, GRID_SIZE_M):
            key = (
                round(center_minx + dx, 3),
                round(center_maxy + dy, 3),
            )
            neighbor_id = terrain_by_corner.get(key)

            if neighbor_id is not None:
                result.append(neighbor_id)

    if not 4 <= len(result) <= 9:
        raise ValueError(
            f"격자 {center_grid_id}의 block_grid_ids cardinality가 "
            f"CHECK 범위를 벗어납니다: {len(result)}"
        )

    if center_grid_id not in result:
        raise ValueError(
            f"격자 {center_grid_id}의 3x3 권역에 중심 격자가 없습니다."
        )

    return result


def load_infection_history() -> tuple[
    gpd.GeoDataFrame,
    gpd.GeoDataFrame,
    list[int],
]:
    log(f"[3/7] 감염 발생 이력 로딩: {INFECTION_PATH}")
    infection = gpd.read_file(INFECTION_PATH)

    if infection.crs is None:
        infection = infection.set_crs("EPSG:4326")

    infection_4326 = infection.to_crs("EPSG:4326")
    infection_5186 = infection.to_crs("EPSG:5186")

    required = {"id", "infection_count_2016_2021", "geometry"}
    missing = required - set(infection_5186.columns)

    if missing:
        raise ValueError(
            f"감염 발생 이력 필수 컬럼 누락: {sorted(missing)}"
        )

    infection_5186["id"] = infection_5186["id"].astype("int64")
    infection_4326["id"] = infection_4326["id"].astype("int64")

    if infection_5186["id"].duplicated().any():
        raise ValueError(
            "감염 발생 이력의 id가 중복되어 관계 테이블 기본키를 "
            "보장할 수 없습니다."
        )

    years = sorted(
        int(match.group(1))
        for column in infection_5186.columns
        if (match := ANNUAL_COLUMN_RE.match(str(column)))
    )

    if not years:
        raise ValueError("감염 발생 이력에서 연도별 컬럼을 찾지 못했습니다.")

    return infection_5186, infection_4326, years


def build_infection_position_rows(
    infection_4326: gpd.GeoDataFrame,
    years: Sequence[int],
    infection_data_version: str,
) -> list[dict[str, Any]]:
    expected_years = list(range(2016, 2022))

    if list(years) != expected_years:
        raise ValueError(
            "infection_grid_positions 스키마가 요구하는 연도와 "
            f"감염 이력 컬럼이 다릅니다: {list(years)}"
        )

    rows: list[dict[str, Any]] = []

    for infection_row in infection_4326.itertuples(index=False):
        row = {
            "grid_id": int(infection_row.id),
            "geometry_4326": geojson_object(
                infection_row.geometry
            ),
            "infection_data_version": infection_data_version,
        }

        for year in years:
            annual_value = getattr(
                infection_row,
                f"infection_count_{year}",
                0,
            )
            row[f"infection_count_{year}"] = (
                0
                if annual_value is None or pd.isna(annual_value)
                else int(annual_value)
            )

        cumulative_value = getattr(
            infection_row,
            "infection_count_2016_2021",
            0,
        )
        row["infection_count_2016_2021"] = (
            0
            if cumulative_value is None or pd.isna(cumulative_value)
            else int(cumulative_value)
        )
        rows.append(row)

    return rows


def row_count(row: Any, column: str) -> int:
    value = row.get(column, 0)

    if value is None or pd.isna(value):
        return 0

    return int(value)


def sum_count(frame: pd.DataFrame, column: str) -> int:
    if column not in frame.columns or frame.empty:
        return 0

    return int(
        pd.to_numeric(frame[column], errors="coerce")
        .fillna(0)
        .sum()
    )


def candidate_value(
    row: Any,
    column: str,
) -> Any:
    return row.get(column) if column in row.index else None


def precompute_rows(
    candidates: gpd.GeoDataFrame,
    terrain_by_id: dict[int, tuple[float, float]],
    terrain_by_corner: dict[tuple[float, float], int],
    infection: gpd.GeoDataFrame,
    years: Sequence[int],
    grid_source_version: str,
    infection_data_version: str,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    log("[4/7] 정적 geometry·14km 관계·연도별 통계 계산")
    infection_by_id = infection.set_index("id", drop=False)
    spatial_index = infection.sindex

    static_rows: list[dict[str, Any]] = []
    stats_rows: list[dict[str, Any]] = []

    for position, candidate in enumerate(
        candidates.itertuples(index=False),
        start=1,
    ):
        candidate_series = candidates.iloc[position - 1]
        grid_id = int(candidate.id)
        minx, maxy = terrain_by_id[grid_id]
        center_geometry_5186 = cell_polygon(minx, maxy)
        center_point_5186 = center_geometry_5186.centroid
        block_grid_ids = get_block_grid_ids(
            grid_id,
            terrain_by_id,
            terrain_by_corner,
        )
        block_geometries_5186 = [
            cell_polygon(*terrain_by_id[block_grid_id])
            for block_grid_id in block_grid_ids
        ]
        block_geometry_5186 = unary_union(block_geometries_5186)

        center_frame_5186 = gpd.GeoSeries(
            [center_point_5186],
            crs="EPSG:5186",
        )
        cell_frame_5186 = gpd.GeoSeries(
            [center_geometry_5186],
            crs="EPSG:5186",
        )
        block_frame_5186 = gpd.GeoSeries(
            [block_geometry_5186],
            crs="EPSG:5186",
        )

        search_area = center_point_5186.buffer(NEARBY_RADIUS_M)
        nearby_positions = spatial_index.query(
            search_area,
            predicate="intersects",
        )
        nearby = infection.iloc[nearby_positions].copy()
        nearby = nearby.sort_values("id")
        nearby_infection_grid_ids = [
            int(value)
            for value in nearby["id"].tolist()
        ]

        static_rows.append(
            {
                "grid_id": grid_id,
                "risk_candidate_flag": True,
                "center_point_5186": geojson_object(
                    center_point_5186
                ),
                "center_point_4326": geojson_object(
                    center_frame_5186.to_crs("EPSG:4326").iloc[0]
                ),
                "cell_geometry_5186": geojson_object(
                    center_geometry_5186
                ),
                "cell_geometry_4326": geojson_object(
                    cell_frame_5186.to_crs("EPSG:4326").iloc[0]
                ),
                "block_geometry_5186": geojson_object(
                    block_geometry_5186
                ),
                "block_geometry_4326": geojson_object(
                    block_frame_5186.to_crs("EPSG:4326").iloc[0]
                ),
                "block_grid_ids": block_grid_ids,
                "nearby_infection_grid_ids": (
                    nearby_infection_grid_ids
                ),
                "sido_code": nullable_text(
                    candidate_value(candidate_series, "sido_code")
                ),
                "sido_name": str(candidate.sido_name).strip(),
                "sigungu_code": nullable_text(
                    candidate_value(candidate_series, "sigungu_code")
                ),
                "sigungu_name": str(candidate.sigungu_name).strip(),
                "admin_base_date": nullable_date(
                    candidate_value(candidate_series, "admin_base_date")
                ),
                "admin_match_method": nullable_text(
                    candidate_value(candidate_series, "admin_match_method")
                ),
                "grid_source_version": grid_source_version,
            }
        )

        block_history = infection_by_id[
            infection_by_id.index.isin(block_grid_ids)
        ]
        center_history = (
            infection_by_id.loc[grid_id]
            if grid_id in infection_by_id.index
            else None
        )
        center_cumulative = (
            row_count(
                center_history,
                "infection_count_2016_2021",
            )
            if center_history is not None
            else 0
        )
        block_cumulative = sum_count(
            block_history,
            "infection_count_2016_2021",
        )
        nearby_cumulative = sum_count(
            nearby,
            "infection_count_2016_2021",
        )

        for year in years:
            annual_column = f"infection_count_{year}"
            center_annual = (
                row_count(center_history, annual_column)
                if center_history is not None
                else 0
            )

            stats_rows.append(
                {
                    "grid_id": grid_id,
                    "year": int(year),
                    "infection_data_version": infection_data_version,
                    "center_annual_count": center_annual,
                    "center_cumulative_count": center_cumulative,
                    "block_annual_count": sum_count(
                        block_history,
                        annual_column,
                    ),
                    "block_cumulative_count": block_cumulative,
                    "block_active_grid_count": int(
                        (
                            pd.to_numeric(
                                block_history.get(
                                    annual_column,
                                    pd.Series(dtype="float64"),
                                ),
                                errors="coerce",
                            ).fillna(0)
                            > 0
                        ).sum()
                    ),
                    "nearby_14km_grid_count": len(nearby),
                    "nearby_14km_annual_count": sum_count(
                        nearby,
                        annual_column,
                    ),
                    "nearby_14km_cumulative_count": (
                        nearby_cumulative
                    ),
                    "nearby_14km_active_grid_count": int(
                        (
                            pd.to_numeric(
                                nearby.get(
                                    annual_column,
                                    pd.Series(dtype="float64"),
                                ),
                                errors="coerce",
                            ).fillna(0)
                            > 0
                        ).sum()
                    ),
                }
            )

        if position % 25 == 0 or position == len(candidates):
            log(
                f"      {position:,}/{len(candidates):,}개 계산 완료 "
                f"(현재 격자 14km 배열 {len(nearby):,}개)"
            )

    return static_rows, stats_rows


def validate_rows(
    static_rows: Sequence[dict[str, Any]],
    stats_rows: Sequence[dict[str, Any]],
    years: Sequence[int],
) -> None:
    log("[5/7] 로컬 CHECK 제약 사전 검증")

    if not static_rows:
        raise ValueError("계산된 prediction_grid_static 행이 없습니다.")

    for row in static_rows:
        if row["risk_candidate_flag"] is not True:
            raise ValueError(
                f"격자 {row['grid_id']}가 risk_candidate_flag CHECK 위반"
            )

        cardinality = len(row["block_grid_ids"])

        if not 4 <= cardinality <= 9:
            raise ValueError(
                f"격자 {row['grid_id']}가 block cardinality CHECK 위반: "
                f"{cardinality}"
            )

        nearby_ids = row["nearby_infection_grid_ids"]

        if not isinstance(nearby_ids, list):
            raise ValueError(
                f"격자 {row['grid_id']}의 nearby ID가 배열이 아닙니다."
            )

        if nearby_ids != sorted(set(nearby_ids)):
            raise ValueError(
                f"격자 {row['grid_id']}의 nearby ID가 "
                "정렬되지 않았거나 중복됐습니다."
            )

        for column in (
            "center_point_5186",
            "center_point_4326",
            "cell_geometry_5186",
            "cell_geometry_4326",
            "block_geometry_5186",
            "block_geometry_4326",
        ):
            if not isinstance(row[column], dict):
                raise ValueError(
                    f"격자 {row['grid_id']}의 {column}이 JSON 객체가 아닙니다."
                )

    expected_stats = len(static_rows) * len(years)

    if len(stats_rows) != expected_stats:
        raise ValueError(
            f"연도별 통계 행 수 불일치: {len(stats_rows):,} != "
            f"{expected_stats:,}"
        )

    static_ids = {row["grid_id"] for row in static_rows}
    if any(row["grid_id"] not in static_ids for row in stats_rows):
        raise ValueError("통계에 대상 밖 grid_id가 있습니다.")

    log(
        f"      정적 {len(static_rows):,}건 / "
        f"14km 배열 ID "
        f"{sum(len(row['nearby_infection_grid_ids']) for row in static_rows):,}개 / "
        f"연도별 통계 {len(stats_rows):,}건: 통과"
    )


def create_supabase_client() -> Any:
    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env")

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()

    if not url or not key:
        raise RuntimeError(
            "rag-backend/.env 또는 프로젝트 .env에 "
            "SUPABASE_URL과 SUPABASE_KEY가 필요합니다."
        )

    from supabase import create_client

    return create_client(url, key)


def upsert_batches(
    client: Any,
    table: str,
    rows: Sequence[dict[str, Any]],
    batch_size: int,
    on_conflict: str,
) -> None:
    total_batches = (len(rows) + batch_size - 1) // batch_size

    for number, batch in enumerate(
        batched(rows, batch_size),
        start=1,
    ):
        (
            client.table(table)
            .upsert(batch, on_conflict=on_conflict)
            .execute()
        )
        log(
            f"      {table}: 배치 {number:,}/{total_batches:,} "
            f"({len(batch):,}건)"
        )


def upsert_batches_resilient(
    client: Any,
    table: str,
    rows: Sequence[dict[str, Any]],
    batch_size: int,
    on_conflict: str,
    grid_id_key: str,
    failures: list[dict[str, Any]],
) -> None:
    def upload_or_split(batch: list[dict[str, Any]]) -> None:
        try:
            (
                client.table(table)
                .upsert(batch, on_conflict=on_conflict)
                .execute()
            )
        except Exception as exc:
            if len(batch) > 1:
                midpoint = len(batch) // 2
                upload_or_split(batch[:midpoint])
                upload_or_split(batch[midpoint:])
                return

            failures.append(
                {
                    "table": table,
                    "grid_id": int(batch[0][grid_id_key]),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )

    for batch in batched(rows, batch_size):
        upload_or_split(batch)


def upload_rows(
    client: Any,
    static_rows: Sequence[dict[str, Any]],
    stats_rows: Sequence[dict[str, Any]],
    batch_size: int,
    failures: list[dict[str, Any]],
) -> None:
    before_static = len(failures)
    upsert_batches_resilient(
        client,
        "prediction_grid_static",
        static_rows,
        batch_size,
        "grid_id",
        "grid_id",
        failures,
    )
    failed_static_ids = {
        failure["grid_id"]
        for failure in failures[before_static:]
        if failure["table"] == "prediction_grid_static"
    }
    eligible_stats = [
        row
        for row in stats_rows
        if row["grid_id"] not in failed_static_ids
    ]
    upsert_batches_resilient(
        client,
        "grid_infection_stats",
        eligible_stats,
        batch_size,
        "grid_id,year,infection_data_version",
        "grid_id",
        failures,
    )


def verify_uploaded_rows(
    client: Any,
    static_rows: Sequence[dict[str, Any]],
    infection_data_version: str,
    expected_stats: int,
) -> None:
    log("[7/7] Supabase 적재 결과 검증")
    grid_ids = [row["grid_id"] for row in static_rows]

    static_result = (
        client.table("prediction_grid_static")
        .select("grid_id", count="exact")
        .in_("grid_id", grid_ids)
        .execute()
    )
    stats_result = (
        client.table("grid_infection_stats")
        .select("grid_id", count="exact")
        .in_("grid_id", grid_ids)
        .eq("infection_data_version", infection_data_version)
        .execute()
    )

    actual_static = int(static_result.count or 0)
    actual_stats = int(stats_result.count or 0)

    expected_static = len(static_rows)
    results = {
        "prediction_grid_static": (
            actual_static,
            expected_static,
        ),
        "grid_infection_stats": (
            actual_stats,
            expected_stats,
        ),
    }

    for table, (actual, expected) in results.items():
        log(f"      {table}: {actual:,}/{expected:,}건")

        if actual != expected:
            raise RuntimeError(
                f"{table} 적재 검증 실패: {actual:,} != {expected:,}"
            )


def upload_infection_positions(
    client: Any,
    rows: Sequence[dict[str, Any]],
    batch_size: int,
) -> None:
    log("[준비] 감염 이력 격자 위치 Supabase 배치 upsert")
    upsert_batches(
        client,
        "infection_grid_positions",
        rows,
        batch_size,
        "grid_id",
    )


def verify_infection_positions(
    client: Any,
    infection_data_version: str,
    expected_count: int,
) -> None:
    result = (
        client.table("infection_grid_positions")
        .select("grid_id", count="exact")
        .eq("infection_data_version", infection_data_version)
        .execute()
    )
    actual_count = int(result.count or 0)
    log(
        "      infection_grid_positions: "
        f"{actual_count:,}/{expected_count:,}건"
    )

    if actual_count != expected_count:
        raise RuntimeError(
            "infection_grid_positions 적재 검증 실패: "
            f"{actual_count:,} != {expected_count:,}"
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "신규 확산위험 후보 격자의 정적 공간 값과 감염 발생 이력 "
            "통계를 로컬에서 사전 계산한다."
        )
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_TEST_LIMIT,
        help="처리할 후보 수. 기본값은 안전한 100개 테스트다.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="전체 37,549개를 처리한다. --limit보다 우선한다.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="Supabase upsert 배치 크기",
    )
    parser.add_argument(
        "--compute-chunk-size",
        type=int,
        default=DEFAULT_COMPUTE_CHUNK_SIZE,
        help=(
            "메모리에 한 번에 계산하고 검증할 후보 격자 수. "
            "기본값은 100개다."
        ),
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="계산 결과를 Supabase에 실제 upsert한다.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=DEFAULT_PROGRESS_EVERY,
        help="전체 실행 진행률을 출력할 후보 격자 간격",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    if args.batch_size <= 0:
        raise ValueError("--batch-size는 1 이상이어야 합니다.")

    if args.limit <= 0:
        raise ValueError("--limit는 1 이상이어야 합니다.")

    if args.compute_chunk_size <= 0:
        raise ValueError("--compute-chunk-size는 1 이상이어야 합니다.")

    if args.progress_every <= 0:
        raise ValueError("--progress-every는 1 이상이어야 합니다.")

    limit = None if args.all else args.limit
    started_at = time.monotonic()

    for path in (CANDIDATE_PATH, TERRAIN_PATH, INFECTION_PATH):
        if not path.is_file():
            raise FileNotFoundError(f"필수 입력 파일이 없습니다: {path}")

    grid_source_version = file_version(TERRAIN_PATH)
    infection_data_version = file_version(INFECTION_PATH)

    candidates = load_candidates(limit)
    terrain_by_id, terrain_by_corner = load_terrain_index()
    infection, infection_4326, years = load_infection_history()
    infection_position_rows = build_infection_position_rows(
        infection_4326,
        years,
        infection_data_version,
    )
    client = None
    failures: list[dict[str, Any]] = []
    run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    failure_path = (
        PROJECT_ROOT
        / "data"
        / "precompute_logs"
        / f"prediction_grid_failures_{run_stamp}.json"
    )
    if args.upload:
        log("[준비] Supabase 테이블 접근 확인")
        client = create_supabase_client()

        for table in (
            "prediction_grid_static",
            "grid_infection_stats",
            "infection_grid_positions",
        ):
            (
                client.table(table)
                .select("*", count="exact")
                .limit(0)
                .execute()
            )

        existing_positions = (
            client.table("infection_grid_positions")
            .select("grid_id", count="exact")
            .eq("infection_data_version", infection_data_version)
            .execute()
        )

        if int(existing_positions.count or 0) == len(
            infection_position_rows
        ):
            log(
                "[준비] 감염 위치 43,585건이 이미 일치하여 "
                "재업로드를 생략합니다."
            )
        else:
            upload_infection_positions(
                client,
                infection_position_rows,
                args.batch_size,
            )
            verify_infection_positions(
                client,
                infection_data_version,
                len(infection_position_rows),
            )

    total_static = 0
    total_nearby_ids = 0
    total_stats = 0
    processed_candidates = 0
    next_progress = args.progress_every
    total_chunks = (
        len(candidates) + args.compute_chunk_size - 1
    ) // args.compute_chunk_size

    for chunk_number, start in enumerate(
        range(0, len(candidates), args.compute_chunk_size),
        start=1,
    ):
        candidate_chunk = candidates.iloc[
            start : start + args.compute_chunk_size
        ].reset_index(drop=True)
        log(
            f"[청크 {chunk_number:,}/{total_chunks:,}] "
            f"후보 {len(candidate_chunk):,}개 처리"
        )
        try:
            static_rows, stats_rows = precompute_rows(
                candidate_chunk,
                terrain_by_id,
                terrain_by_corner,
                infection,
                years,
                grid_source_version,
                infection_data_version,
            )
            validate_rows(
                static_rows,
                stats_rows,
                years,
            )
        except Exception:
            static_rows = []
            stats_rows = []

            for row_index in range(len(candidate_chunk)):
                single_candidate = candidate_chunk.iloc[
                    row_index : row_index + 1
                ].reset_index(drop=True)
                grid_id = int(single_candidate.iloc[0]["id"])

                try:
                    one_static, one_stats = precompute_rows(
                        single_candidate,
                        terrain_by_id,
                        terrain_by_corner,
                        infection,
                        years,
                        grid_source_version,
                        infection_data_version,
                    )
                    validate_rows(
                        one_static,
                        one_stats,
                        years,
                    )
                    static_rows.extend(one_static)
                    stats_rows.extend(one_stats)
                except Exception as exc:
                    failures.append(
                        {
                            "table": "precompute",
                            "grid_id": grid_id,
                            "error": (
                                f"{type(exc).__name__}: {exc}"
                            ),
                        }
                    )

        if client is not None:
            log("[6/7] Supabase 배치 upsert")
            upload_rows(
                client,
                static_rows,
                stats_rows,
                args.batch_size,
                failures,
            )
            try:
                verify_uploaded_rows(
                    client,
                    static_rows,
                    infection_data_version,
                    len(stats_rows),
                )
            except Exception as exc:
                failures.append(
                    {
                        "table": "verification",
                        "grid_id": [
                            row["grid_id"] for row in static_rows
                        ],
                        "error": f"{type(exc).__name__}: {exc}",
                    }
                )

        total_static += len(static_rows)
        total_nearby_ids += sum(
            len(row["nearby_infection_grid_ids"])
            for row in static_rows
        )
        total_stats += len(stats_rows)
        processed_candidates += len(candidate_chunk)

        if (
            processed_candidates >= next_progress
            or processed_candidates == len(candidates)
        ):
            progress = processed_candidates / len(candidates) * 100
            log(
                f"[진행률] {processed_candidates:,}/{len(candidates):,} "
                f"({progress:.1f}%) / 실패 {len(failures):,}건"
            )

            while next_progress <= processed_candidates:
                next_progress += args.progress_every

        del static_rows
        del stats_rows

    if client is None:
        log("[6/7] dry-run: --upload가 없어 Supabase에 쓰지 않았습니다.")
        log("[7/7] dry-run 완료")
    else:
        log("[7/7] 모든 계산 청크의 Supabase 검증 완료")

    elapsed = time.monotonic() - started_at
    failure_path.parent.mkdir(parents=True, exist_ok=True)
    failure_path.write_text(
        json.dumps(
            {
                "created_at": datetime.now().isoformat(
                    timespec="seconds"
                ),
                "processed_candidates": processed_candidates,
                "failure_count": len(failures),
                "failures": failures,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    log(
        f"완료: 후보 {total_static:,}개, "
        f"14km 배열 ID {total_nearby_ids:,}개, "
        f"감염 위치 {len(infection_position_rows):,}건, "
        f"통계 {total_stats:,}건, {elapsed:.1f}초"
    )
    log(f"실패 목록: {failure_path} ({len(failures):,}건)")
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
