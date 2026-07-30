import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from app.core.chunker import chunk_pages
from app.core.embedder import Embedder
from app.core.parsers import parse
from app.core.store import make_store

SUPPORTED = (".pdf", ".hwp", ".hwpx")
BACKEND_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_ROOT.parent
DEFAULT_DOCS_DIR = PROJECT_ROOT / "data" / "docs"
DOCS_TEXT_CACHE_DIR = BACKEND_ROOT / "data" / "docs_text_cache"
LEGACY_DOCS_DIR = BACKEND_ROOT / "data" / "docs"


def run(docs_dir: str, store, embedder) -> dict:
    report: dict = {}
    for name in sorted(os.listdir(docs_dir)):
        if not name.lower().endswith(SUPPORTED):
            continue
        path = Path(docs_dir) / name
        try:
            cache_path = DOCS_TEXT_CACHE_DIR / f"{name}.json"
            parse_path = LEGACY_DOCS_DIR / name if cache_path.is_file() else path
            pages = parse(str(parse_path))
            chunks = chunk_pages(pages, doc_name=name)
            if chunks:
                vectors = embedder.embed([c.text for c in chunks])
                for c, v in zip(chunks, vectors):
                    c.embedding = v
                store.add(chunks)
            total_chars = sum(len(p.text) for p in pages)
            report[name] = {"chunks": len(chunks), "chars": total_chars, "error": None}
        except Exception as exc:  # 한 문서 실패가 전체를 막지 않음
            report[name] = {"chunks": 0, "chars": 0, "error": str(exc)}
    return report


def _print_report(report: dict) -> None:
    print("\n=== 인제스트 리포트 ===")
    for name, info in report.items():
        if info["error"]:
            print(f"  [실패] {name}: {info['error']}")
        else:
            flag = "  [주의:빈문서]" if info["chars"] == 0 else ""
            print(f"  [완료] {name}: {info['chunks']}청크, {info['chars']}자{flag}")


def main() -> None:
    load_dotenv()
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY가 없습니다. .env를 확인하세요.")
    docs_dir = os.environ.get("DOCS_DIR", str(DEFAULT_DOCS_DIR))
    store = make_store()
    embedder = Embedder()
    report = run(docs_dir=docs_dir, store=store, embedder=embedder)
    _print_report(report)
    print(f"\n총 저장된 청크: {store.count()}")


if __name__ == "__main__":
    main()
