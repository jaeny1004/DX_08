"""별지 자리표시 페이지 — 다음 단계에서 실제 내용으로 교체 예정."""
from __future__ import annotations

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import PageBreak, Paragraph

from .fonts import FONT_BOLD, for_pdf

STUB_STYLE = ParagraphStyle(
    "AppendixStub", fontName=FONT_BOLD, fontSize=14,
    alignment=TA_CENTER, spaceBefore=250,
)

# report_template_service.py의 TEMPLATE_FILES/별지 순서(지난 조사 결과)와 동일한 제목.
APPENDIX_TITLES: dict[str, list[str]] = {
    "prediction": [
        "감염의심목등 신고처리 접수 대장",
        "유인항공 예찰 계획",
    ],
    "field_survey": [
        "유인항공 예찰 계획",
        "유인항공 예찰 조사 결과",
    ],
    "control": [
        "재선충병 방제사업 계획서",
        "방제조치 명령서 관리대장",
        "재선충병 방제대상목 조사야장",
        "피해고사목 방제실적",
    ],
}


def build_appendix_stub_pages(report_type: str) -> list:
    story: list = []
    for idx, title in enumerate(APPENDIX_TITLES[report_type], start=1):
        story.append(PageBreak())
        story.append(
            Paragraph(for_pdf(f"별지 {idx}. {title} (다음 단계에서 작성 예정)"), STUB_STYLE)
        )
    return story
