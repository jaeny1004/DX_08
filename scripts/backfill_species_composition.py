#!/usr/bin/env python3
r"""prediction_grid_static 행에 임상도 수종구성(species_composition jsonb)을 백필한다.

009_species_composition.sql로 컬럼을 먼저 추가한 뒤 실행한다.
data/terrain_species_composition_south_500m.csv(build_terrain_species_composition.py
산출물)에서 격자별 수종구성을 읽어, 테이블에 존재하는 grid_id에만 UPDATE한다.
임상도 산림 폴리곤과 교차하지 않은 격자(CSV에 없는 id)는 NULL로 남긴다(정상).

Windows PowerShell (dry-run):
    .\rag-backend\venv\Scripts\python.exe .\scripts\backfill_species_composition.py
실제 적용:
    .\rag-backend\venv\Scripts\python.exe .\scripts\backfill_species_composition.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Sequence

import pandas as pd
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
SPECIES_CSV = PROJECT_ROOT / "data" / "terrain_species_composition_south_500m.csv"
LOG_DIRECTORY = PROJECT_ROOT / "data" / "precompute_logs"

DEFAULT_BATCH_SIZE = 500
DEFAULT_PROGRESS_EVERY = 5_000


def log(message: str) -> None:
    print(message, flush=True)


def create_database_engine() -> Engine:
    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env")
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("rag-backend/.env에 DATABASE_URL이 필요합니다.")
    return create_engine(database_url, pool_pre_ping=True)


def load_target_grid_ids(engine: Engine) -> list[int]:
    with engine.connect() as connection:
        rows = connection.execute(
            text("select grid_id from prediction_grid_static order by grid_id")
        ).all()
    return [int(row.grid_id) for row in rows]


def load_species_map(target_ids: set[int]) -> dict[int, dict[str, Any]]:
    """CSV -> {grid_id: species_composition 객체}. 테이블에 있는 id만."""
    df = pd.read_csv(
        SPECIES_CSV,
        usecols=[
            "id", "forest_ratio", "dominant_species", "n_species",
            "species_composition",
        ],
        low_memory=False,
    )
    df["id"] = df["id"].astype("int64")
    if df["id"].duplicated().any():
        dups = df.loc[df["id"].duplicated(), "id"].head(20).tolist()
        raise RuntimeError(f"수종구성 CSV 격자 ID 중복: {dups}")
    df = df[df["id"].isin(target_ids)].copy()

    result: dict[int, dict[str, Any]] = {}
    for row in df.itertuples(index=False):
        composition = json.loads(row.species_composition)
        # composition이 비어있으면(산림 수종 0종) 저장하지 않는다 -> NULL 유지
        if not composition:
            continue
        result[int(row.id)] = {
            "composition": composition,
            "forest_ratio": (
                None if pd.isna(row.forest_ratio) else round(float(row.forest_ratio), 4)
            ),
            "dominant_species": (
                None if pd.isna(row.dominant_species) or row.dominant_species == ""
                else str(row.dominant_species)
            ),
            "n_species": int(row.n_species),
        }
    return result


UPDATE_SQL = """
update prediction_grid_static as target
set species_composition = source.payload::jsonb,
    updated_at = now()
