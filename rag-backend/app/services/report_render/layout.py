"""표지, 목차, 섹션 헤더 바 빌더."""
from __future__ import annotations

from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, Spacer, Table, TableStyle

from . import styles
from .fonts import FONT_BOLD, FONT_REGULAR, for_pdf


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
    # Table의 일반 문자열은 Paragraph처럼 for_pdf()를 자동으로 거치지 않는다.
    # 섹션 번호의 Ⅰ~Ⅴ도 반드시 여기에서 치환해야 엑박이 생기지 않는다.
    table = Table(
        [[for_pdf(roman), for_pdf(title)]],
        colWidths=[1.6 * cm, 14.4 * cm],
        rowHeights=[1 * cm],
    )
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


APPENDIX_CELL = ParagraphStyle(
    "AppendixCell",
    fontName=FONT_REGULAR,
    fontSize=7.5,
    leading=9.5,
    alignment=1,
)
APPENDIX_HEADER = ParagraphStyle(
    "AppendixHeader",
    parent=APPENDIX_CELL,
    fontName=FONT_BOLD,
    fontSize=7.5,
    leading=9,
)


def _table_paragraph(value: object, *, header: bool) -> Paragraph:
    text = escape(for_pdf(str(value))).replace("\n", "<br/>")
    return Paragraph(text, APPENDIX_HEADER if header else APPENDIX_CELL)


def build_appendix_table(
    headers: list[object],
    rows: list[list[object]],
    col_widths: list[float],
) -> Table:
    """8개 별지가 공유하는 A4 폭 표를 만든다."""
    if len(headers) != len(col_widths):
        raise ValueError(
            "별지 표 헤더와 열 너비 개수가 다릅니다: "
            f"{len(headers)} != {len(col_widths)}"
        )
    for index, row in enumerate(rows, start=1):
        if len(row) != len(headers):
            raise ValueError(
                f"별지 표 {index}행의 셀 수가 헤더와 다릅니다: "
                f"{len(row)} != {len(headers)}"
            )

    data = [
        [_table_paragraph(value, header=True) for value in headers],
        *[
            [_table_paragraph(value, header=False) for value in row]
            for row in rows
        ],
    ]
    table = Table(
        data,
        colWidths=col_widths,
        repeatRows=1,
        hAlign="CENTER",
    )
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111827")),
                ("GRID", (0, 0), (-1, -1), 0.55, colors.HexColor("#374151")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table
