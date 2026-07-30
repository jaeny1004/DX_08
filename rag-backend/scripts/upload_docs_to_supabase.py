"""프로젝트 루트 data/docs/*.pdf를 Supabase Storage에 업로드하는 1회성 스크립트.

무료 플랜 기준 파일당 50MB 제한을 넘는 파일은 업로드에서 제외하고 목록으로만 보고한다.
버킷이 없으면 생성한다(비공개). 실행: python scripts/upload_docs_to_supabase.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.doc_storage import BUCKET, storage_key_for  # noqa: E402

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
DOCS_DIR = PROJECT_ROOT / "data" / "docs"
MAX_BYTES = 50 * 1024 * 1024  # 50MB


def main() -> None:
    load_dotenv(BACKEND_ROOT / ".env")

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

    for path in sorted(DOCS_DIR.glob("*.pdf")):
        size = path.stat().st_size
        if size > MAX_BYTES:
            skipped.append((path.name, size))
            continue

        storage_key = storage_key_for(path.name)
        data = path.read_bytes()
        client.storage.from_(BUCKET).upload(
            storage_key,
            data,
            {"content-type": "application/pdf", "upsert": "true"},
        )
        uploaded.append(path.name)
        print(f"업로드 완료: {path.name} -> {storage_key} ({size / 1024 / 1024:.1f}MB)")

    print("\n=== 결과 요약 ===")
    print(f"업로드 성공: {len(uploaded)}개")
    for name in uploaded:
        print(f"  - {name}")

    print(f"\n50MB 초과로 제외: {len(skipped)}개")
    for name, size in skipped:
        print(f"  - {name} ({size / 1024 / 1024:.1f}MB)")


if __name__ == "__main__":
    sys.exit(main())
