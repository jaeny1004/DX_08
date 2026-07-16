import os
import sys

from dotenv import load_dotenv

from app.core.chunker import chunk_pages
from app.core.embedder import Embedder
from app.core.parsers import parse
from app.core.store import make_store

SUPPORTED = (".pdf", ".hwp", ".hwpx")


def run(docs_dir: str, store, embedder) -> dict:
    report: dict = {}
    for name in sorted(os.listdir(docs_dir)):
        if not name.lower().endswith(SUPPORTED):
            continue
        path = os.path.join(docs_dir, name)
        try:
            pages = parse(path)
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
    docs_dir = os.environ.get("DOCS_DIR", "./data/docs")
    store = make_store()
    embedder = Embedder()
    report = run(docs_dir=docs_dir, store=store, embedder=embedder)
    _print_report(report)
    print(f"\n총 저장된 청크: {store.count()}")


if __name__ == "__main__":
    main()
