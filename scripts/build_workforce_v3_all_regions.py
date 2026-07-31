from __future__ import annotations

import csv
import json
import math
import random
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
GEOJSON_PATH = PROJECT_ROOT / "public" / "data" / "final_ui_candidate_v4.geojson"
CSV_DIR = PROJECT_ROOT / "data" / "workforce_v2"
JSON_DIR = PROJECT_ROOT / "public" / "data" / "workforce_v2"
ZIP_PATH = PROJECT_ROOT / "data" / "workforce_v2_all_regions_csv"

RANDOM_SEED = 20260718
WORK_DATE = "2026-07-18"
DATASET_VERSION = "3.0"
IMPORT_BATCH_ID = "WF_V3_ALL_REGIONS_20260718"

SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황"]
GIVEN_NAMES = [
    "민준", "서준", "도윤", "예준", "시우", "주원", "하준", "지호",
    "서연", "서윤", "하윤", "지우", "지민", "채원", "수아", "예은",
    "태현", "현우", "준호", "민서", "유진", "다은", "수빈", "은우",
]

def normalize_code(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text

def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

def write_json(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(rows, file, ensure_ascii=False, indent=2)

def extract_regions() -> list[dict]:
    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"GeoJSON 파일이 없습니다: {GEOJSON_PATH}")

    with GEOJSON_PATH.open("r", encoding="utf-8") as file:
        geojson = json.load(file)

    region_map: dict[str, dict] = {}

    for feature in geojson.get("features", []):
        props = feature.get("properties") or {}
        sigungu_code = normalize_code(props.get("sigungu_code"))
        if not sigungu_code:
            continue

        sido_code = normalize_code(props.get("sido_code"))
        sido_name = str(props.get("sido_name") or "")
        sigungu_name = str(props.get("sigungu_name") or "")

        region = region_map.setdefault(
            sigungu_code,
            {
                "sido_code": sido_code,
                "sido_name": sido_name,
                "sigungu_code": sigungu_code,
                "sigungu_name": sigungu_name,
                "grid_count": 0,
                "priority_count": 0,
                "risk_total": 0.0,
                "lat_total": 0.0,
                "lon_total": 0.0,
                "coord_count": 0,
            },
        )

        region["grid_count"] += 1
        priority = str(
            props.get("field_priority_grade_v3")
            or props.get("priority_grade_v3")
            or ""
        )
        if priority in {"최우선 예찰", "우선 예찰"}:
            region["priority_count"] += 1
        try:
            region["risk_total"] += float(props.get("risk_score") or 0)
        except (TypeError, ValueError):
            pass

        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates")
        if geometry.get("type") == "Polygon" and coordinates:
            ring = coordinates[0]
        elif geometry.get("type") == "MultiPolygon" and coordinates:
            ring = coordinates[0][0]
        else:
            ring = []

        if ring:
            lon = sum(float(point[0]) for point in ring) / len(ring)
            lat = sum(float(point[1]) for point in ring) / len(ring)
            region["lat_total"] += lat
            region["lon_total"] += lon
            region["coord_count"] += 1

    regions = []
    for region in region_map.values():
        count = max(region["grid_count"], 1)
        coord_count = max(region["coord_count"], 1)
        region["avg_risk_score"] = round(region["risk_total"] / count, 2)
        region["base_lat"] = round(region["lat_total"] / coord_count, 6)
        region["base_lon"] = round(region["lon_total"] / coord_count, 6)
        regions.append(region)

    return sorted(regions, key=lambda item: item["sigungu_code"])

def build_dataset(regions: list[dict]) -> dict[str, list[dict]]:
    random.seed(RANDOM_SEED)

    workers: list[dict] = []
    capabilities: list[dict] = []
    service_areas: list[dict] = []
    availability: list[dict] = []
    current_status: list[dict] = []
    capacity: list[dict] = []

    regions_by_sido: dict[str, list[dict]] = defaultdict(list)
    for region in regions:
        regions_by_sido[region["sido_code"]].append(region)

    worker_index = 1
    capability_index = 1
    service_index = 1
    availability_index = 1

    for region in regions:
        # Every selectable region gets at least 6 workers.
        # Regions with more candidate grids receive additional workers.
        extra = min(6, region["grid_count"] // 700)
        worker_count = 6 + extra

        region_worker_ids: list[str] = []
        available_count = 0
        survey_count = 0
        drone_count = 0
        control_count = 0
        remaining_total = 0

        same_sido_regions = [
            item for item in regions_by_sido[region["sido_code"]]
            if item["sigungu_code"] != region["sigungu_code"]
        ]

        for local_index in range(worker_count):
            worker_id = f"W{worker_index:05d}"
            region_worker_ids.append(worker_id)
            worker_index += 1

            worker_name = (
                SURNAMES[(worker_index + local_index) % len(SURNAMES)]
                + GIVEN_NAMES[(worker_index * 3 + local_index) % len(GIVEN_NAMES)]
            )

            lat_jitter = random.uniform(-0.025, 0.025)
            lon_jitter = random.uniform(-0.025, 0.025)

            workers.append({
                "worker_id": worker_id,
                "user_id": 30000 + worker_index,
                "worker_name": worker_name,
                "organization": f"{region['sigungu_name']} 산림관리부서",
                "department": "산림재해대응팀" if local_index % 2 == 0 else "현장지원팀",
                "position_name": "주무관" if local_index % 3 == 0 else "현장대응원",
                "phone_masked": f"010-****-{4000 + worker_index:04d}"[-13:],
                "home_sido_code": region["sido_code"],
                "home_sido_name": region["sido_name"],
                "home_sigungu_code": region["sigungu_code"],
                "home_sigungu_name": region["sigungu_name"],
                "base_location_name": f"{region['sigungu_name']} 현장지원 거점",
                "base_lat": round(region["base_lat"] + lat_jitter, 6),
                "base_lon": round(region["base_lon"] + lon_jitter, 6),
                "experience_years": 2 + (local_index % 13),
                "daily_max_minutes": 480,
                "employment_status": "ACTIVE",
                "is_dispatchable": 1,
                "dataset_version": DATASET_VERSION,
                "data_source": "SYNTHETIC",
                "is_sample": 1,
                "import_batch_id": IMPORT_BATCH_ID,
                "created_at": f"{WORK_DATE} 08:00:00",
                "updated_at": f"{WORK_DATE} 08:00:00",
            })

            # Guaranteed capability coverage in every region.
            task_types = ["SURVEY"]
            if local_index in {0, 1}:
                task_types.append("DRONE")
            if local_index in {1, 2, 3}:
                task_types.append("CONTROL")
            if local_index >= 4 and local_index % 2 == 0:
                task_types.append("CONTROL")

            for task_position, task_type in enumerate(dict.fromkeys(task_types)):
                skill_level = 1 + ((local_index + task_position) % 3)
                capabilities.append({
                    "worker_capability_id": f"WC{capability_index:06d}",
                    "worker_id": worker_id,
                    "task_type": task_type,
                    "skill_level": skill_level,
                    "can_work_solo": 1 if skill_level >= 2 else 0,
                    "is_primary_skill": 1 if task_position == 0 else 0,
                    "valid_from": "2026-01-01",
                    "valid_until": "",
                    "is_active": 1,
                    "dataset_version": DATASET_VERSION,
                    "import_batch_id": IMPORT_BATCH_ID,
                })
                capability_index += 1

                if task_type == "SURVEY":
                    survey_count += 1
                elif task_type == "DRONE":
                    drone_count += 1
                elif task_type == "CONTROL":
                    control_count += 1

            service_areas.append({
                "service_area_id": f"SA{service_index:06d}",
                "worker_id": worker_id,
                "sido_code": region["sido_code"],
                "sido_name": region["sido_name"],
                "sigungu_code": region["sigungu_code"],
                "sigungu_name": region["sigungu_name"],
                "emd_code": "",
                "service_area_level": "SIGUNGU",
                "assignment_priority": 1,
                "is_primary_area": 1,
                "max_travel_km": 35,
                "support_type": "PRIMARY",
                "is_active": 1,
                "dataset_version": DATASET_VERSION,
                "import_batch_id": IMPORT_BATCH_ID,
            })
            service_index += 1

            if same_sido_regions:
                neighbor = same_sido_regions[(local_index + worker_index) % len(same_sido_regions)]
                service_areas.append({
                    "service_area_id": f"SA{service_index:06d}",
                    "worker_id": worker_id,
                    "sido_code": neighbor["sido_code"],
                    "sido_name": neighbor["sido_name"],
                    "sigungu_code": neighbor["sigungu_code"],
                    "sigungu_name": neighbor["sigungu_name"],
                    "emd_code": "",
                    "service_area_level": "SIGUNGU",
                    "assignment_priority": 2,
                    "is_primary_area": 0,
                    "max_travel_km": 90,
                    "support_type": "NEIGHBOR_SUPPORT",
                    "is_active": 1,
                    "dataset_version": DATASET_VERSION,
                    "import_batch_id": IMPORT_BATCH_ID,
                })
                service_index += 1

            # Most workers are immediately recommendable.
            is_available = local_index < max(4, worker_count - 1)
            availability_status = "AVAILABLE" if is_available else "OFF_DUTY"
            assigned_minutes = 30 * (local_index % 4) if is_available else 0
            remaining_minutes = 420 - assigned_minutes if is_available else 0

            availability.append({
                "availability_id": f"AV{availability_index:06d}",
                "worker_id": worker_id,
                "work_date": WORK_DATE,
                "available_start_at": "09:00",
                "available_end_at": "18:00",
                "break_minutes": 60,
                "capacity_minutes": 420,
                "assigned_minutes": assigned_minutes,
                "remaining_minutes": remaining_minutes,
                "availability_status": availability_status,
                "reason": "" if is_available else "비번",
                "dataset_version": DATASET_VERSION,
                "import_batch_id": IMPORT_BATCH_ID,
            })
            availability_index += 1

            status = "AVAILABLE" if is_available else "OFF_DUTY"
            current_status.append({
                "worker_id": worker_id,
                "status": status,
                "current_dispatch_id": "",
                "current_task_id": "",
                "current_lat": round(region["base_lat"] + lat_jitter, 6),
                "current_lon": round(region["base_lon"] + lon_jitter, 6),
                "location_accuracy_m": round(random.uniform(6, 20), 1),
                "battery_level": 65 + (local_index * 7) % 35,
                "network_status": "ONLINE" if is_available else "OFFLINE",
                "last_seen_at": f"{WORK_DATE} 08:55:00",
                "last_location_at": f"{WORK_DATE} 08:55:00",
                "status_updated_at": f"{WORK_DATE} 08:55:00",
                "dataset_version": DATASET_VERSION,
                "import_batch_id": IMPORT_BATCH_ID,
            })

            if is_available:
                available_count += 1
                remaining_total += remaining_minutes

        estimated_demand = max(
            240,
            region["priority_count"] * 90,
            int(region["grid_count"] * 4),
        )
        shortage = max(0, math.ceil((estimated_demand - remaining_total) / 420))

        capacity.append({
            "work_date": WORK_DATE,
            "sido_code": region["sido_code"],
            "sido_name": region["sido_name"],
            "sigungu_code": region["sigungu_code"],
            "sigungu_name": region["sigungu_name"],
            "registered_worker_count": worker_count,
            "available_worker_count": available_count,
            "survey_available_count": min(survey_count, available_count),
            "drone_available_count": min(drone_count, available_count),
            "control_available_count": min(control_count, available_count),
            "total_available_minutes": available_count * 420,
            "assigned_minutes": available_count * 420 - remaining_total,
            "remaining_minutes": remaining_total,
            "open_task_count": region["priority_count"],
            "estimated_demand_minutes": estimated_demand,
            "shortage_worker_count": shortage,
            "support_required": 1 if shortage > 0 else 0,
            "dataset_version": DATASET_VERSION,
            "import_batch_id": IMPORT_BATCH_ID,
        })

    return {
        "workers": workers,
        "worker_capabilities": capabilities,
        "worker_service_areas": service_areas,
        "worker_availability": availability,
        "worker_current_status": current_status,
        "region_workforce_capacity": capacity,
    }

def main() -> None:
    regions = extract_regions()
    if not regions:
        raise RuntimeError("GeoJSON에서 시군구 정보를 찾지 못했습니다.")

    data = build_dataset(regions)

    fieldnames = {
        "workers": [
            "worker_id", "user_id", "worker_name", "organization", "department",
            "position_name", "phone_masked", "home_sido_code", "home_sido_name",
            "home_sigungu_code", "home_sigungu_name", "base_location_name",
            "base_lat", "base_lon", "experience_years", "daily_max_minutes",
            "employment_status", "is_dispatchable", "dataset_version",
            "data_source", "is_sample", "import_batch_id", "created_at", "updated_at",
        ],
        "worker_capabilities": [
            "worker_capability_id", "worker_id", "task_type", "skill_level",
            "can_work_solo", "is_primary_skill", "valid_from", "valid_until",
            "is_active", "dataset_version", "import_batch_id",
        ],
        "worker_service_areas": [
            "service_area_id", "worker_id", "sido_code", "sido_name",
            "sigungu_code", "sigungu_name", "emd_code", "service_area_level",
            "assignment_priority", "is_primary_area", "max_travel_km",
            "support_type", "is_active", "dataset_version", "import_batch_id",
        ],
        "worker_availability": [
            "availability_id", "worker_id", "work_date", "available_start_at",
            "available_end_at", "break_minutes", "capacity_minutes",
            "assigned_minutes", "remaining_minutes", "availability_status",
            "reason", "dataset_version", "import_batch_id",
        ],
        "worker_current_status": [
            "worker_id", "status", "current_dispatch_id", "current_task_id",
            "current_lat", "current_lon", "location_accuracy_m", "battery_level",
            "network_status", "last_seen_at", "last_location_at",
            "status_updated_at", "dataset_version", "import_batch_id",
        ],
        "region_workforce_capacity": [
            "work_date", "sido_code", "sido_name", "sigungu_code",
            "sigungu_name", "registered_worker_count", "available_worker_count",
            "survey_available_count", "drone_available_count",
            "control_available_count", "total_available_minutes",
            "assigned_minutes", "remaining_minutes", "open_task_count",
            "estimated_demand_minutes", "shortage_worker_count",
            "support_required", "dataset_version", "import_batch_id",
        ],
    }

    for name, rows in data.items():
        write_csv(CSV_DIR / f"{name}.csv", rows, fieldnames[name])
        write_json(JSON_DIR / f"{name}.json", rows)

    metadata = [{
        "dataset_version": DATASET_VERSION,
        "data_source": "SYNTHETIC",
        "is_sample": 1,
        "import_batch_id": IMPORT_BATCH_ID,
        "region_count": len(regions),
        "worker_count": len(data["workers"]),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "note": "시연용 합성 데이터. 실제 기관·인력 현황이 아님.",
    }]
    write_csv(
        CSV_DIR / "README_metadata.csv",
        metadata,
        list(metadata[0].keys()),
    )
    write_json(JSON_DIR / "README_metadata.json", metadata)

    archive = shutil.make_archive(
        str(ZIP_PATH),
        "zip",
        root_dir=CSV_DIR,
    )

    print("=" * 70)
    print("전체 시군구 현장요원 데이터 생성 완료")
    print(f"시군구 수: {len(regions):,}")
    print(f"요원 수: {len(data['workers']):,}")
    print(f"CSV 폴더: {CSV_DIR}")
    print(f"JSON 폴더: {JSON_DIR}")
    print(f"ZIP 파일: {archive}")
    print("=" * 70)

if __name__ == "__main__":
    main()
