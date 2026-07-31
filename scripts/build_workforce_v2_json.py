from __future__ import annotations

import csv
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = PROJECT_ROOT / "data" / "workforce_v2"
OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "workforce_v2"

FILES = [
    "workers.csv",
    "worker_capabilities.csv",
    "worker_certifications.csv",
    "worker_service_areas.csv",
    "worker_availability.csv",
    "equipment.csv",
    "worker_current_status.csv",
    "field_tasks.csv",
    "region_workforce_capacity.csv",
]


def normalize_value(value: str):
    text = value.strip()
    if text == "":
        return ""

    lowered = text.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"

    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        return text


def convert_csv(csv_path: Path, json_path: Path) -> int:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        rows = [
            {key: normalize_value(value or "") for key, value in row.items()}
            for row in reader
        ]

    json_path.parent.mkdir(parents=True, exist_ok=True)
    with json_path.open("w", encoding="utf-8") as file:
        json.dump(rows, file, ensure_ascii=False, indent=2)

    return len(rows)


def main() -> None:
    if not SOURCE_DIR.exists():
        raise FileNotFoundError(
            f"새 현장요원 데이터 폴더가 없습니다: {SOURCE_DIR}"
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"입력 폴더: {SOURCE_DIR}")
    print(f"출력 폴더: {OUTPUT_DIR}\n")

    for filename in FILES:
        csv_path = SOURCE_DIR / filename
        if not csv_path.exists():
            raise FileNotFoundError(f"필수 CSV가 없습니다: {csv_path}")

        json_path = OUTPUT_DIR / f"{csv_path.stem}.json"
        row_count = convert_csv(csv_path, json_path)
        print(f"완료: {json_path.name} ({row_count:,}행)")

    print("\n현장요원 v2 JSON 변환이 완료되었습니다.")


if __name__ == "__main__":
    main()
