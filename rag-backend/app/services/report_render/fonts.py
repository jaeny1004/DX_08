"""ReportLab용 한글 폰트 선택과 등록.

우선 번들 TTF, 다음으로 Linux 시스템 폰트를 사용한다. 둘 다 없으면
ReportLab의 한국어 CID 폰트로 전환해 PDF 생성 자체가 실패하지 않게 한다.
"""
from __future__ import annotations

from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont

ASSETS_FONTS_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"

_BUNDLED_REGULAR = ASSETS_FONTS_DIR / "NotoSansKR-Regular.ttf"
_BUNDLED_BOLD = ASSETS_FONTS_DIR / "NotoSansKR-Bold.ttf"

_SYSTEM_FONT_PAIRS = [
    (
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    ),
    (
        Path("/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSansKR-Bold.ttf"),
    ),
    (
        Path("/usr/share/fonts/opentype/unfonts-core/UnDotum.ttf"),
        Path("/usr/share/fonts/opentype/unfonts-core/UnDotumBold.ttf"),
    ),
]

_FONT_MODE: str
_REGULAR_PATH: Path | None
_BOLD_PATH: Path | None

if _BUNDLED_REGULAR.is_file() and _BUNDLED_BOLD.is_file():
    _FONT_MODE = "bundled-ttf"
    _REGULAR_PATH = _BUNDLED_REGULAR
    _BOLD_PATH = _BUNDLED_BOLD
    FONT_REGULAR = "NotoSansKR"
    FONT_BOLD = "NotoSansKR-Bold"
else:
    _system_pair = next(
        (
            (regular, bold)
            for regular, bold in _SYSTEM_FONT_PAIRS
            if regular.is_file() and bold.is_file()
        ),
        None,
    )

    if _system_pair:
        _FONT_MODE = "system-ttf"
        _REGULAR_PATH, _BOLD_PATH = _system_pair
        FONT_REGULAR = "PineWiltKoreanRegular"
        FONT_BOLD = "PineWiltKoreanBold"
    else:
        _FONT_MODE = "builtin-cid"
        _REGULAR_PATH = None
        _BOLD_PATH = None
        FONT_REGULAR = "HYSMyeongJo-Medium"
        FONT_BOLD = "HYGothic-Medium"

# 선택 폰트에 없는 것으로 확인된 글리프를 가까운 문자로 교체한다.
_GLYPH_FALLBACKS = {
    "❍": "○",
}

_registered = False


def register_fonts() -> None:
    """현재 환경에서 선택된 한국어 폰트를 등록한다."""
    global _registered
    if _registered:
        return

    if _FONT_MODE in {"bundled-ttf", "system-ttf"}:
        if _REGULAR_PATH is None or _BOLD_PATH is None:
            raise RuntimeError("한국어 TTF 경로 선택 결과가 올바르지 않습니다.")
        pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(_REGULAR_PATH)))
        pdfmetrics.registerFont(TTFont(FONT_BOLD, str(_BOLD_PATH)))
    else:
        # 외부 파일이 필요 없는 ReportLab 내장 한국어 CID 폰트
        pdfmetrics.registerFont(UnicodeCIDFont(FONT_REGULAR))
        pdfmetrics.registerFont(UnicodeCIDFont(FONT_BOLD))

    print(f"[report-render] 한국어 PDF 폰트 등록 완료: {_FONT_MODE}")
    _registered = True


def for_pdf(text: str) -> str:
    """PDF 출력 직전에 지원하지 않는 일부 글리프를 치환한다."""
    for missing, fallback in _GLYPH_FALLBACKS.items():
        text = text.replace(missing, fallback)
    return text
