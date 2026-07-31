"""본문 렌더링용 ParagraphStyle 정의."""
from __future__ import annotations

from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle

from .fonts import FONT_BOLD, FONT_REGULAR

COVER_TITLE = ParagraphStyle(
    "CoverTitle", fontName=FONT_BOLD, fontSize=22, leading=30,
    alignment=TA_CENTER, spaceAfter=12,
)
COVER_SUBTITLE = ParagraphStyle(
    "CoverSubtitle", fontName=FONT_REGULAR, fontSize=13, leading=18,
    alignment=TA_CENTER,
)
DATE_LINE = ParagraphStyle(
    "DateLine", fontName=FONT_REGULAR, fontSize=10, leading=14,
    alignment=TA_RIGHT, spaceAfter=10,
)

TOC_TITLE = ParagraphStyle(
    "TocTitle", fontName=FONT_BOLD, fontSize=16, leading=22,
    alignment=TA_CENTER, spaceAfter=14,
)
TOC_ENTRY = ParagraphStyle(
    "TocEntry", fontName=FONT_REGULAR, fontSize=11, leading=20,
)

# □ 소제목
SECTION_SUBHEAD = ParagraphStyle(
    "SectionSubhead", fontName=FONT_BOLD, fontSize=12.5, leading=18,
    spaceBefore=10, spaceAfter=4,
)
# ❍(->○) 본문 항목
BODY_MAIN = ParagraphStyle(
    "BodyMain", fontName=FONT_REGULAR, fontSize=10.5, leading=16,
    leftIndent=8, spaceAfter=2,
)
# ― 하위 항목
BODY_SUB = ParagraphStyle(
    "BodySub", fontName=FONT_REGULAR, fontSize=10, leading=15,
    leftIndent=20, spaceAfter=2,
)
