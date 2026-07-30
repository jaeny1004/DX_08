#!/usr/bin/env python3
"""prediction_grid_static.center_pine_area_ha / center_pine_ratio를
terrain_pine_site_features_south_500m.csv에서 백필하는 스크립트
(precompute_prediction_grid_static.py와 동일한 dry-run 기본 + --upload 패턴).

새 데이터 소스가 필요 없다 — 이미 있는 terrain CSV의 pine_area(㎡)/pine_ratio
컬럼을 그대로 읽어서, 이미 prediction_grid_static에 존재하는 행에 대해
두 컬럼만 upsert(부분 업데이트)한다. 다른 컬럼(geometry, block_pine_mean 등)은
건드리지 않는다.

기본 실행은 Supabase에 쓰지 않는 dry-run이다. 실제 적재에는 --upload가 필요하다.

실행 예시 (Windows):
    rag-backend\\venv\\Scripts\\python.exe scripts\\backfill_center_pine_fields.py
    rag-backend\\venv\\Scripts\\python.exe scripts\\backfill_center_pine_fields.py --upload
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
import time
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
TERRAIN_PATH = (
    PROJECT_ROOT / "data" / "terrain_pine_site_features_south_500m.csv"
)

DEFAULT_BATCH_SIZE = 500

# 표본 검증용 — 이전에 block_pine_mean과 비교했던 20개 grid_id를 그대로 재사용.
SAMPLE_GRID_IDS = [
    662533, 573416, 521946, 902234, 1018537, 755625, 814429, 709536,
    1012452, 776604, 851072, 870504, 785142, 887553, 842586, 910866,
    665582, 602693, 824416, 792316,
]


def log(message: str) -> None:
    print(message, flush=True)


def batched(rows: Sequence[dict[str, Any]], batch_size: int) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), batch_size):
        yield list(rows[start : start + batch_size])


def load_terrain_pine_values() -> dict[int, dict[str, float]]:
    log(f"[1/4] terrain CSV 로딩: {TERRAIN_PATH}")
    result: dict[int, dict[str, float]] = {}
    with io.open(TERRAIN_PATH, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if "pine_area" not in reader.fieldnames or "pine_ratio" not in reader.fieldnames:
            raise ValueError(
                f"terrain CSV에 pine_area/pine_ratio 컬럼이 없습니다: {reader.fieldnames}"
            )
        for row in reader:
            grid_id = int(row["id"])
            pine_area_m2 = float(row["pine_area"]) if row["pine_area"] else 0.0
            pine_ratio = float(row["pine_ratio"]) if row["pine_ratio"] else 0.0
            result[grid_id] = {
                # 기존 control 스크립트 load_terrain()과 동일한 변환식(㎡ -> ha).
                "center_pine_area_ha": round(max(0.0, pine_area_m2) / 10_000, 2),
                # 0~1 스케일 그대로 저장 (block_pine_mean과 동일 관례, 여기서 *100 안 함).
                "center_pine_ratio": round(min(1.0, max(0.0, pine_ratio)), 6),
            }
    log(f"      terrain CSV grid_id {len(result):,}개 로딩 완료")
    return result


def load_session_local() -> Any:
    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env")
    sys.path.insert(0, str(BACKEND_ROOT))
    from app.core.database import SessionLocal

    return SessionLocal


def load_target_grid_ids(session_local: Any) -> list[int]:
    from sqlalchemy import text

    log("[2/4] prediction_grid_static의 기존 grid_id 목록 조회")
    with session_local() as session:
        result = session.execute(text("select grid_id from prediction_grid_static"))
        grid_ids = [int(row[0]) for row in result]
    log(f"      prediction_grid_static 행 수: {len(grid_ids):,}")
    return grid_ids


def update_batches(session_local: Any, rows: Sequence[dict[str, Any]], batch_size: int) -> None:
    from sqlalchemy import text

    stmt = text(
        "update prediction_grid_static "
        "set center_pine_area_ha = :center_pine_area_ha, "
        "center_pine_ratio = :center_pine_ratio "
        "where grid_id = :grid_id"
    )
    total_batches = (len(rows) + batch_size - 1) // batch_size
    with session_local() as session:
        for number, batch in enumerate(batched(rows, batch_size), start=1):
            session.execute(stmt, batch)
            session.commit()
            log(f"      배치 {number:,}/{total_batches:,} ({len(batch):,}건)")


def verify_samples(session_local: Any, terrain: dict[int, dict[str, float]]) -> None:
    from sqlalchemy import text

    log("[검증] 표본 20개 격자 재대조 (terrain CSV 직접계산 vs Supabase에 저장된 값)")
    with session_local() as session:
        result = session.execute(
            text(
                "select grid_id, center_pine_area_ha, center_pine_ratio "
                "from prediction_grid_static where grid_id = any(:grid_ids)"
            ),
            {"grid_ids": SAMPLE_GRID_IDS},
        )
        stored = {
            int(row[0]): {"center_pine_area_ha": row[1], "center_pine_ratio": row[2]}
            for row in result
        }

    mismatches = 0
    for grid_id in SAMPLE_GRID_IDS:
        expected = terrain.get(grid_id)
        actual = stored.get(grid_id)
        if expected is None:
            log(f"  grid_id={grid_id}: terrain CSV에 없음 (스킵)")
            continue
        if actual is None:
            log(f"  grid_id={grid_id}: Supabase에 아직 없음 (upload 전이거나 실패)")
            mismatches += 1
            continue
        area_ok = actual["center_pine_area_ha"] == expected["center_pine_area_ha"]
        ratio_ok = actual["center_pine_ratio"] == expected["center_pine_ratio"]
        status = "일치" if (area_ok and ratio_ok) else "불일치"
        if not (area_ok and ratio_ok):
            mismatches += 1
        log(
            f"  grid_id={grid_id}: 기대(area={expected['center_pine_area_ha']}, "
            f"ratio={expected['center_pine_ratio']}) / "
            f"실제(area={actual['center_pine_area_ha']}, "
            f"ratio={actual['center_pine_ratio']}) -> {status}"
        )
    log(f"[검증 결과] {len(SAMPLE_GRID_IDS) - mismatches}/{len(SAMPLE_GRID_IDS)}건 일치")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="prediction_grid_static에 center_pine_area_ha/center_pine_ratio를 백필한다."
    )
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument(
        "--upload", action="store_true", help="실제로 Supabase에 upsert한다 (기본은 dry-run)."
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="업로드 없이 표본 20개만 현재 Supabase 상태와 대조한다.",
    )
    return parser


def count_null_rows(session_local: Any) -> int:
    from sqlalchemy import text

    with session_local() as session:
        result = session.execute(
            text(
                "select count(*) from prediction_grid_static "
                "where center_pine_area_ha is null or center_pine_ratio is null"
            )
        )
        return int(result.scalar_one())


def main() -> int:
    args = build_parser().parse_args()
    started_at = time.monotonic()

    if not TERRAIN_PATH.is_file():
        raise FileNotFoundError(f"terrain CSV가 없습니다: {TERRAIN_PATH}")

    terrain = load_terrain_pine_values()

    if args.verify_only:
        session_local = load_session_local()
        verify_samples(session_local, terrain)
        null_count = count_null_rows(session_local)
        log(f"[NULL 확인] center_pine_area_ha 또는 center_pine_ratio가 NULL인 행: {null_count:,}건")
        return 0

    session_local = load_session_local() if (args.upload) else None

    if session_local is not None:
        target_grid_ids = load_target_grid_ids(session_local)
    else:
        log("[2/4] dry-run: Supabase 조회 없이 terrain CSV 기준으로만 미리보기")
        target_grid_ids = list(terrain.keys())

    rows: list[dict[str, Any]] = []
    missing_in_terrain = 0
    for grid_id in target_grid_ids:
        values = terrain.get(grid_id)
        if values is None:
            missing_in_terrain += 1
            continue
        rows.append({"grid_id": grid_id, **values})

    log(f"[3/4] 백필 대상: {len(rows):,}건 (terrain CSV에 없어 스킵: {missing_in_terrain:,}건)")
    log("      샘플 3건:")
    for row in rows[:3]:
        log(f"        {row}")

    if not args.upload:
        log("\n실제 upsert 없이 종료합니다 (--upload 없음, dry-run).")
        verify_samples_note = ", ".join(str(g) for g in SAMPLE_GRID_IDS[:5])
        log(f"표본 검증용 grid_id 20개 중 앞 5개: {verify_samples_note} ...")
        return 0

    log("[4/4] Postgres UPDATE 진행 (direct SQL, SessionLocal)")
    update_batches(session_local, rows, args.batch_size)

    verify_samples(session_local, terrain)

    null_count = count_null_rows(session_local)
    log(f"[NULL 확인] center_pine_area_ha 또는 center_pine_ratio가 NULL인 행: {null_count:,}건")

    elapsed = time.monotonic() - started_at
    log(f"\n완료: {len(rows):,}건 UPDATE, {elapsed:.1f}초")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("사용자에 의해 중단되었습니다.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"오류: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
