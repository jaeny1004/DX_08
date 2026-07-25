"""보고서 3종 본문 스켈레톤과 치환 로직.

스켈레톤(SKELETONS)은 data/report_templates/*.docx를 document.xml 순서
그대로(문단+표 인터리브) 추출한 원문 라인이다. 치환 딕셔너리는 새로 만들지
않고 report_template_service.py의 기존 함수를 그대로 재사용한다 — 같은
draft 입력이면 기존 docx 경로와 같은 텍스트가 나오는 것을 보장하기 위함이다.
"""
from __future__ import annotations

from typing import Any

from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as ReportLabImage
from reportlab.platypus import Paragraph, Spacer

from app.services.report_template_service import (
    _common_replacements,
    _control_exact,
    _field_exact,
    _prediction_exact,
)

from . import styles
from .fonts import for_pdf
from .layout import build_cover, build_section_bar, build_toc

COVER_TITLES = {
    "prediction": "소나무재선충 발생 예측 보고서",
    "field_survey": "소나무재선충 현장 예찰 보고서",
    "control": "소나무재선충 방제 보고서",
}

TOC_ENTRIES: dict[str, list[str]] = {
    "prediction": [
        "Ⅰ. 추진배경 ......... 1",
        "Ⅱ. 종합 위험 등급 ......... 1",
        "Ⅲ. 확산 시뮬레이션 결과 ......... 3",
        "Ⅳ. 방제 대응 가이드 ......... 5",
        "별지 1. 감염의심목등 신고처리 접수 대장",
        "별지 2. 유인항공 예찰 계획",
    ],
    "field_survey": [
        "Ⅰ. 예찰 개요 ......... 1",
        "Ⅱ. 현장 예찰 결과 ......... 1",
        "Ⅲ. 조치 현황 및 향후 계획 ......... 3",
        "별지 1. 유인항공 예찰 계획",
        "별지 2. 유인항공 예찰 조사 결과",
    ],
    "control": [
        "Ⅰ. 방제 개요 ......... 1",
        "Ⅱ. 방제 처리 현황 ......... 1",
        "Ⅲ. 행정 사항 및 향후 계획 ......... 3",
        "별지 1. 재선충병 방제사업 계획서",
        "별지 2. 방제조치 명령서 관리대장",
        "별지3. 재선충병 방제대상목 조사야장",
        "별지4. 피해고사목 방제실적",
    ],
}