from (values %s) as source(grid_id, payload)
where target.grid_id = source.grid_id
"""


def update_batch(engine: Engine, rows: Sequence[tuple[Any, ...]]) -> int:
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            execute_values(
                cur, UPDATE_SQL, list(rows),
                template="(%s,%s)", page_size=len(rows),
            )
            affected = cur.rowcount
        raw.commit()
        return affected
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()


def backfill(
    engine: Engine,
    species_map: dict[int, dict[str, Any]],
    batch_size: int,
    progress_every: int,
) -> int:
    items = sorted(species_map.items())
    total = len(items)
    processed = 0
    affected_total = 0
    next_progress = progress_every
    for start in range(0, total, batch_size):
        chunk = items[start : start + batch_size]
        update_rows = [
            (gid, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
            for gid, payload in chunk
        ]
        affected_total += update_batch(engine, update_rows)
        processed += len(chunk)
        if processed >= next_progress or processed == total:
            log(f"      진행률 {processed:,}/{total:,} "
                f"({processed / total * 100:.1f}%)")
            while next_progress <= processed:
                next_progress += progress_every
    return affected_total


def verify(engine: Engine, sample_ids: Sequence[int]) -> dict[str, Any]:
    with engine.connect() as connection:
        summary = dict(connection.execute(text(
            """
            select
              count(*) as total_rows,
              count(species_composition) as filled_rows,
              count(*) filter (
                where species_composition is not null
                  and jsonb_typeof(species_composition) <> 'object'
              ) as non_object,
              count(*) filter (
                where species_composition is not null
                  and not (species_composition ? 'composition')
              ) as missing_composition_key
            from prediction_grid_static
            """
        )).mappings().one())
        samples = [
            dict(r) for r in connection.execute(
                text(
                    "select grid_id, species_composition "
                    "from prediction_grid_static "
                    "where grid_id = any(:ids) order by grid_id"
                ),
                {"ids": list(sample_ids)},
            ).mappings()
        ]
    summary["samples"] = samples
    return summary


def write_failure_log(payload: dict[str, Any]) -> Path:
    LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
    path = LOG_DIRECTORY / f"species_composition_backfill_{datetime.now():%Y%m%d_%H%M%S}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="prediction_grid_static 수종구성 백필")
    p.add_argument("--apply", action="store_true",
                   help="검증 후 실제 Supabase UPDATE 수행")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    p.add_argument("--progress-every", type=int, default=DEFAULT_PROGRESS_EVERY)
    return p


def main() -> int:
    args = build_parser().parse_args()

    log("[1/6] Supabase 연결 확인")
    engine = create_database_engine()

    log("[2/6] prediction_grid_static grid_id 조회")
    target_ids = load_target_grid_ids(engine)
    log(f"      테이블 행 {len(target_ids):,}개")

    log("[3/6] 수종구성 CSV 로딩(테이블에 있는 id만)")
    species_map = load_species_map(set(target_ids))
    matched = len(species_map)
    missing = len(target_ids) - matched
    log(f"      수종구성 매칭 {matched:,}개 / 산림없음(NULL 유지) {missing:,}개")

    if matched == 0:
        log("      매칭 격자 0개 — CSV의 id와 테이블 grid_id 범위를 확인하세요.")
        return 2

    # 표본 미리보기
    preview_id, preview = sorted(species_map.items())[0]
    log(f"      표본 grid_id={preview_id} dominant={preview['dominant_species']} "
        f"n_species={preview['n_species']} forest_ratio={preview['forest_ratio']}")

    if not args.apply:
        log("[4/6] --apply 없음 → DB 변경 없이 종료(dry-run)")
        return 0

    log(f"[4/6] {args.batch_size:,}행 단위 배치 UPDATE")
    affected = backfill(engine, species_map, args.batch_size, args.progress_every)
    log(f"      UPDATE 영향 행 {affected:,}개")

    log("[5/6] 전체 집계 검증")
    sample_ids = [k for k, _ in sorted(species_map.items())[:: max(1, matched // 4)]][:5]
    result = verify(engine, sample_ids)
    log(f"      total={result['total_rows']:,} filled={result['filled_rows']:,} "
        f"non_object={result['non_object']:,} "
        f"missing_composition_key={result['missing_composition_key']:,}")

    log("[6/6] 표본 재조회")
    for s in result["samples"]:
        sc = s["species_composition"]
        if isinstance(sc, str):
            sc = json.loads(sc)
        dom = sc.get("dominant_species") if isinstance(sc, dict) else None
        log(f"      grid_id={s['grid_id']} dominant={dom}")

    log_path = write_failure_log({
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "matched": matched, "missing_forest": missing,
        "affected": affected, "summary": {
            k: result[k] for k in
            ("total_rows", "filled_rows", "non_object", "missing_composition_key")
        },
    })
    log(f"      결과 로그: {log_path}")

    if result["non_object"] or result["missing_composition_key"]:
        raise RuntimeError("백필 검증 실패: non_object 또는 composition 키 누락 존재.")
    if int(result["filled_rows"]) < matched:
        raise RuntimeError(
            f"filled_rows({result['filled_rows']}) < matched({matched})"
        )

    log(f"완료: species_composition 백필 {matched:,}행 검증 통과")
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
