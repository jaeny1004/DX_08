import io
import os
import re
import subprocess
import tempfile
import zipfile

import fitz  # PyMuPDF

from app.core.models import PageText


import re
from collections import Counter

# 쪽번호만 있는 줄: "10", "- 35 -", "– 4 –" 등
_PAGENUM_RE = re.compile(r"^\s*[-–—]?\s*\d{1,4}\s*[-–—]?\s*$")


def parse(path: str) -> list[PageText]:
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
    pages: list[PageText] = []
    doc = fitz.open(path)
    try:
        for i, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            if not text:
                text = _ocr_page(page)
            pages.append(PageText(page=i, text=text))
    finally:
        doc.close()
    return pages


def _ocr_page(page) -> str:
    # OCR은 tesseract/leptonica 환경에 의존한다. 실패하더라도 해당 페이지만
    # 비우고 문서 전체 파싱은 계속되도록 예외를 삼킨다.
    try:
        import pytesseract
        from PIL import Image

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
    text = _hwp5txt(path)
    if not text.strip():
        text = _libreoffice_to_text(path)
    return [PageText(page=1, text=text.strip())]


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
