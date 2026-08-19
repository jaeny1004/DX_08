"""Supabase 사전계산 데이터를 사용하는 단일 방제 보고서 생성기.

기존 scripts/generate_vworld_control_reports_linked.py(예측+현장예찰 CSV 매니페스트를
document_no로 1:1 병합)를 prediction_report_generator.py/field_survey_report_generator.py와
같은 방식(Supabase 사전계산 조회 + report_render reportlab PDF)으로 전환한다.

- 소나무 면적/비율: 기존 scripts 버전은 terrain CSV의 중심 격자 단일값을 읽었다.
  여기서는 동일한 값을 미리 백필해 둔 prediction_grid_static.center_pine_area_ha/
  center_pine_ratio(007 마이그레이션)에서 조회한다. block_pine_mean(3x3 평균)은
  표본 비교 결과 오차가 커서 쓰지 않는다.
- 현장 이상징후·시료 건수: 기존 스크립트는 별도 현장예찰보고서 CSV를 document_no로
  연결해서 읽었다. 여기서는 같은 중심 격자에 대해 이미 생성된 field_survey 보고서가
  Supabase reports 테이블에 있으면 그 실측값을 그대로 재사용하고, 없으면(아직 현장예찰
  보고서가 없는 격자) 결정론적 추정값으로 대체한다.
- DOCX 본문·별지 4종 채우기 로직은 LibreOffice 변환 부분만 제거하고 원본 스크립트와
  동일하게 유지한다. PDF는 LibreOffice 대신 report_render.renderer.render_report_pdf로
  별도 생성한다(별지는 report_render/appendices.py의 control_* 함수가 담당).
"""
from __future__ import annotations

import random
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from docx import Document
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

from app.services.prediction_report_generator import (
    BACKEND_ROOT,
    HISTORY_LAST_YEAR,
    PROJECT_ROOT,
    ReportRecord,
    _create_supabase_client,
    _single_row,
    apply_candidate_metrics,
    calculate_metrics,
    load_report_source_data,
)

TEMPLATE_PATH = (
    BACKEND_ROOT
    / "data"
    / "report_templates"
    / "[양식]소나무재선충병 방제 보고서_빈양식.docx"
)
DEFAULT_OUTPUT_ROOT = (
    BACKEND_ROOT / "data" / "generated_drafts" / "control_template_test"
)

PAGE_SIZE = (832, 1272)


@dataclass(frozen=True)
class ControlReportRecord:
    document_no: int
    year: int
    center_grid_id: int
    sido_name: str
    sigungu_name: str
    risk_score: float
    risk_grade: str
    priority_score: float
    priority_grade: str
    suspicious_count: int
    sample_count: int
    survey_datetime: str
    surveyors: str
    pine_area_ha: float
    pine_ratio_pct: float
    field_survey_linked: bool = True


FALLBACK_NOTE = "(현장예찰 연계 자료 없음, 추정값)"


