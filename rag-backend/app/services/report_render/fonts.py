"""reportlab용 한글 폰트 등록과 PDF 안전 문자 치환."""
from __future__ import annotations

from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ASSETS_FONTS_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"

FONT_REGULAR = "NotoSansKR"
FONT_BOLD = "NotoSansKR-Bold"

_REGULAR_PATH = ASSETS_FONTS_DIR / "NotoSansKR-Regular.ttf"
_BOLD_PATH = ASSETS_FONTS_DIR / "NotoSansKR-Bold.ttf"

# 현재 번들된 Noto Sans KR Korean subset은 한글은 포함하지만 아래 기호를
# 포함하지 않는다. 존재하지 않는 기호를 다른 미지원 기호(예: ○)로 바꾸면
# Vercel PDF에서도 다시 네모(속칭 엑박)가 되므로, 실제 cmap에 존재하는
# ASCII/기본 문장부호만 사용한다.
_GLYPH_FALLBACKS = {
    "Ⅰ": "I",
    "Ⅱ": "II",
    "Ⅲ": "III",
    "Ⅳ": "IV",
    "Ⅴ": "V",
    "□": "•",
    "❍": "·",
    "○": "·",
    "―": "-",
    "※": "*",
    "→": "->",
    "│": "|",
    "℃": "°C",
    "₀": "0",
    "₁": "1",
    "₂": "2",
    "₃": "3",
    "₄": "4",
    "₅": "5",
    "₆": "6",
    "₇": "7",
    "₈": "8",
    "₉": "9",
}

_registered = False


def register_fonts() -> None:
    """NotoSansKR Regular/Bold를 reportlab에 등록한다."""
    global _registered
    if _registered:
        return

    if not _REGULAR_PATH.is_file() or not _BOLD_PATH.is_file():
        raise FileNotFoundError(
            "번들 폰트를 찾을 수 없습니다. "
            f"{_REGULAR_PATH} / {_BOLD_PATH} 존재 여부를 확인하세요."
        )

    pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(_REGULAR_PATH)))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(_BOLD_PATH)))
    _registered = True


def for_pdf(text: str) -> str:
    """번들 폰트에 없는 글리프를 PDF 안전 문자로 치환한다."""
    for missing, fallback in _GLYPH_FALLBACKS.items():
        text = text.replace(missing, fallback)
    return text
