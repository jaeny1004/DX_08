#!/usr/bin/env python3
r"""prediction_grid_static 행에 입지조건(site_conditions jsonb)을 백필한다.

010_site_conditions.sql로 컬럼을 먼저 추가한 뒤 실행한다.
terrain_pine_site_features_south_500m.csv의 중심 격자 *_mode 값을 한글로 해석해
테이블에 존재하는 grid_id에만 UPDATE한다. UNKNOWN 값은 해당 키를 null로 둔다.

기후대/토심 코드 매핑 근거:
- 기후대(climate_zone): 산림청 산림입지토양도 속성표(map.forest.go.kr forestAttrDescPopup)
  1=온대북부(6~9℃) 2=온대중부(9~12℃) 3=온대남부(12~14℃) 4=난대(14℃이상).
- 토심(soil_depth) 10/20/30: 얕음/보통/깊음 표준 3등급(수치 오름차순=깊어짐).
- 산림토양형은 site_label_mode 기호(B2 등)를 그대로 사용(표준 산림토양형 분류).

Windows PowerShell:
    .\rag-backend\venv\Scripts\python.exe .\scripts\backfill_site_conditions.py            # dry-run
    .\rag-backend\venv\Scripts\python.exe .\scripts\backfill_site_conditions.py --apply
"""
from __future__ import annotations

import argparse
import json
import math
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
TERRAIN_CSV = PROJECT_ROOT / "data" / "terrain_pine_site_features_south_500m.csv"
LOG_DIRECTORY = PROJECT_ROOT / "data" / "precompute_logs"

DEFAULT_BATCH_SIZE = 500
DEFAULT_PROGRESS_EVERY = 5_000

CLIMATE_ZONE = {
    "1": "온대북부", "2": "온대중부", "3": "온대남부", "4": "난대",
}
SOIL_DEPTH = {
    "10": "얕음", "20": "보통", "30": "깊음",
}


def log(message: str) -> None:
    print(message, flush=True)


def create_database_engine() -> Engine:
    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env")
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("rag-backend/.env에 DATABASE_URL이 필요합니다.")
    return create_engine(url, pool_pre_ping=True)


def load_target_grid_ids(engine: Engine) -> list[int]:
    with engine.connect() as connection:
        rows = connection.execute(
            text("select grid_id from prediction_grid_static order by grid_id")
        ).all()
    return [int(row.grid_id) for row in rows]


def _norm(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.upper() == "UNKNOWN":
        return None
    return s


def load_site_map(target_ids: set[int]) -> dict[int, dict[str, Any]]:
    df = pd.read_csv(
        TERRAIN_CSV,
        usecols=["id", "aspect_mean", "climate_zone_mode",
                 "soil_depth_mode", "site_label_mode"],
        low_memory=False,
    )
    df["id"] = df["id"].astype("int64")
    if df["id"].duplicated().any():
        dups = df.loc[df["id"].duplicated(), "id"].head(20).tolist()
        raise RuntimeError(f"terrain CSV 격자 ID 중복: {dups}")
    df = df[df["id"].isin(target_ids)].copy()

    result: dict[int, dict[str, Any]] = {}
    for row in df.itertuples(index=False):
        czone = _norm(getattr(row, "climate_zone_mode"))
        depth = _norm(getattr(row, "soil_depth_mode"))
        soil = _norm(getattr(row, "site_label_mode"))
        aspect = getattr(row, "aspect_mean")
        aspect_v = (
            None if aspect is None or (isinstance(aspect, float) and math.isnan(aspect))
            else round(float(aspect), 1)
        )
        payload = {
            "climate_zone": CLIMATE_ZONE.get(czone) if czone else None,
            "climate_zone_code": int(czone) if czone and czone.isdigit() else None,
            "forest_soil_type": soil,
            "soil_depth_class": SOIL_DEPTH.get(depth) if depth else None,
            "soil_depth_code": int(depth) if depth and depth.isdigit() else None,
            "aspect_deg": aspect_v,
        }
        # 모든 값이 비어있으면 저장하지 않는다(NULL 유지)
        if any(v is not None for v in payload.values()):
            result[int(row.id)] = payload
    return result


UPDATE_SQL = """
update prediction_grid_static as target
set site_conditions = source.payload::jsonb,
    updated_at = now()
from (values %s) as source(grid_id, payload)
where target.grid_id = source.grid_id
"""


def update_batch(engine: Engine, rows: Sequence[tuple[Any, ...]]) -> int:
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            execute_values(cur, UPDATE_SQL, list(rows),
                           template="(%s,%s)", page_size=len(rows))
            affected = cur.rowcount
        raw.commit()
        return affected
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()


def backfill(engine: Engine, site_map: dict[int, dict[str, Any]],
             batch_size: int, progress_every: int) -> int:
    items = sorted(site_map.items())
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
            log(f"      진행률 {processed:,}/{total:,} ({processed/total*100:.1f}%)")
            while next_progress <= processed:
                next_progress += progress_every
    return affected_total


def verify(engine: Engine, sample_ids: Sequence[int]) -> dict[str, Any]:
    with engine.connect() as connection:
        summary = dict(connection.execute(text(
            """
            select
              count(*) as total_rows,
              count(site_conditions) as filled_rows,
              count(*) filter (
                where site_conditions is not null
                  and jsonb_typeof(site_conditions) <> 'object'
              ) as non_object
            from prediction_grid_static
            """
        )).mappings().one())
        samples = [
            dict(r) for r in connection.execute(
                text("select grid_id, site_conditions "
                     "from prediction_grid_static "
                     "where grid_id = any(:ids) order by grid_id"),
                {"ids": list(sample_ids)},
            ).mappings()
        ]
    summary["samples"] = samples
    return summary


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="prediction_grid_static 입지조건 백필")
    p.add_argument("--apply", action="store_true", help="실제 Supabase UPDATE 수행")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    p.add_argument("--progress-every", type=int, default=DEFAULT_PROGRESS_EVERY)
    return p


