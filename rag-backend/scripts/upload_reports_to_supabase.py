"""data/generated_reports/{type}_30/pdf/*.pdf를 Supabase Storage의 'reports'
비공개 버킷으로 업로드하는 1회성 스크립트 (upload_docs_to_supabase.py와 동일 패턴).

DOCX는 이번 백필 대상(90건)에 애초에 존재하지 않으므로 이번 스크립트 범위에서
제외한다 (register_report()가 실제로 docx를 Storage에 올리게 되면 그때 별도 처리).

무료 플랜 기준 파일당 50MB 제한을 넘는 파일은 업로드에서 제외하고 목록으로만 보고한다.
버킷이 없으면 생성한다(비공개).

먼저 몇 건이 처리될지 미리 보여주고, "yes" 입력 확인 후에만 실제 업로드한다.
이미 업로드된 키는 upsert로 덮어쓰므로 여러 번 실행해도 안전하다.

실행: python scripts/upload_reports_to_supabase.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.report_storage import BUCKET, storage_key_for  # noqa: E402
from app.services.report_template_service import (  # noqa: E402
    GENERATED_REPORT_ROOT,
    REPORT_DIRECTORIES,
)

MAX_BYTES = 50 * 1024 * 1024  # 50MB


def _iter_pdf_targets() -> list[tuple[str, Path]]:
    targets: list[tuple[str, Path]] = []
    for report_type in REPORT_DIRECTORIES:
        pdf_dir = GENERATED_REPORT_ROOT / REPORT_DIRECTORIES[report_type] / "pdf"
        if not pdf_dir.is_dir():
            continue
        for path in sorted(pdf_dir.glob("*.pdf")):
            targets.append((report_type, path))
    return targets


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")

    targets = _iter_pdf_targets()

    print("=== 업로드 대상 미리보기 ===")
    per_type_counts: dict[str, int] = {}
    for report_type, _path in targets:
        per_type_counts[report_type] = per_type_counts.get(report_type, 0) + 1
    for report_type in REPORT_DIRECTORIES:
        print(f"  {report_type}: {per_type_counts.get(report_type, 0)}건")
    print(f"  합계: {len(targets)}건")

    if not targets:
        print("업로드할 파일이 없습니다. 종료합니다.")
        return

    print()
    answer = input(
        f"위 {len(targets)}건을 Supabase Storage '{BUCKET}' 버킷에 업로드합니다. "
        "계속하시겠습니까? (yes 입력): "
    ).strip()
    if answer != "yes":
        print("취소되었습니다. 아무것도 업로드하지 않았습니다.")
        return

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]

    from supabase import create_client

    client = create_client(url, key)

    existing_buckets = {b.name for b in client.storage.list_buckets()}
    if BUCKET not in existing_buckets:
        client.storage.create_bucket(BUCKET, options={"public": False})
        print(f"버킷 생성: {BUCKET}")
    else:
        print(f"버킷 존재 확인: {BUCKET}")

    uploaded: list[str] = []
    skipped: list[tuple[str, int]] = []

    for report_type, path in targets:
        size = path.stat().st_size
        if size > MAX_BYTES:
            skipped.append((path.name, size))
            continue

        storage_key = storage_key_for(report_type, path.name)
        data = path.read_bytes()
        client.storage.from_(BUCKET).upload(
            storage_key,
            data,
            {"content-type": "application/pdf", "upsert": "true"},
        )
        uploaded.append(f"{report_type}/{path.name}")
        print(f"업로드 완료: {report_type}/{path.name} -> {storage_key} ({size / 1024 / 1024:.1f}MB)")

    print("\n=== 결과 요약 ===")
    print(f"업로드 성공: {len(uploaded)}개")

    print(f"\n50MB 초과로 제외: {len(skipped)}개")
    for name, size in skipped:
        print(f"  - {name} ({size / 1024 / 1024:.1f}MB)")


if __name__ == "__main__":
    main()
