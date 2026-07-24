"""표지, 목차, 섹션 헤더 바(Ⅰ│ │제목) 빌더."""
from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, Spacer, Table, TableStyle

from . import styles
from .fonts import FONT_BOLD, for_pdf


def build_cover(main_title: str, subtitle: str) -> list:
    return [
        Spacer(1, 8 * cm),
        Paragraph(for_pdf(main_title), styles.COVER_TITLE),
        Paragraph(for_pdf(subtitle), styles.COVER_SUBTITLE),
        PageBreak(),
    ]


def build_toc(entries: list[str]) -> list:
    story: list = [Paragraph("목    차", styles.TOC_TITLE)]
    for entry in entries:
        story.append(Paragraph(for_pdf(entry), styles.TOC_ENTRY))
    story.append(PageBreak())
    return story


def build_section_bar(roman: str, title: str) -> Table:
    table = Table([[roman, title]], colWidths=[1.6 * cm, 14.4 * cm], rowHeights=[1 * cm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT_BOLD),
                ("FONTSIZE", (0, 0), (0, 0), 16),
                ("FONTSIZE", (1, 0), (1, 0), 13),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (1, 0), (1, 0), 10),
            ]
        )
    )
    return table
