import io
import json
import hashlib
import os
import re
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF

from app.core.models import PageText


from collections import Counter

CACHE_SCHEMA_VERSION = 1

# 쪽번호만 있는 줄: "10", "- 35 -", "– 4 –" 등
_PAGENUM_RE = re.compile(r"^\s*[-–—]?\s*\d{1,4}\s*[-–—]?\s*$")


def parse(path: str) -> list[PageText]:
    cached_pages = _load_cached_pages(path)
    if cached_pages is not None:
        return _strip_boilerplate(cached_pages)

    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        pages = _parse_pdf(path)
    elif ext == ".hwpx":
        pages = _parse_hwpx(path)
    elif ext == ".hwp":
        pages = _parse_hwp(path)
    else:
        raise ValueError(f"지원하지 않는 형식: {ext}")
    return _strip_boilerplate(pages)


def cache_path_for(path: str | Path) -> Path:
    source = Path(path)
    return source.parent.parent / "docs_text_cache" / f"{source.name}.json"


def _load_cached_pages(path: str | Path) -> list[PageText] | None:
    cache_path = cache_path_for(path)
    if not cache_path.is_file():
        return None
    payload = json.loads(cache_path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != CACHE_SCHEMA_VERSION:
        raise ValueError(
            f"지원하지 않는 문서 텍스트 캐시 버전입니다: {cache_path}"
        )
    if payload.get("document_name") != Path(path).name:
        raise ValueError(
            f"문서 텍스트 캐시의 원본 파일명이 일치하지 않습니다: {cache_path}"
        )
    return [
        PageText(page=int(item["page"]), text=str(item.get("text", "")))
        for item in payload.get("pages", [])
    ]


def source_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def extract_pages_for_cache(path: str | Path) -> dict:
    source = Path(path)
    ext = source.suffix.lower()
    if ext == ".pdf":
        page_rows = _extract_pdf_page_rows(str(source))
    elif ext == ".hwp":
        text, method = _extract_hwp_text(str(source))
        page_rows = [{"page": 1, "text": text, "method": method}]
    else:
        raise ValueError(f"전처리를 지원하지 않는 형식입니다: {ext}")

    return {
        "schema_version": CACHE_SCHEMA_VERSION,
        "document_name": source.name,
        "source_extension": ext,
        "source_sha256": source_sha256(source),
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "pages": [
            {
                **row,
                "char_count": len(str(row.get("text", ""))),
            }
            for row in page_rows
        ],
    }


def _strip_boilerplate(pages: list[PageText]) -> list[PageText]:
    """여러 페이지에 반복되는 머리말/꼬리말과 쪽번호 줄을 제거한다.

    반복 머리말(문서 제목 등)과 쪽번호는 짧고 주제어가 밀집해 있어 검색 상위를
    독점하고 실제 내용 청크를 밀어낸다. 페이지의 절반 이상에 나타나는 짧은 줄을
    보일러플레이트로 보고 제거한다. 4페이지 미만 문서는 그대로 둔다.
    """
    if len(pages) < 4:
        return pages
    line_lists = [[ln.strip() for ln in p.text.split("\n")] for p in pages]
    freq: Counter = Counter()
    for lines in line_lists:
        for ln in {l for l in lines if l}:  # 페이지당 1회만 카운트
            freq[ln] += 1
    threshold = max(3, len(pages) // 2)
    boiler = {ln for ln, c in freq.items() if c >= threshold and len(ln) < 60}
    out: list[PageText] = []
    for p, lines in zip(pages, line_lists):
        kept = [
            ln for ln in lines if ln and ln not in boiler and not _PAGENUM_RE.match(ln)
        ]
        out.append(PageText(page=p.page, text="\n".join(kept)))
    return out


def _parse_pdf(path: str) -> list[PageText]:
    return [
        PageText(page=int(row["page"]), text=str(row["text"]))
        for row in _extract_pdf_page_rows(path)
    ]


def _extract_pdf_page_rows(path: str) -> list[dict]:
    pages: list[dict] = []
    doc = fitz.open(path)
    try:
        for i, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            method = "embedded_text"
            if not text:
                text = _ocr_page(page)
                method = "tesseract_ocr"
            pages.append({"page": i, "text": text, "method": method})
    finally:
        doc.close()
    return pages


def _ocr_page(page) -> str:
    # OCR은 tesseract/leptonica 환경에 의존한다. 실패하더라도 해당 페이지만
    # 비우고 문서 전체 파싱은 계속되도록 예외를 삼킨다.
    try:
        import pytesseract
        from PIL import Image

        tesseract_cmd = os.environ.get("TESSERACT_CMD")
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        # --psm 4(가변 크기 단일 컬럼): 다단·표·인포그래픽 페이지에서 psm6/psm3보다
        # 훨씬 많은 텍스트를 읽기 순서를 보존하며 추출한다.
        return pytesseract.image_to_string(img, lang="kor", config="--psm 4").strip()
    except Exception:
        return ""


def _parse_hwpx(path: str) -> list[PageText]:
    texts: list[str] = []
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if re.match(r"Contents/section\d+\.xml", n))
        for name in names:
            xml = z.read(name).decode("utf-8", errors="ignore")
            # <t> ... </t> 안의 텍스트만 추출
            for m in re.findall(r"<t[^>]*>(.*?)</t>", xml, flags=re.DOTALL):
                cleaned = re.sub(r"<[^>]+>", "", m).strip()
                if cleaned:
                    texts.append(cleaned)
    return [PageText(page=1, text="\n".join(texts))]


def _parse_hwp(path: str) -> list[PageText]:
    text, _ = _extract_hwp_text(path)
    return [PageText(page=1, text=text.strip())]


def _extract_hwp_text(path: str) -> tuple[str, str]:
    text = _hwp5txt(path)
    if text.strip():
        return text.strip(), "hwp5txt"
    text = _libreoffice_to_text(path)
    return text.strip(), "libreoffice_fallback"


def _hwp5txt(path: str) -> str:
    try:
        out = subprocess.run(
            ["hwp5txt", path], capture_output=True, timeout=120, check=True
        )
        return out.stdout.decode("utf-8", errors="ignore")
    except (subprocess.SubprocessError, FileNotFoundError):
        return ""


def _libreoffice_to_text(path: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            subprocess.run(
                ["soffice", "--headless", "--convert-to", "txt:Text",
                 "--outdir", tmp, path],
                capture_output=True, timeout=180, check=True,
            )
        except (subprocess.SubprocessError, FileNotFoundError):
            return ""
        base = os.path.splitext(os.path.basename(path))[0] + ".txt"
        out_path = os.path.join(tmp, base)
        if not os.path.exists(out_path):
            return ""
        with open(out_path, encoding="utf-8", errors="ignore") as f:
            return f.read()
