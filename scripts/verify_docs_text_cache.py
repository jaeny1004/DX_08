#!/usr/bin/env python3
"""문서 텍스트 캐시와 Supabase document_chunks의 완전 일치를 검증한다."""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
DOCS_DIR = PROJECT_ROOT / "data" / "docs"
CACHE_DIR = BACKEND_ROOT / "data" / "docs_text_cache"
LEGACY_DOCS_DIR = BACKEND_ROOT / "data" / "docs"
RESULT_PATH = (
    PROJECT_ROOT
    / "data"
    / "precompute_logs"
    / "docs_text_cache_verification_20260726.json"
)
sys.path.insert(0, str(BACKEND_ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(PROJECT_ROOT / ".env")

from app.core import parsers  # noqa: E402
from app.core.chunker import chunk_pages  # noqa: E402
from app.core.models import PageText  # noqa: E402
from app.core.supabase_store import SupabaseStore  # noqa: E402


def text_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def fetch_remote_rows() -> list[dict[str, Any]]:
    store = SupabaseStore(
        url=os.environ["SUPABASE_URL"],
        key=os.environ["SUPABASE_KEY"],
    )
    rows: list[dict[str, Any]] = []
    offset = 0
    batch_size = 1000
    while True:
        response = (
            store._client.table("document_chunks")
            .select("id,doc_name,page,text")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        batch = list(response.data or [])
        rows.extend(batch)
        if len(batch) < batch_size:
            return rows
        offset += batch_size


def main() -> int:
    sources = sorted(
        path
        for path in DOCS_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in {".hwp", ".pdf"}
    )
    calls = {"ocr_page": 0, "hwp5txt": 0, "libreoffice": 0}

    def forbidden_ocr(*_args, **_kwargs):
        calls["ocr_page"] += 1
        raise AssertionError("캐시 적중 중 _ocr_page가 호출됐습니다.")

    def forbidden_hwp(*_args, **_kwargs):
        calls["hwp5txt"] += 1
        raise AssertionError("캐시 적중 중 hwp5txt가 호출됐습니다.")

    def forbidden_libreoffice(*_args, **_kwargs):
        calls["libreoffice"] += 1
        raise AssertionError("캐시 적중 중 LibreOffice가 호출됐습니다.")

    parsers._ocr_page = forbidden_ocr
    parsers._hwp5txt = forbidden_hwp
    parsers._libreoffice_to_text = forbidden_libreoffice

    local_chunks = []
    order_checks: list[dict[str, Any]] = []
    for source in sources:
        cache_payload = json.loads(
            (CACHE_DIR / f"{source.name}.json").read_text(encoding="utf-8")
        )
        raw_pages = [
            PageText(page=int(row["page"]), text=str(row["text"]))
            for row in cache_payload["pages"]
        ]
        expected_pages = parsers._strip_boilerplate(raw_pages)
        actual_pages = parsers.parse(str(LEGACY_DOCS_DIR / source.name))
        exact_pages = [
            (page.page, page.text) for page in expected_pages
        ] == [
            (page.page, page.text) for page in actual_pages
        ]
        changed_pages = [
            {
                "page": raw.page,
                "raw_chars": len(raw.text),
                "stripped_chars": len(stripped.text),
                "raw_excerpt": raw.text[:180],
                "stripped_excerpt": stripped.text[:180],
            }
            for raw, stripped in zip(raw_pages, expected_pages)
            if raw.text != stripped.text
        ]
        order_checks.append(
            {
                "document_name": source.name,
                "cache_is_raw": bool(changed_pages),
                "changed_page_count": len(changed_pages),
                "parse_equals_strip_after_cache": exact_pages,
                "changed_page_samples": changed_pages[:2],
            }
        )
        local_chunks.extend(chunk_pages(actual_pages, doc_name=source.name))

    remote_rows = fetch_remote_rows()
    local_by_id = {
        chunk.id: {
            "id": chunk.id,
            "doc_name": chunk.doc_name,
            "page": chunk.page,
            "text": chunk.text,
        }
        for chunk in local_chunks
    }
    remote_by_id = {str(row["id"]): row for row in remote_rows}
    missing_remote = sorted(set(local_by_id) - set(remote_by_id))
    extra_remote = sorted(set(remote_by_id) - set(local_by_id))
    mismatched = sorted(
        chunk_id
        for chunk_id in set(local_by_id) & set(remote_by_id)
        if local_by_id[chunk_id] != remote_by_id[chunk_id]
    )

    ordered_ids = sorted(local_by_id)
    sample_indexes = sorted(
        {0, len(ordered_ids) // 4, len(ordered_ids) // 2,
         len(ordered_ids) * 3 // 4, len(ordered_ids) - 1}
    )
    samples = []
    for index in sample_indexes:
        chunk_id = ordered_ids[index]
        local = local_by_id[chunk_id]
        remote = remote_by_id.get(chunk_id, {})
        samples.append(
            {
                "id": chunk_id,
                "page": local["page"],
                "exact": local == remote,
                "local_sha256": text_sha256(local["text"]),
                "remote_sha256": text_sha256(str(remote.get("text", ""))),
                "local_text": local["text"],
                "remote_text": remote.get("text", ""),
            }
        )

    result = {
        "documents": len(sources),
        "cache_dependency_calls": calls,
        "boilerplate_order": {
            "all_parse_equals_strip_after_cache": all(
                item["parse_equals_strip_after_cache"]
                for item in order_checks
            ),
            "documents_with_raw_to_stripped_changes": sum(
                bool(item["changed_page_count"]) for item in order_checks
            ),
            "documents": order_checks,
        },
        "chunks": {
            "local_count": len(local_chunks),
            "remote_count": len(remote_rows),
            "missing_remote": missing_remote,
            "extra_remote": extra_remote,
            "mismatched": mismatched,
            "all_exact": (
                not missing_remote and not extra_remote and not mismatched
            ),
            "samples": samples,
        },
    }
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "documents": result["documents"],
                "cache_dependency_calls": calls,
                "boilerplate_order_exact": result["boilerplate_order"][
                    "all_parse_equals_strip_after_cache"
                ],
                "documents_with_boilerplate_changes": result[
                    "boilerplate_order"
                ]["documents_with_raw_to_stripped_changes"],
                "local_chunks": len(local_chunks),
                "remote_chunks": len(remote_rows),
                "missing_remote": len(missing_remote),
                "extra_remote": len(extra_remote),
                "mismatched": len(mismatched),
                "all_exact": result["chunks"]["all_exact"],
                "samples": [
                    {
                        "id": sample["id"],
                        "page": sample["page"],
                        "exact": sample["exact"],
                        "sha256": sample["local_sha256"],
                        "text_excerpt": sample["local_text"][:180],
                    }
                    for sample in samples
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    valid = (
        not any(calls.values())
        and result["boilerplate_order"]["all_parse_equals_strip_after_cache"]
        and result["chunks"]["all_exact"]
        and len(local_chunks) == 1196
    )
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