# (로마숫자, 챕터 제목, [원문 라인, ...]) — document.xml 순서 그대로.
SKELETONS: dict[str, list[tuple[str, str, list[str]]]] = {
    "prediction": [
        (
            "Ⅰ",
            "추진 배경",
            [
                "□ 추진 배경",
                "❍ (분석 배경) [입력]",
                "❍ (분석 목적) [입력]",
                "❍ (활용 목적) [입력]",
                "❍ (분석 대상) [지역] / [기간]",
            ],
        ),
        (
            "Ⅱ",
            "종합 위험 등급",
            [
                "□ AI 종합 위험도 판별 및 예측",
                "❍ (위험 점수) 종합 위험도 스코어 [점수]점 (전체 [단계 수]단계 중 [단계]단계 ‘[등급]’ 수준)",
                "□ AI 위험도 상세",
                "❍ 격자 ID ‘[격자 ID]’",
                "― 최근 감염압력 ‘[점수]’점",
                "― 소나무류 비율 ‘[비율]’%",
                "❍ 예찰 우선순위 ‘[점수]’점([등급])",
                "❍ 접근성 ‘[점수]’점",
                "― 도로까지의 거리 ‘[거리]’m([도로 유형])",
                "― 환경주의 ‘[해당 여부]’",
            ],
        ),
        (
            "Ⅲ",
            "확산 시뮬레이션 결과",
            [
                "□ 확산 경로 시뮬레이션",
                "❍ 향후 [기간] 내 [방향·대상 지역]으로의 신규 확산위험 [결과] 예측",
                "□ 경계 구역 목록",
                "❍ 기준 격자 ID [격자 ID] / 방향 [방향]",
                "― 격자 ID [인접 격자 1]",
                "― 격자 ID [인접 격자 2]",
                "― 격자 ID [인접 격자 3]",
                "― 격자 ID [인접 격자 4]",
                "❍ (시뮬레이션 종합 의견) [입력]",
            ],
        ),
        (
            "Ⅳ",
            "방제 대응 가이드",
            [
                "□ 선제적 대응 방안",
                "❍ 1단계: [대응 단계명]",
                "― (실행 조건) [입력]",
                "― (실행 계획) [일자] / [대상 격자] / [실행 내용]",
                "❍ 2단계: [대응 단계명]",
                "― (대상 조직·알림 내용) [입력]",
                "― (현장 확인 계획) [입력]",
                "❍ 3단계: [대응 단계명]",
                "― (방제·수종전환 검토 사항) [입력]",
                "― (행정 연계 및 후속 계획) [입력]",
            ],
        ),
    ],
    "field_survey": [
        (
            "Ⅰ",
            "예찰 개요",
            [
                "□ 개요",
                "❍ (일시 및 기후) [일시] / [날씨] (기온 [ ]℃, 풍속 [ ]m/s)",
                "❍ (조 사 자) [소속·조] (단원: [성명])",
                "❍ (발견 경로) [입력]",
                "❍ (대상 위치) [주소] (임반-소반: [정보])",
                "― 세부 좌표: GPS 위도 [위도] / 경도 [경도]",
            ],
        ),
        (
            "Ⅱ",
            "현장 예찰 결과",
            [
                "□ AI 종합 위험도 판별 및 예측",
                "❍ (AI 분석 결과) [점수·등급 또는 판단 내용]",
                "❍ (종합 판단) [현장 확인 필요 여부 및 판단 근거 입력]",
                "□ 현장 피해목 상황",
                "❍ (수종/수량) [수종] / 총 [수량]본 ([세부 분류])",
                "❍ (임목 규격) 수고 약 [ ]m, 흉고직경(DBH) [ ]cm 내외",
                "❍ (변색 단계) [관찰 내용 및 단계]",
                "❍ (매개충 흔적) [관찰 내용]",
                "❍ (수피·목질부 관찰) [관찰 내용]",
                "□ 현장 조사자 의견(STT 음성 인식 변환)",
                "❍ “[현장 조사자 의견 입력]”",
            ],
        ),
        (
            "Ⅲ",
            "조치 현황 및 향후 계획",
            [
                "□ 시료 채취 및 QR 연동",
                "❍ (시료 채취) [시료 종류·수량] / QR코드 [번호]",
                "❍ (시스템 연동) [처리 결과 입력]",
                "□ 후속 조치 계획",
                "❍ [일자]: [검경 의뢰 기관 및 진행 상태]",
                "❍ (후속 조치 계획) [현장 확인·검경 결과에 따른 조치 입력]",
            ],
        ),
    ],
    "control": [
        (
            "Ⅰ",
            "방제 개요",
            [
                "□ 개요",
                "❍ (작업 기간) [시작일] ~ [종료일] (총 [일수]일간)",
                "❍ (방 제 자) [소속·조] (단원: [성명])",
                "❍ (대상 위치) [주소] 일원 (격자 ID: [격자 ID])",
                "❍ (방제 면적) 총 [면적] ha ([포함 범위])",
            ],
        ),
        (
            "Ⅱ",
            "방제 처리 현황",
            [
                "□ 피해목 제거 및 처리 (벌채·파쇄)",
                "❍ (대상 수량) 최종 검경 확진목 [수량]본 및 감염 우려 피해목 [수량]본 (총 [수량]본)",
                "❍ (파쇄 처리) [수량]본 / [처리 방법 및 규격]",
                "❍ (훈증 처리) [수량]본 / [처리 사유 및 방법]",
                "― 타포린 피복 일련번호: [번호]",
                "□ 주변 우량림 예방 조치 (예방나무주사)",
                "❍ (작업 면적) [범위 및 대상] (약 [면적]ha)",
                "❍ (주입 실적) [수종] 약 [수량]본 / [약제 및 처리 내용]",
                "❍ (천공 규격) [직경]mm, 깊이 [깊이]cm / [작업 방법]",
                "□ 방제 전·후 비교",
                "❍ (방제 전) [현장 상태 입력]",
                "❍ (방제 후) [조치 결과 입력]",
            ],
        ),
        (
            "Ⅲ",
            "행정 사항 및 향후 계획",
            [
                "□ 대시보드 연동 조정",
                "❍ (위험 스코어 조정)",
                "― 방제 완료 자료 입력에 따라 해당 격자([격자 ID])의 AI 종합 위험도 점수 재산정",
                "― 위험도 변화: 기존 [점수]점([등급]) → 방제 완료 후 [점수]점([등급])",
                "❍ (잔재물 사후 관리)",
                "― 훈증 더미 [개소] 위치 좌표 등록 및 [주기] 모니터링 계획",
                "― (잔재물 관리 조치) [입력]",
                "□ 행정 사항 계획",
                "❍ (보고 및 결재) [보고 대상·승인 절차 입력]",
                "❍ (사후 모니터링)",
                "― 1차 모니터링 예정일: [일자] ([방법])",
                "― (후속 사업 및 행정 연계 계획) [입력]",
            ],
        ),
    ],
}

