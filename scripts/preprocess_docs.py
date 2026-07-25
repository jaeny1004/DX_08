#!/usr/bin/env python3
"""배포 전에 RAG 문서의 텍스트를 로컬에서 추출해 JSON 캐시로 저장한다."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
DEFAULT_DOCS_DIR = BACKEND_ROOT / "data" / "docs"
DEFAULT_CACHE_DIR = BACKEND_ROOT / "data" / "docs_text_cache"
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(PROJECT_ROOT / ".env")

from app.core.parsers import extract_pages_for_cache  # noqa: E402


def preprocess(docs_dir: Path, cache_dir: Path) -> list[dict]:
    sources = sorted(
        path
        for path in docs_dir.iterdir()
        if path.is_file() and path.suffix.lower() in {".hwp", ".pdf"}
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []

    for index, source in enumerate(sources, start=1):
        print(f"[{index}/{len(sources)}] {source.name}", flush=True)
        payload = extract_pages_for_cache(source)
        cache_path = cache_dir / f"{source.name}.json"
        cache_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        methods = Counter(page["method"] for page in payload["pages"])
        result = {
            "document_name": source.name,
            "cache_path": str(cache_path),
            "pages": len(payload["pages"]),
            "characters": sum(
                int(page["char_count"]) for page in payload["pages"]
            ),
            "methods": dict(sorted(methods.items())),
            "empty_pages": [
                page["page"]
                for page in payload["pages"]
                if not str(page["text"]).strip()
            ],
        }
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docs-dir", type=Path, default=DEFAULT_DOCS_DIR)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--summary-json", type=Path)
    args = parser.parse_args()

    results = preprocess(
        args.docs_dir.resolve(),
        args.cache_dir.resolve(),
    )
    if args.summary_json:
        args.summary_json.parent.mkdir(parents=True, exist_ok=True)
        args.summary_json.write_text(
            json.dumps(results, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    print(
        json.dumps(
            {
                "documents": len(results),
                "pages": sum(item["pages"] for item in results),
                "characters": sum(item["characters"] for item in results),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
