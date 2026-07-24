"""data/generated_reports/{type}_30/문서목록.csv의 기존 샘플 보고서(약 90건)를
Supabase reports 테이블(002_reports.sql)로 옮기는 일회성 백필 스크립트.

컬럼 매핑은 app/services/report_template_service.py의 register_report()/
_insert_report_row()가 쓰는 것과 동일한 규칙을 그대로 재사용한다: document_no,
file_name, year, center_grid_id, sido_name, sigungu_name은 구조화 컬럼으로,
그 외 CSV의 나머지 필드(risk_score, risk_grade, prediction_link_status,
total_trees 등 report_type마다 다른 필드)는 JSONB data 컬럼에 그대로 저장한다.

document_no는 CSV에 있던 값을 그대로 쓴다(재계산하지 않음) — 기존에 만들어진
PDF/DOCX 파일명이 이미 이 번호를 참조하고 있기 때문.

사용법:
    cd rag-backend && ../venv/Scripts/python.exe scripts/backfill_reports_from_csv.py
먼저 몇 건이 처리될지 미리 보여주고, "yes" 입력 확인 후에만 실제 insert한다.
이미 존재하는 (report_type, document_no)는 건너뛰므로(ON CONFLICT DO NOTHING)
여러 번 실행해도 안전하다.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.report_template_service import (
    GENERATED_REPORT_ROOT,
    REPORT_DIRECTORIES,
)

# _insert_report_row()가 reports 테이블의 구조화 컬럼으로 쓰는 필드와 동일 —
# 이 키들은 JSONB data에 중복 저장하지 않는다.
STRUCTURED_KEYS = {
    "document_no",
    "file_name",
    "year",
    "center_grid_id",
    "sido_name",
    "sigungu_name",
}


def _read_csv_rows(report_type: str) -> list[dict[str, str]]:
    # 기존 app/api/reports.py의 CSV 기반 _read_rows()와 동일한 읽기 규칙.
    directory = GENERATED_REPORT_ROOT / REPORT_DIRECTORIES[report_type]
    csv_path = directory / "문서목록.csv"
    if not csv_path.is_file():
        return []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        return [
            {
                str(key).strip(): (value or "").strip()
                for key, value in row.items()
                if key is not None
            }
            for row in reader
        ]


def _to_report_row(report_type: str, csv_row: dict[str, str]) -> dict:
    document_no = csv_row.get("document_no", "").strip()
    if not document_no:
        raise ValueError(f"document_no가 없는 행이 있습니다: {csv_row}")
    data = {k: v for k, v in csv_row.items() if k not in STRUCTURED_KEYS}
    # 이 백필 대상 CSV들은 DOCX 없이 PDF만 있으므로 available_formats를
    # 미리 확정해서 저장한다 (app/api/reports.py의 _public_row()가 매 조회마다
    # Storage 존재 확인을 하지 않고 이 값을 그대로 읽는다).
    data["available_formats"] = ["pdf"]
    return {
        "report_type": report_type,
        "document_no": document_no,
        "file_name": csv_row.get("file_name", ""),
        "year": csv_row.get("year", ""),
        "center_grid_id": csv_row.get("center_grid_id", ""),
        "sido_name": csv_row.get("sido_name", ""),
        "sigungu_name": csv_row.get("sigungu_name", ""),
        "data": data,
    }


def main() -> None:
    all_rows: list[dict] = []
    per_type_counts: dict[str, int] = {}

    for report_type in REPORT_DIRECTORIES:
        csv_rows = _read_csv_rows(report_type)
        per_type_counts[report_type] = len(csv_rows)
        for csv_row in csv_rows:
            all_rows.append(_to_report_row(report_type, csv_row))

    print("=== 백필 대상 미리보기 ===")
    for report_type, count in per_type_counts.items():
        print(f"  {report_type}: {count}건")
    print(f"  합계: {len(all_rows)}건")

    if not all_rows:
        print("처리할 행이 없습니다. 종료합니다.")
        return

    print()
    print("샘플 3건:")
    for row in all_rows[:3]:
        print(
            f"  report_type={row['report_type']}, document_no={row['document_no']}, "
            f"file_name={row['file_name']}, sigungu_name={row['sigungu_name']}"
        )

    print()
    answer = input(
        f"위 {len(all_rows)}건을 reports 테이블에 insert합니다. 계속하시겠습니까? (yes 입력): "
    ).strip()
    if answer != "yes":
        print("취소되었습니다. 아무것도 insert하지 않았습니다.")
        return

    inserted = 0
    skipped = 0
    with SessionLocal() as session:
        for row in all_rows:
            result = session.execute(
                text(
                    """
                    insert into reports
                        (report_type, document_no, file_name, year,
                         center_grid_id, sido_name, sigungu_name, data)
                    values
                        (:report_type, :document_no, :file_name, :year,
                         :center_grid_id, :sido_name, :sigungu_name, cast(:data as jsonb))
                    on conflict (report_type, document_no) do nothing
                    """
                ),
                {
                    "report_type": row["report_type"],
                    "document_no": row["document_no"],
                    "file_name": row["file_name"],
                    "year": row["year"],
                    "center_grid_id": row["center_grid_id"],
                    "sido_name": row["sido_name"],
                    "sigungu_name": row["sigungu_name"],
                    "data": json.dumps(row["data"], ensure_ascii=False),
                },
            )
            if result.rowcount:
                inserted += 1
            else:
                skipped += 1
        session.commit()

    print()
    print(f"완료: {inserted}건 insert, {skipped}건 건너뜀(이미 존재하는 document_no)")


if __name__ == "__main__":
    main()