EXACT_BUILDERS = {
    "prediction": _prediction_exact,
    "field_survey": _field_exact,
    "control": _control_exact,
}


def render_line(original: str, replacements: dict[str, str], exact: dict[str, str]) -> str:
    """report_template_service._replace_paragraph()와 동일한 치환 순서를 재현한다.

    exact 완전일치를 먼저 적용한 뒤, 그 결과에 common 토큰 치환을 한 번 더
    적용한다(원본 함수와 동일한 순서 — 순서가 바뀌면 결과가 달라질 수 있다).
    """
    updated = exact.get(original, original)
    for source, target in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
        updated = updated.replace(source, target)
    return updated


def line_style(line: str):
    if line.startswith("□"):
        return styles.SECTION_SUBHEAD
    if line.startswith("―"):
        return styles.BODY_SUB
    return styles.BODY_MAIN


def _all_lines(report_type: str) -> list[str]:
    lines = ["[작성일]"]
    for _roman, _title, section_lines in SKELETONS[report_type]:
        lines.extend(section_lines)
    return lines


def expected_lines(report_type: str, draft: dict[str, Any]) -> list[str]:
    """diff 검증용: 실제로 채워질 텍스트를 라인 순서 그대로 반환한다."""
    replacements = _common_replacements(draft)
    exact = EXACT_BUILDERS[report_type](draft)
    return [render_line(line, replacements, exact) for line in _all_lines(report_type)]


def _prediction_map(draft: dict[str, Any]) -> ReportLabImage | None:
    map_path = draft.get("map_path")
    if not map_path:
        return None

    reader = ImageReader(str(map_path))
    width, height = reader.getSize()
    if width <= 0 or height <= 0:
        raise ValueError(f"지도 이미지 크기가 올바르지 않습니다: {map_path}")

    target_width = 16 * cm
    target_height = target_width * height / width
    image = ReportLabImage(
        str(map_path),
        width=target_width,
        height=target_height,
    )
    image.hAlign = "CENTER"
    return image


def build_body_story(report_type: str, draft: dict[str, Any]) -> list:
    replacements = _common_replacements(draft)
    exact = EXACT_BUILDERS[report_type](draft)

    story: list = []
    story.extend(
        build_cover(
            COVER_TITLES[report_type],
            render_line("-지역, 기간-", replacements, exact),
        )
    )
    story.extend(build_toc(TOC_ENTRIES[report_type]))

    story.append(
        Paragraph(for_pdf(render_line("[작성일]", replacements, exact)), styles.DATE_LINE)
    )

    for roman, title, lines in SKELETONS[report_type]:
        story.append(build_section_bar(roman, title))
        story.append(Spacer(1, 0.3 * cm))
        for line in lines:
            text = render_line(line, replacements, exact)
            story.append(Paragraph(for_pdf(text), line_style(line)))
        if report_type == "prediction" and roman == "Ⅲ":
            map_image = _prediction_map(draft)
            if map_image is not None:
                story.append(Spacer(1, 0.3 * cm))
                story.append(map_image)

    return story
