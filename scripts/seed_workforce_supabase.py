r"""public/data/workforce_v2/*.json 4개를 Supabase 테이블로 올린다.

배경
    요원 명단이 정적 JSON이라 모바일 앱(pine-app-main)이 읽을 수 없었다.
    011_workforce_and_dispatch.sql 로 만든 테이블에 같은 내용을 적재해
    웹과 앱이 한 곳을 보게 한다.

전제
    011 마이그레이션이 먼저 적용돼 있어야 한다.

사용법 (Windows PowerShell)
    .\rag-backend\venv\Scripts\python.exe .\scripts\seed_workforce_supabase.py

    기본은 rag-backend/.env 의 SUPABASE_URL / SUPABASE_KEY 를 쓴다.
    다른 프로젝트에 넣으려면 --url / --key 로 덮어쓴다.

    --dry-run 을 주면 변환 결과만 보여주고 전송하지 않는다.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "public" / "data" / "workforce_v2"
BACKEND_ENV = ROOT / "rag-backend" / ".env"

CHUNK = 500


def _bool(value) -> bool:
    """0/1, "0"/"1", true/false 를 모두 받아 bool 로 만든다."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "y", "yes"}


def _int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _text(value):
    """빈 문자열은 null 로 보낸다. date/timestamp 컬럼이 ''를 거부하기 때문이다."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def map_worker(row: dict) -> dict:
    return {
        "worker_id": row["worker_id"],
        "user_id": _int(row.get("user_id")),
        "worker_name": row["worker_name"],
        "organization": _text(row.get("organization")),
        "department": _text(row.get("department")),
        "position_name": _text(row.get("position_name")),
        "phone_masked": _text(row.get("phone_masked")),
        "home_sido_code": _text(row.get("home_sido_code")),
        "home_sido_name": _text(row.get("home_sido_name")),
        "home_sigungu_code": _text(row.get("home_sigungu_code")),
        "home_sigungu_name": _text(row.get("home_sigungu_name")),
        "base_location_name": _text(row.get("base_location_name")),
        "base_lat": _float(row.get("base_lat")),
        "base_lon": _float(row.get("base_lon")),
        "experience_years": _int(row.get("experience_years")),
        "daily_max_minutes": _int(row.get("daily_max_minutes")),
        "employment_status": _text(row.get("employment_status")),
        "is_dispatchable": _bool(row.get("is_dispatchable")),
        "dataset_version": _text(row.get("dataset_version")),
        "data_source": _text(row.get("data_source")),
        "is_sample": _bool(row.get("is_sample")),
        "import_batch_id": _text(row.get("import_batch_id")),
        "created_at": _text(row.get("created_at")),
        "updated_at": _text(row.get("updated_at")),
    }


def map_capability(row: dict) -> dict:
    return {
        "worker_capability_id": row["worker_capability_id"],
        "worker_id": row["worker_id"],
        "task_type": row["task_type"],
        "skill_level": _int(row.get("skill_level")),
        "can_work_solo": _bool(row.get("can_work_solo")),
        "is_primary_skill": _bool(row.get("is_primary_skill")),
        "valid_from": _text(row.get("valid_from")),
        "valid_until": _text(row.get("valid_until")),
        "is_active": _bool(row.get("is_active")),
        "dataset_version": _text(row.get("dataset_version")),
        "import_batch_id": _text(row.get("import_batch_id")),
    }


def map_availability(row: dict) -> dict:
    return {
        "availability_id": row["availability_id"],
        "worker_id": row["worker_id"],
        "work_date": _text(row.get("work_date")),
        "available_start_at": _text(row.get("available_start_at")),
        "available_end_at": _text(row.get("available_end_at")),
        "break_minutes": _int(row.get("break_minutes")),
        "capacity_minutes": _int(row.get("capacity_minutes")),
        "assigned_minutes": _int(row.get("assigned_minutes")),
        "remaining_minutes": _int(row.get("remaining_minutes")),
        "availability_status": _text(row.get("availability_status")),
        "reason": _text(row.get("reason")),
        "dataset_version": _text(row.get("dataset_version")),
        "import_batch_id": _text(row.get("import_batch_id")),
    }


def map_status(row: dict) -> dict:
    return {
        "worker_id": row["worker_id"],
        "status": _text(row.get("status")),
        "current_dispatch_id": _text(row.get("current_dispatch_id")),
        "current_task_id": _text(row.get("current_task_id")),
        "current_lat": _float(row.get("current_lat")),
        "current_lon": _float(row.get("current_lon")),
        "location_accuracy_m": _float(row.get("location_accuracy_m")),
        "battery_level": _int(row.get("battery_level")),
        "network_status": _text(row.get("network_status")),
        "last_seen_at": _text(row.get("last_seen_at")),
        "last_location_at": _text(row.get("last_location_at")),
        "status_updated_at": _text(row.get("status_updated_at")),
        "dataset_version": _text(row.get("dataset_version")),
        "import_batch_id": _text(row.get("import_batch_id")),
    }


# 순서가 중요하다. capabilities/availability/status 가 workers 를 FK 로 참조한다.
JOBS = [
    ("workers.json", "workforce_workers", "worker_id", map_worker),
    ("worker_capabilities.json", "workforce_capabilities", "worker_capability_id", map_capability),
    ("worker_availability.json", "workforce_availability", "availability_id", map_availability),
    ("worker_current_status.json", "workforce_status", "worker_id", map_status),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=None)
    parser.add_argument("--key", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_dotenv(BACKEND_ENV)
    url = (args.url or os.environ.get("SUPABASE_URL", "")).strip().rstrip("/")
    key = (args.key or os.environ.get("SUPABASE_KEY", "")).strip()

    if not url or not key:
        print("SUPABASE_URL / SUPABASE_KEY 를 찾지 못했다.")
        print(f"  확인한 파일: {BACKEND_ENV}")
        return 1

    print(f"대상: {url}")
    print(f"원본: {SRC_DIR}\n")

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # 같은 스크립트를 여러 번 돌려도 중복되지 않도록 upsert 로 넣는다.
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    with httpx.Client(timeout=120.0) as client:
        for filename, table, conflict_key, mapper in JOBS:
            path = SRC_DIR / filename
            if not path.is_file():
                print(f"[{table}] 원본 없음: {path}")
                return 1

            rows = json.loads(path.read_text(encoding="utf-8"))
            mapped = [mapper(r) for r in rows]

            if args.dry_run:
                print(f"[{table}] {len(mapped):,}건 (전송 안 함)")
                print(f"   예시: {json.dumps(mapped[0], ensure_ascii=False)[:160]}")
                continue

            sent = 0
            for start in range(0, len(mapped), CHUNK):
                chunk = mapped[start : start + CHUNK]
                res = client.post(
                    f"{url}/rest/v1/{table}",
                    params={"on_conflict": conflict_key},
                    headers=headers,
                    json=chunk,
                )
                if res.status_code >= 300:
                    print(f"[{table}] 실패 HTTP {res.status_code}")
                    print(f"   {res.text[:400]}")
                    if res.status_code == 404:
                        print("   -> 011_workforce_and_dispatch.sql 을 먼저 적용해야 한다.")
                    return 1
                sent += len(chunk)
                print(f"[{table}] {sent:,}/{len(mapped):,}", end="\r")

            print(f"[{table}] {sent:,}건 적재 완료      ")

    if args.dry_run:
        print("\ndry-run 종료")
        return 0

    # 실제로 들어갔는지 건수로 확인한다.
    print("\n적재 결과 확인")
    with httpx.Client(timeout=60.0) as client:
        for _, table, _, _ in JOBS:
            res = client.get(
                f"{url}/rest/v1/{table}",
                params={"select": "*"},
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Prefer": "count=exact",
                    "Range": "0-0",
                },
            )
            total = res.headers.get("content-range", "?").split("/")[-1]
            print(f"   {table:<26}{total:>8}행")

    return 0


if __name__ == "__main__":
    sys.exit(main())