def sanitize_filename(value: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", value).strip()


def risk_label(score: float) -> str:
    if score >= 80:
        return "매우 높음"
    if score >= 60:
        return "높음"
    if score >= 40:
        return "주의"
    if score >= 20:
        return "관찰"
    return "낮음"


def parse_control_date(value: str, fallback_year: int) -> datetime:
    patterns = [
        r"(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})",
        r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일",
    ]
    for pattern in patterns:
        match = re.search(pattern, value)
        if match:
            return datetime(
                int(match.group(1)),
                int(match.group(2)),
                int(match.group(3)),
            )
    return datetime(fallback_year, 12, 20)


def load_control_pine_fields(client: Any, grid_id: int) -> dict[str, float]:
    response = (
        client.table("prediction_grid_static")
        .select("grid_id,center_pine_area_ha,center_pine_ratio")
        .eq("grid_id", grid_id)
        .limit(2)
        .execute()
    )
    row = _single_row(
        list(response.data or []),
        table="prediction_grid_static",
        grid_id=grid_id,
    )
    area = row.get("center_pine_area_ha")
    ratio = row.get("center_pine_ratio")
    if area is None or ratio is None:
        raise RuntimeError(
            f"격자 {grid_id}의 center_pine_area_ha/center_pine_ratio가 비어 "
            "있습니다. 007_center_pine_fields.sql 백필이 적용됐는지 확인하세요."
        )
    return {
        "pine_area_ha": round(float(area), 2),
        "pine_ratio_pct": round(float(ratio) * 100, 2),
    }


def _fallback_field_survey_summary(grid_id: int, year: int) -> dict[str, Any]:
    rng = random.Random(grid_id * 10000 + year + 97)
    suspicious = rng.randint(0, 3)
    sample = rng.randint(0, 1) if suspicious > 0 else 0
    return {
        "suspicious_count": suspicious,
        "sample_count": sample,
        "survey_datetime": f"{year}. 12. 20. 09:30~14:30",
        "surveyors": "산림보호 담당자",
        "linked": False,
    }


def load_linked_field_survey(
    client: Any,
    grid_id: int,
    year: int,
) -> dict[str, Any]:
    """같은 중심 격자의 실제 field_survey 보고서(Supabase reports 테이블)를 찾아
    이상징후·시료 건수를 그대로 재사용한다. 없으면 결정론적 추정값으로 대체한다."""
    response = (
        client.table("reports")
        .select("data,year")
        .eq("report_type", "field_survey")
        .eq("center_grid_id", str(grid_id))
        .execute()
    )
    rows = list(response.data or [])
    if not rows:
        return _fallback_field_survey_summary(grid_id, year)

    exact_year = [row for row in rows if str(row.get("year")) == str(year)]
    chosen = exact_year[0] if exact_year else rows[0]
    data = chosen.get("data") or {}
    return {
        "suspicious_count": int(float(data.get("suspicious_count") or 0)),
        "sample_count": int(float(data.get("sample_count") or 0)),
        "survey_datetime": (
            str(data.get("survey_datetime") or "").strip()
            or f"{year}. 12. 20. 09:30~14:30"
        ),
        "surveyors": str(data.get("surveyors") or "").strip() or "산림보호 담당자",
        "linked": True,
    }


def parse_requested_period_date(
    value: str,
    *,
    field_name: str,
) -> datetime:
    text = str(value or "").strip()

    try:
        return datetime.strptime(text, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(
            f"{field_name}은 YYYY-MM-DD 형식이어야 합니다: {text or '(빈 값)'}"
        ) from exc


def build_control_plan_values(
    record: ControlReportRecord,
    *,
    requested_start_date: str | None = None,
    requested_end_date: str | None = None,
) -> dict[str, Any]:
    survey_date = parse_control_date(record.survey_datetime, record.year)

    if requested_start_date and requested_end_date:
        start_date = parse_requested_period_date(
            requested_start_date,
            field_name="시작일",
        )
        end_date = parse_requested_period_date(
            requested_end_date,
            field_name="종료일",
        )
    elif requested_start_date or requested_end_date:
        raise ValueError("시작일과 종료일을 모두 입력해야 합니다.")
    else:
        # 기존 배치 스크립트 등 날짜 인자를 전달하지 않는 호출과의 호환용 기본값
        start_date = survey_date + timedelta(days=7)
        end_date = start_date + timedelta(days=2)

    if end_date < start_date:
        raise ValueError("종료일은 시작일보다 빠를 수 없습니다.")

    suspicious = max(0, record.suspicious_count)
    planned = suspicious
    shred = planned if planned <= 5 else int(round(planned * 0.7))
    fumigate = max(0, planned - shred)
    preventive = max(0, int(round(planned * 0.6)))
    total = shred + fumigate
    target_area = max(
        0.5,
        min(25.0, record.pine_area_ha if record.pine_area_ha > 0 else 5.0),
    )
    after_score = round(max(0.0, record.risk_score * 0.68), 1)

    surveyor = record.surveyors.split(",")[0].strip() or "산림보호 담당자"
    plan_id = f"CTRL-{record.year}-{record.center_grid_id}-{record.document_no:02d}"

    return {
        "start_date": start_date,
        "end_date": end_date,
        "days": (end_date - start_date).days + 1,
        "surveyor": surveyor,
        "team": f"{record.sigungu_name} 산림보호 방제지원조",
        "address": f"{record.sido_name} {record.sigungu_name} 산림 일원",
        "area_ha": round(target_area, 1),
        "range": f"중심 격자 {record.center_grid_id} 및 주변 3×3 권역",
        "confirmed": 0,
        "concern": suspicious,
        "planned": planned,
        "shred": shred,
        "fumigate": fumigate,
        "preventive": preventive,
        "sample_count": record.sample_count,
        "total": total,
        "tarpaulin": f"검경 결과에 따라 발급 예정 ({plan_id})",
        "after_score": after_score,
        "after_grade": risk_label(after_score),
        "plan_id": plan_id,
    }


def set_paragraph_text(paragraph, new_text: str) -> None:
    if paragraph.runs:
        paragraph.runs[0].text = new_text
        for run in paragraph.runs[1:]:
            run.text = ""
    else:
        paragraph.add_run(new_text)


def replace_cover_text(
    paragraph,
    record: ControlReportRecord,
    values: dict[str, Any],
) -> bool:
    original = paragraph.text

    if "-지역, 기간-" in original:
        set_paragraph_text(
            paragraph,
            f"-{record.sido_name} {record.sigungu_name}, "
            f"{values['start_date']:%Y. %m. %d.}~{values['end_date']:%Y. %m. %d.}-",
        )
        return True

    if "[작성일]" in original:
        set_paragraph_text(paragraph, f"{values['start_date']:%Y. %m. %d.}")
        return True

    return False


def replace_body_paragraph(
    paragraph,
    record: ControlReportRecord,
    v: dict[str, Any],
) -> bool:
    text_value = paragraph.text.strip()
    if not text_value:
        return False

    fallback_suffix = "" if record.field_survey_linked else f" {FALLBACK_NOTE}"

    replacements: list[tuple[str, str]] = [
        (
            "(작업 기간)",
            f"❍ (작업 기간) {v['start_date']:%Y. %m. %d.} ~ "
            f"{v['end_date']:%Y. %m. %d.} (총 {v['days']}일간)",
        ),
        (
            "(방 제 자",
            f"❍ (방 제 자) {v['team']} (단원: {v['surveyor']})",
        ),
        (
            "(대상 위치)",
            f"❍ (대상 위치) {v['address']} "
            f"(격자 ID: {record.center_grid_id})",
        ),
        (
            "(방제 면적)",
            f"❍ (방제 면적) 총 {v['area_ha']:.1f}ha ({v['range']})",
        ),
        (
            "(대상 수량)",
            f"❍ (대상 수량) 검경 확정목 {v['confirmed']}본 및 "
            f"현장 이상징후·감염 우려 피해목 {v['concern']}본 "
            f"(방제 검토 대상 총 {v['planned']}본){fallback_suffix}",
        ),
        (
            "(파쇄 처리)",
            f"❍ (파쇄 처리 계획) {v['shred']}본 / "
            "검경 결과 확인 후 현장 파쇄 또는 지정 장소 반출",
        ),
        (
            "(훈증 처리)",
            f"❍ (훈증 처리 계획) {v['fumigate']}본 / "
            "파쇄가 어려운 대상목에 한해 밀봉 처리 검토",
        ),
        (
            "타포린 피복 일련번호",
            f"― 타포린 피복 일련번호: {v['tarpaulin']}",
        ),
        (
            "(작업 면적)",
            f"❍ (작업 면적) 중심 격자와 인접 우량 소나무림 "
            f"(약 {v['area_ha']:.1f}ha)",
        ),
        (
            "(주입 실적)",
            f"❍ (주입 계획) 소나무류 약 {v['preventive']}본 / "
            "대상목 검토 후 등록 약제 기준 예방나무주사 적용",
        ),
        (
            "(천공 규격)",
            "❍ (천공 규격) 직경 10mm 내외, 깊이 5cm 내외 / "
            "수간주입 기준과 현장 여건에 따라 조정",
        ),
        (
            "(방제 전)",
            f"❍ (방제 전) 중심 격자 {record.center_grid_id}에서 "
            f"현장 이상징후 {record.suspicious_count}본과 "
            f"시료 {record.sample_count}점이 확인되어 현장 확인 "
            f"필요{fallback_suffix}",
        ),
        (
            "(방제 후)",
            "❍ (방제 후 계획) 검경 결과에 따라 대상목 처리, "
            "잔재물 위치 등록, 인접 격자 재예찰을 순차 수행",
        ),
        (
            "(위험 스코어 조정)",
            "❍ (위험 스코어 조정)",
        ),
        (
            "방제 완료 자료 입력에 따라",
            f"― 방제 조치 결과 등록 시 해당 격자 "
            f"({record.center_grid_id})의 AI 종합 위험도 점수를 재산정",
        ),
        (
            "위험도 변화:",
            f"― 위험도 변화(시나리오): 기존 {record.risk_score:.1f}점"
            f"({record.risk_grade}) → 조치 반영 후 예상 "
            f"{v['after_score']:.1f}점({v['after_grade']})",
        ),
        (
            "훈증 더미",
            f"― 훈증 더미 최대 {v['fumigate']}개소 위치좌표 등록 및 "
            "월 1회 사후 모니터링 계획",
        ),
        (
            "(잔재물 관리 조치",
            "― (잔재물 관리 조치) 파쇄물 비산 방지, 훈증 피복상태 확인, "
            "처리 위치와 사진을 시스템에 기록",
        ),
        (
            "(보고 및 결재",
            f"❍ (보고 및 결재) {record.sigungu_name} 산림보호 담당부서 "
            "검토 후 방제 대상·방법 확정 및 작업 승인",
        ),
        (
            "(사후 모니터링)",
            "❍ (사후 모니터링) 처리 후 1개월·3개월 단위 재예찰 및 "
            "인접 격자 이상징후 추가 확인",
        ),
        (
            "(후속 사업 및 행정 연계 계획",
            "― (후속 사업 및 행정 연계 계획) 검경 결과, 방제 이력, "
            "현장 사진을 통합 저장하고 차기 예찰 우선순위 산정에 반영",
        ),
    ]

    for marker, replacement in replacements:
        if marker in text_value:
            set_paragraph_text(paragraph, replacement)
            return True
    return False


def walk_table_paragraphs(table):
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                yield paragraph
            for nested in cell.tables:
                yield from walk_table_paragraphs(nested)


def replace_remaining_placeholders(
    paragraph,
    record: ControlReportRecord,
    v: dict[str, Any],
) -> bool:
    original = paragraph.text
    if not original:
        return False

    replacements = {
        "[일자]": f"{v['start_date']:%Y. %m. %d.}",
        "[방법]": "검경 결과에 따라 파쇄·훈증 등 적정 방제방법 결정",
        "[시작일]": f"{v['start_date']:%Y. %m. %d.}",
        "[종료일]": f"{v['end_date']:%Y. %m. %d.}",
        "[일수]": str(v["days"]),
        "[소속·조]": v["team"],
        "[성명]": v["surveyor"],
        "[주소]": v["address"],
        "[격자 ID]": str(record.center_grid_id),
        "[면적]": f"{v['area_ha']:.1f}",
        "[포함 범위]": v["range"],
        "[수량]": str(v["planned"]),
        "[처리 방법 및 규격]": "검경 결과에 따라 현장 파쇄 또는 지정 장소 반출",
        "[처리 사유 및 방법]": "파쇄 곤란 대상목에 한해 밀봉 훈증 검토",
        "[번호]": v["tarpaulin"],
        "[범위 및 대상]": f"중심 격자 {record.center_grid_id} 인접 우량 소나무림",
        "[수종]": "소나무류",
        "[약제 및 처리 내용]": "등록 약제 기준 예방나무주사 적용",
        "[직경]": "10",
        "[깊이]": "5",
        "[작업 방법]": "수간주입 기준과 현장 여건에 따라 조정",
        "[현장 상태 입력]": (
            f"현장 이상징후 {record.suspicious_count}본, "
            f"시료 {record.sample_count}점 확인"
        ),
        "[조치 결과 입력]": "검경 결과 확인 후 대상목 처리 및 인접 격자 재예찰",
        "[점수]": f"{record.risk_score:.1f}",
        "[등급]": record.risk_grade,
        "[개소]": str(v["fumigate"]),
        "[주기]": "월 1회",
        "[입력]": "현장 사진·좌표·처리 이력을 시스템에 등록",
        "[보고 대상·승인 절차 입력]": (
            f"{record.sigungu_name} 산림보호 담당부서 검토 후 작업 승인"
        ),
        "[후속 사업 및 행정 연계 계획]": (
            "검경·방제 이력을 차기 예찰 우선순위 산정에 반영"
        ),
    }

    updated = original
    for token, replacement in replacements.items():
        updated = updated.replace(token, replacement)

    if updated != original:
        set_paragraph_text(paragraph, updated)
        return True
    return False


def fill_document_text(
    template: Path,
    output: Path,
    record: ControlReportRecord,
    values: dict[str, Any],
) -> None:
    doc = Document(template)

    for paragraph in doc.paragraphs:
        replace_cover_text(paragraph, record, values)
        replace_body_paragraph(paragraph, record, values)
        replace_remaining_placeholders(paragraph, record, values)

    for table in doc.tables:
        for paragraph in walk_table_paragraphs(table):
            replace_cover_text(paragraph, record, values)
            replace_body_paragraph(paragraph, record, values)
            replace_remaining_placeholders(paragraph, record, values)

    for section in doc.sections:
        for container in (section.header, section.footer):
            for paragraph in container.paragraphs:
                replace_cover_text(paragraph, record, values)
                replace_body_paragraph(paragraph, record, values)
                replace_remaining_placeholders(paragraph, record, values)

    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def font_path(bold: bool = False) -> str | None:
    candidates = [
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf" if bold
        else "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumMyeongjoBold.ttf" if bold
        else "/usr/share/fonts/truetype/nanum/NanumMyeongjo.ttf",
        "/usr/share/fonts/truetype/unfonts-core/UnDotumBold.ttf" if bold
        else "/usr/share/fonts/truetype/unfonts-core/UnDotum.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    path = font_path(bold)
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def centered(draw, box, text_value, size=20, bold=False, fill=(0, 0, 0)):
    x1, y1, x2, y2 = box
    f = font(size, bold)
    bbox = draw.multiline_textbbox((0, 0), str(text_value), font=f, spacing=3, align="center")
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.multiline_text(
        (x1 + (x2 - x1 - w) / 2, y1 + (y2 - y1 - h) / 2),
        str(text_value),
        font=f,
        fill=fill,
        spacing=3,
        align="center",
    )


def wrapped(draw, box, text_value, size=18, bold=False, align="left"):
    x1, y1, x2, y2 = box
    max_width = x2 - x1 - 10
    f = font(size, bold)
    lines: list[str] = []
    current = ""
    for ch in str(text_value):
        trial = current + ch
        if draw.textbbox((0, 0), trial, font=f)[2] <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = ch
    if current:
        lines.append(current)
    joined = "\n".join(lines)
    draw.multiline_text((x1 + 5, y1 + 5), joined, font=f, fill=(0, 0, 0), spacing=4, align=align)


def base_page(title: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", PAGE_SIZE, "white")
    draw = ImageDraw.Draw(image)
    centered(draw, (60, 40, 772, 115), title, 29, True)
    draw.line((180, 108, 652, 108), fill="black", width=2)
    draw.line((180, 112, 652, 112), fill="black", width=2)
    return image, draw


def draw_grid(
    draw: ImageDraw.ImageDraw,
    left: int,
    top: int,
    widths: list[int],
    heights: list[int],
    line_width: int = 1,
) -> list[list[tuple[int, int, int, int]]]:
    xs = [left]
    for width in widths:
        xs.append(xs[-1] + width)
    ys = [top]
    for height in heights:
        ys.append(ys[-1] + height)

    for x in xs:
        draw.line((x, ys[0], x, ys[-1]), fill="black", width=line_width)
    for y in ys:
        draw.line((xs[0], y, xs[-1], y), fill="black", width=line_width)

    cells = []
    for r in range(len(heights)):
        row = []
        for c in range(len(widths)):
            row.append((xs[c], ys[r], xs[c + 1], ys[r + 1]))
        cells.append(row)
    return cells


def create_appendix_1(
    record: ControlReportRecord,
    v: dict[str, Any],
    output: Path,
) -> None:
    image, draw = base_page(f"재선충병 방제사업 계획서({record.sigungu_name})")

    wrapped(draw, (55, 145, 780, 190), "1. 산림 현황", 23, True)
    wrapped(
        draw,
        (70, 200, 780, 300),
        f"가. 산림면적\n  - 중심 격자 포함 3×3 관리권역 225.0ha\n"
        f"나. 소나무림 현황\n  - 소나무류 면적 약 {record.pine_area_ha:.1f}ha "
        f"(권역 대비 {record.pine_ratio_pct:.1f}%)",
        17,
    )

    wrapped(draw, (55, 330, 780, 380), "2. 재선충병 발생 및 방제 현황", 23, True)
    wrapped(
        draw,
        (70, 390, 780, 540),
        f"가. 발생경과\n  (1) 최초발생: 감염 발생 이력 및 신규 확산위험 후보 자료 기준 관리\n"
        f"  (2) 그동안 발생추이: 위험도 {record.risk_score:.1f}점({record.risk_grade}), "
        f"현장 이상징후 {record.suspicious_count}본, 시료 {record.sample_count}점 확인",
        16,
    )

    wrapped(draw, (70, 555, 780, 595), "나. 피해고사목 발생현황(최근 5년간)", 20, True)
    years = [record.year - 4 + i for i in range(5)]
    counts = [
        max(0, int(round(v["concern"] * ratio)))
        for ratio in (0.1, 0.2, 0.35, 0.55, 1.0)
    ]
    cells = draw_grid(draw, 55, 610, [125, 130, 130, 130, 130, 130], [42, 52])
    centered(draw, cells[0][0], "연도별", 15, True)
    centered(draw, cells[1][0], "본 수", 15, True)
    for i, year in enumerate(years):
        centered(draw, cells[0][i + 1], f"{year}년", 15)
        centered(draw, cells[1][i + 1], str(counts[i]), 16, True)

    wrapped(draw, (70, 735, 780, 775), "다. 방제 실적 및 계획(최근 3년간)", 20, True)
    widths = [80, 68, 68, 68, 68, 70, 70, 70, 70, 70, 75]
    cells = draw_grid(draw, 25, 790, widths, [72, 48, 48, 48])
    headers = [
        "연도", "계", "피해\n고사목", "기타\n고사목", "비병징목",
        "예방\n나무주사", "정밀\n드론", "지상", "유인트랩",
        "훈증더미\n제거", "비고",
    ]
    for i, header in enumerate(headers):
        centered(draw, cells[0][i], header, 12, True)

    rows = [
        [record.year - 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, "실적자료\n미연계"],
        [record.year - 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, "실적자료\n미연계"],
        [
            record.year, v["planned"], v["concern"], 0, 0, v["preventive"],
            round(v["area_ha"] * 0.6, 1), round(v["area_ha"] * 0.4, 1),
            max(0, v["planned"] // 3), v["fumigate"], "방제검토\n계획",
        ],
    ]
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            centered(draw, cells[r][c], value, 12 if c != 10 else 10)

    wrapped(
        draw,
        (40, 1055, 790, 1185),
        f"※ 본 계획서는 예측보고서 {record.document_no:02d}번과 현장예찰보고서를 "
        f"연계하여 작성한 방제 검토 계획이다. 검경 결과 및 담당자 승인 후 "
        f"대상 수량과 방제 방법을 확정한다.",
        14,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def create_appendix_2(
    record: ControlReportRecord,
    v: dict[str, Any],
    output: Path,
) -> None:
    image, draw = base_page("방제조치 명령서 관리대장")
    wrapped(draw, (55, 135, 780, 175), f"기관명: {record.sido_name} {record.sigungu_name} 산림보호 담당부서", 17)

    widths = [55, 130, 205, 80, 80, 95, 115]
    cells = draw_grid(draw, 35, 200, widths, [85] + [65] * 10)
    headers = ["연번", "명령을 받는 자", "명령내용", "방제기간", "방제방법", "명령서 수령자", "처리결과"]
    for i, header in enumerate(headers):
        centered(draw, cells[0][i], header, 14, True)

    row = [
        record.document_no,
        f"{record.sigungu_name}\n산림소유·관리자",
        f"격자 {record.center_grid_id} 현장 이상징후 {v['concern']}본에 대해 "
        "검경 결과 확인 후 대상목 처리 및 인접권역 재예찰",
        f"{v['start_date']:%Y.%m.%d}\n~\n{v['end_date']:%Y.%m.%d}",
        "파쇄·훈증\n예방나무주사\n검토",
        f"{v['surveyor']}\n(담당자)",
        "방제 검토\n계획 등록",
    ]
    for i, value in enumerate(row):
        centered(draw, cells[1][i], value, 11 if i != 2 else 10)

    wrapped(
        draw,
        (50, 940, 785, 1065),
        f"비고: 본 관리대장은 감염 확정 대장이 아니라 현장 예찰 결과를 기반으로 한 "
        f"방제조치 검토 이력이다. 계획번호 {v['plan_id']}, "
        f"예측 위험도 {record.risk_score:.1f}점, 예찰 우선순위 "
        f"{record.priority_score:.1f}점.",
        15,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def create_appendix_3(
    record: ControlReportRecord,
    v: dict[str, Any],
    output: Path,
) -> None:
    image, draw = base_page("재선충병 방제대상목 조사야장")
    wrapped(draw, (45, 135, 785, 175), f"○ 개소: {record.sido_name} {record.sigungu_name} / 중심 격자 {record.center_grid_id}", 17)

    widths = [58, 90, 95, 80, 80, 80, 100, 100, 105]
    cells = draw_grid(draw, 22, 200, widths, [70] + [58] * 12)
    headers = ["번호", "수종", "수고(m)", "흉고직경\n(cm)", "변색", "천공흔적", "시료", "방제검토", "비고"]
    for i, header in enumerate(headers):
        centered(draw, cells[0][i], header, 12, True)

    count = max(1, min(v["concern"], 10))
    for r in range(1, count + 1):
        row = [
            r,
            "소나무",
            f"{14.0 + (r % 5) * 0.8:.1f}",
            f"{24.0 + (r % 6) * 1.7:.1f}",
            "관찰" if r <= v["concern"] else "없음",
            "추가확인" if r % 3 == 0 else "미관찰",
            "채취" if r <= v["sample_count"] else "-",
            "검경 후 결정",
            "현장 확인 필요",
        ]
        for c, value in enumerate(row):
            centered(draw, cells[r][c], value, 10)

    wrapped(
        draw,
        (45, 970, 785, 1095),
        f"조사일: {parse_control_date(record.survey_datetime, record.year):%Y. %m. %d.}\n"
        f"조사자: {record.surveyors}\n"
        f"종합 의견: 검경 결과 확인 전까지 우선 예찰 검토지역으로 유지하고, "
        f"대상목별 조치 여부를 확정하지 않는다.",
        15,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def create_appendix_4(
    record: ControlReportRecord,
    v: dict[str, Any],
    output: Path,
) -> None:
    image, draw = base_page("피해고사목 방제실적")
    wrapped(draw, (50, 135, 785, 180), f"기관명: {record.sido_name} {record.sigungu_name} 산림보호 담당부서", 17)

    widths = [75, 110, 110, 110, 110, 110, 145]
    cells = draw_grid(draw, 36, 205, widths, [78] + [58] * 10)
    headers = ["연도", "대상목", "파쇄", "훈증", "예방주사", "잔재물관리", "처리결과·비고"]
    for i, header in enumerate(headers):
        centered(draw, cells[0][i], header, 13, True)

    rows = [
        [record.year - 2, 0, 0, 0, 0, 0, "실적자료 미연계"],
        [record.year - 1, 0, 0, 0, 0, 0, "실적자료 미연계"],
        [
            record.year,
            v["planned"],
            v["shred"],
            v["fumigate"],
            v["preventive"],
            v["fumigate"],
            "방제 검토 계획\n검경·승인 후 확정",
        ],
    ]
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            centered(draw, cells[r][c], value, 12 if c != 6 else 10)

    wrapped(
        draw,
        (50, 925, 785, 1080),
        f"작업 전 위험도: {record.risk_score:.1f}점({record.risk_grade})\n"
        f"조치 반영 예상 위험도: {v['after_score']:.1f}점({v['after_grade']})\n"
        f"주의: 위 수치는 방제 실행 결과가 아니라 계획 시나리오이며, 실제 처리 실적은 "
        f"현장 작업 완료 후 별도로 갱신한다.",
        16,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def replace_docx_media(docx_path: Path, replacements: dict[str, Path]) -> None:
    temp_path = docx_path.with_suffix(".patched.docx")
    internals = {f"word/media/{name}": path for name, path in replacements.items()}

    with zipfile.ZipFile(docx_path, "r") as src:
        names = set(src.namelist())
        missing = set(internals) - names
        if missing:
            raise RuntimeError(
                "DOCX 안에서 별지 이미지를 찾지 못했습니다: " + ", ".join(sorted(missing))
            )

        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in src.infolist():
                replacement = internals.get(info.filename)
                if replacement:
                    dst.writestr(info, replacement.read_bytes())
                else:
                    dst.writestr(info, src.read(info.filename))

    temp_path.replace(docx_path)


def extract_docx_text(docx_path: Path) -> str:
    with zipfile.ZipFile(docx_path, "r") as archive:
        xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
    return re.sub(r"<[^>]+>", "", xml)


def verify_no_placeholders(docx_path: Path) -> None:
    content = extract_docx_text(docx_path)
    patterns = [
        r"\[[^\[\]\r\n]{1,80}\]",
        re.escape("-지역, 기간-"),
        re.escape("[작성일]"),
    ]
    leftovers: list[str] = []
    for pattern in patterns:
        leftovers.extend(re.findall(pattern, content))
    leftovers = sorted(set(leftovers))
    if leftovers:
        raise RuntimeError(
            "본문에 미치환 플레이스홀더가 남았습니다: " + ", ".join(leftovers[:20])
        )


def build_control_render_payload(
    *,
    record: ControlReportRecord,
    values: dict[str, Any],
) -> dict[str, Any]:
    center_grid = {
        "grid_id": record.center_grid_id,
        "risk_score": record.risk_score,
        "risk_grade": record.risk_grade,
        "priority_score": record.priority_score,
        "priority_grade": record.priority_grade,
        # report_render._percent()는 0~1 입력을 100배 하므로, pine_ratio_pct(0~100)를
        # 비율 입력으로 맞춘다 (prediction/field_survey와 동일한 관례).
        "pine_ratio": record.pine_ratio_pct / 100.0,
        # report_template_service._control_exact()가 이 값을 읽어 fallback
        # 추정값 표시 여부를 판단한다.
        "field_survey_linked": record.field_survey_linked,
    }
    control_data = {
        **center_grid,
        "document_no": record.document_no,
        "year": record.year,
        "center_grid_id": record.center_grid_id,
        "sido_name": record.sido_name,
        "sigungu_name": record.sigungu_name,
        "suspicious_count": record.suspicious_count,
        "sample_count": record.sample_count,
        "survey_datetime": record.survey_datetime,
        "surveyors": record.surveyors,
        "pine_area_ha": record.pine_area_ha,
        "pine_ratio_pct": record.pine_ratio_pct,
    }
    return {
        "report_type": "control",
        "document_no": record.document_no,
        "year": record.year,
        "title": f"{record.year}년 {record.sigungu_name} 방제 보고서",
        "start_date": values["start_date"].strftime("%Y-%m-%d"),
        "end_date": values["end_date"].strftime("%Y-%m-%d"),
        "sido_name": record.sido_name,
        "sigungu_name": record.sigungu_name,
        "center_grid_id": record.center_grid_id,
        "center_grid_ids": [str(record.center_grid_id)],
        "control_data": control_data,
        "data": control_data,
        "data_summary": {
            "selected_grid_count": 1,
            "region_candidate_count": 1,
            "grid_ids": [str(record.center_grid_id)],
            "center_grid": center_grid,
            "neighbor_grids": [],
        },
    }


def generate_single_control_report(
    *,
    center_grid_id: int,
    year: int,
    output_root: Path | None = None,
    report_no: int = 1,
    candidate_metrics: dict[str, Any] | None = None,
    client: Any | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    if year < 2016 or year > 2100:
        raise ValueError("보고서 연도는 2016~2100 범위여야 합니다.")

    load_dotenv(BACKEND_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env")

    center_grid_id = int(center_grid_id)
    client = client or _create_supabase_client()
    source = load_report_source_data(center_grid_id, year, client=client)

    historical_year = 2016 <= year <= HISTORY_LAST_YEAR
    base_record = ReportRecord(
        report_no=int(report_no),
        year=int(year),
        center_grid_id=center_grid_id,
        annual_count=(
            int(source.stats["center_annual_count"]) if historical_year else 0
        ),
        cumulative_count=int(source.stats["center_cumulative_count"]),
        sido_name=str(source.static["sido_name"]),
        sigungu_name=str(source.static["sigungu_name"]),
    )
    metrics = apply_candidate_metrics(
        calculate_metrics(base_record, source),
        candidate_metrics,
    )
    pine_fields = load_control_pine_fields(client, center_grid_id)
    field_summary = load_linked_field_survey(client, center_grid_id, year)

    record = ControlReportRecord(
        document_no=int(report_no),
        year=int(year),
        center_grid_id=center_grid_id,
        sido_name=base_record.sido_name,
        sigungu_name=base_record.sigungu_name,
        risk_score=float(metrics["risk_score"]),
        risk_grade=str(metrics["risk_grade"]),
        priority_score=float(metrics["priority_score"]),
        priority_grade=str(metrics["priority_grade"]),
        suspicious_count=field_summary["suspicious_count"],
        sample_count=field_summary["sample_count"],
        survey_datetime=field_summary["survey_datetime"],
        surveyors=field_summary["surveyors"],
        pine_area_ha=pine_fields["pine_area_ha"],
        pine_ratio_pct=pine_fields["pine_ratio_pct"],
        field_survey_linked=field_summary["linked"],
    )
    values = build_control_plan_values(
        record,
        requested_start_date=start_date,
        requested_end_date=end_date,
    )

    root = (
        output_root.resolve()
        if output_root is not None
        else DEFAULT_OUTPUT_ROOT.resolve()
    )
    docx_directory = root / "docx"
    pdf_directory = root / "pdf"
    appendix_directory = root / "appendices"
    for directory in [root, docx_directory, pdf_directory, appendix_directory]:
        directory.mkdir(parents=True, exist_ok=True)

    base_name = sanitize_filename(
        f"{record.document_no:02d}_{record.year}_"
        "소나무재선충병_방제보고서_"
        f"{record.sido_name}_{record.sigungu_name}_"
        f"격자{record.center_grid_id}"
    )
    docx_path = docx_directory / f"{base_name}.docx"
    pdf_path = pdf_directory / f"{base_name}.pdf"
    appendix_paths = {
        "image1.png": appendix_directory / f"{base_name}_별지1_방제사업계획서.png",
        "image2.png": appendix_directory / f"{base_name}_별지2_방제조치명령서관리대장.png",
        "image3.png": appendix_directory / f"{base_name}_별지3_방제대상목조사야장.png",
        "image4.png": appendix_directory / f"{base_name}_별지4_피해고사목방제실적.png",
    }

    create_appendix_1(record, values, appendix_paths["image1.png"])
    create_appendix_2(record, values, appendix_paths["image2.png"])
    create_appendix_3(record, values, appendix_paths["image3.png"])
    create_appendix_4(record, values, appendix_paths["image4.png"])

    fill_document_text(TEMPLATE_PATH, docx_path, record, values)
    replace_docx_media(docx_path, appendix_paths)
    verify_no_placeholders(docx_path)

    render_payload = build_control_render_payload(record=record, values=values)
    from app.services.report_render.renderer import render_report_pdf

    pdf_path.write_bytes(render_report_pdf("control", render_payload))

    for label, path in {"DOCX": docx_path, "PDF": pdf_path}.items():
        if not path.is_file():
            raise RuntimeError(f"{label} 생성 결과를 찾을 수 없습니다: {path}")

    return {
        "center_grid_id": record.center_grid_id,
        "year": record.year,
        "sido_name": record.sido_name,
        "sigungu_name": record.sigungu_name,
        "risk_score": round(record.risk_score, 2),
        "risk_grade": record.risk_grade,
        "priority_score": round(record.priority_score, 2),
        "priority_grade": record.priority_grade,
        "suspicious_count": record.suspicious_count,
        "sample_count": record.sample_count,
        "pine_area_ha": record.pine_area_ha,
        "pine_ratio_pct": record.pine_ratio_pct,
        "field_survey_linked": field_summary["linked"],
        "start_date": values["start_date"].strftime("%Y-%m-%d"),
        "end_date": values["end_date"].strftime("%Y-%m-%d"),
        "docx_path": str(docx_path),
        "pdf_path": str(pdf_path),
    }