def main() -> int:
    args = build_parser().parse_args()

    log("[1/5] Supabase 연결 확인")
    engine = create_database_engine()

    log("[2/5] prediction_grid_static grid_id 조회")
    target_ids = load_target_grid_ids(engine)
    log(f"      테이블 행 {len(target_ids):,}개")

    log("[3/5] terrain CSV 입지조건 로딩(테이블에 있는 id만)")
    site_map = load_site_map(set(target_ids))
    matched = len(site_map)
    log(f"      입지조건 매칭 {matched:,}개 / 전부 UNKNOWN(NULL) {len(target_ids)-matched:,}개")
    if matched == 0:
        log("      매칭 0개 — 중단"); return 2

    pid, preview = sorted(site_map.items())[0]
    log(f"      표본 grid_id={pid}: {json.dumps(preview, ensure_ascii=False)}")

    if not args.apply:
        log("[4/5] --apply 없음 → DB 변경 없이 종료(dry-run)")
        return 0

    log(f"[4/5] {args.batch_size:,}행 단위 배치 UPDATE")
    affected = backfill(engine, site_map, args.batch_size, args.progress_every)
    log(f"      UPDATE 영향 행 {affected:,}개")

    log("[5/5] 집계·표본 검증")
    sample_ids = [k for k, _ in sorted(site_map.items())[:: max(1, matched // 4)]][:5]
    result = verify(engine, sample_ids)
    log(f"      total={result['total_rows']:,} filled={result['filled_rows']:,} "
        f"non_object={result['non_object']:,}")
    for s in result["samples"]:
        sc = s["site_conditions"]
        if isinstance(sc, str):
            sc = json.loads(sc)
        log(f"      grid_id={s['grid_id']} {json.dumps(sc, ensure_ascii=False)}")

    LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIRECTORY / f"site_conditions_backfill_{datetime.now():%Y%m%d_%H%M%S}.json"
    log_path.write_text(json.dumps({
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "matched": matched, "affected": affected,
        "summary": {k: result[k] for k in ("total_rows", "filled_rows", "non_object")},
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"      결과 로그: {log_path}")

    if result["non_object"]:
        raise RuntimeError("백필 검증 실패: non_object 존재.")
    if int(result["filled_rows"]) < matched:
        raise RuntimeError(f"filled_rows({result['filled_rows']}) < matched({matched})")

    log(f"완료: site_conditions 백필 {matched:,}행 검증 통과")
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
