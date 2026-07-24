"""report_type + draft -> PDF 바이트. 별지는 아직 자리표시 페이지만 붙인다."""
from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate

from .appendix_stub import build_appendix_stub_pages
from .content import build_body_story
from .fonts import register_fonts


def render_report_pdf(report_type: str, draft: dict[str, Any]) -> bytes:
    register_fonts()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=2.2 * cm,
        bottomMargin=2 * cm,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
    )
    story = build_body_story(report_type, draft)
    story.extend(build_appendix_stub_pages(report_type))
    doc.build(story)
    return buffer.getvalue()
