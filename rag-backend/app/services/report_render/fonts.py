"""reportlab용 한글 폰트 등록.

Vercel 등 서버리스 환경엔 시스템 폰트(맑은 고딕, NotoSansCJK 등)가 보장되지
않으므로, 로컬 OS 폰트 경로를 뒤지지 않고 처음부터 rag-backend/assets/fonts/에
번들된 정적 TTF만 사용한다 (출처/라이선스는 assets/fonts/README.md 참고).
"""
from __future__ import annotations

from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ASSETS_FONTS_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"

FONT_REGULAR = "NotoSansKR"
FONT_BOLD = "NotoSansKR-Bold"

_REGULAR_PATH = ASSETS_FONTS_DIR / "NotoSansKR-Regular.ttf"
_BOLD_PATH = ASSETS_FONTS_DIR / "NotoSansKR-Bold.ttf"

# 번들 폰트에 없는 것으로 확인된 글리프 → 시각적으로 가까운 대체 글리프.
# 원본 템플릿 텍스트나 report_template_service.py의 치환 딕셔너리는 그대로 두고,
# reportlab로 실제 그리기 직전에만 이 치환을 적용한다.
_GLYPH_FALLBACKS = {
    "❍": "○",  # ❍ (SHADOWED WHITE CIRCLE, 폰트에 없음) -> ○ (WHITE CIRCLE)
}

_registered = False


def register_fonts() -> None:
    """NotoSansKR Regular/Bold를 reportlab에 등록한다 (중복 호출해도 안전)."""
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
    """번들 폰트에 없는 글리프를 대체 글리프로 치환한 문자열을 반환한다."""
    for missing, fallback in _GLYPH_FALLBACKS.items():
        text = text.replace(missing, fallback)
    return text
