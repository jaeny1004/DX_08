from __future__ import annotations

import csv
import re
import shutil
import subprocess
from datetime import date, datetime
from pathlib import Path
from typing import Any

from docx import Document

from app.services.report_draft_service import (
    DATA_ROOT,
    REPORT_LABELS,
    load_draft,
    save_draft,
)

TEMPLATE_ROOT = DATA_ROOT / "report_templates"
GENERATED_REPORT_ROOT = DATA_ROOT / "generated_reports"

TEMPLATE_FILES = {
    "prediction": "[양식]소나무재선충병 발생 예측 보고서_빈양식.docx",
    "field_survey": "[양식]소나무재선충병 현장 예찰 보고서_빈양식.docx",
    "control": "[양식]소나무재선충병 방제 보고서_빈양식.docx",
}

REPORT_DIRECTORIES = {
    "prediction": "prediction_30",
    "field_survey": "field_survey_30",
    "control": "control_30",
}


def _value(value: Any, suffix: str = "") -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, float):
        return f"{value:.2f}".rstrip("0").rstrip(".") + suffix
    return str(value) + suffix


def _days(start: str, end: str) -> int:
    try:
        return (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    except ValueError:
        return 1


def _replace_paragraph(paragraph, replacements: dict[str, str]) -> None:
    original = paragraph.text
    updated = original
    for source, target in replacements.items():
        updated = updated.replace(source, target)
    if updated == original:
        return
    if paragraph.runs:
        paragraph.runs[0].text = updated
        for run in paragraph.runs[1:]:
            run.text = ""
    else:
        paragraph.text = updated


def _all_paragraphs(document: Document):
    for paragraph in document.paragraphs:
        yield paragraph
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    yield paragraph
    for section in document.sections:
        for paragraph in section.header.paragraphs:
            yield paragraph
        for paragraph in section.footer.paragraphs:
            yield paragraph


def _replacements(draft: dict[str, Any]) -> dict[str, str]:
    center = draft["data_summary"].get("center_grid", {})
    region = f"{draft['sido_name']} {draft['sigungu_name']}".strip()
    period = f"{draft['start_date']} ~ {draft['end_date']}"
    risk = _value(center.get("risk_score"))
    risk_grade = _value(center.get("risk_grade"))
    priority = _value(center.get("priority_score"))
    priority_grade = _value(center.get("priority_grade"))
    pine_ratio = center.get("pine_ratio")
    pine_percent = pine_ratio * 100 if isinstance(pine_ratio, (int, float)) and pine_ratio <= 1 else pine_ratio

    common = {
        "[작성일]": datetime.now().strftime("%Y-%m-%d"),
        "[시작일]": draft["start_date"],
        "[종료일]": draft["end_date"],
        "[일수]": str(_days(draft["start_date"], draft["end_date"])),
        "[지역]": region,
        "[기간]": period,
        "[주소]": region,
        "[격자 ID]": str(center.get("grid_id", "-")),
        "[점수]": risk,
        "[등급]": risk_grade,
        "[비율]": _value(pine_percent),
        "[거리]": _value(center.get("road_distance")),
        "[도로 유형]": _value(center.get("road_type")),
        "[해당 여부]": _value(center.get("environment_flag")),
        "[위도]": _value(center.get("latitude")),
        "[경도]": _value(center.get("longitude")),
        "[일시]": draft["end_date"],
        "[입력]": draft.get("user_notes") or "현장 확인 후 담당자 입력",
        "-지역, 기간-": f"-{region}, {period}-",
        "[소속·조]": "담당 부서",
        "[성명]": draft.get("created_by", "담당자"),
        "[정보]": "현장 확인 필요",
        "[날씨]": "현장 입력",
        "[수종]": "소나무류",
        "[수량]": "현장 집계",
        "[면적]": "현장 집계",
        "[포함 범위]": region,
        "[단계 수]": "5",
        "[단계]": "AI 분석",
        "[기간] 내": "향후 1~6개월 내",
        "[방향·대상 지역]": "인접 후보격자",
        "[결과]": "변화 가능성",
        "[방향]": "인접 확산 방향",
        "[인접 격자 1]": "현장 검토 대상",
        "[인접 격자 2]": "현장 검토 대상",
        "[인접 격자 3]": "현장 검토 대상",
        "[인접 격자 4]": "현장 검토 대상",
        "[대응 단계명]": "우선 예찰 및 현장 확인",
        "[일자]": draft["end_date"],
        "[대상 격자]": str(center.get("grid_id", "-")),
        "[실행 내용]": "신규 확산위험 후보 현장 확인",
    }

    # 문맥별 수치가 필요한 문장을 먼저 완성한다.
    common.update({
        "예찰 우선순위 ‘[점수]’점([등급])": f"예찰 우선순위 ‘{priority}’점({priority_grade})",
        "최근 감염압력 ‘[점수]’점": f"최근 감염압력 ‘{_value(center.get('infection_pressure'))}’점",
        "접근성 ‘[점수]’점": f"접근성 ‘{_value(center.get('access_score'))}’점",
        "[점수·등급 또는 판단 내용]": f"위험도 {risk}점({risk_grade}), 예찰 우선순위 {priority}점({priority_grade})",
        "[현장 확인 필요 여부 및 판단 근거 입력]": "신규 확산위험 후보로 현장 확인이 필요하며, 최종 판단은 시료 검경 결과를 따른다.",
        "[현장 조사자 의견 입력]": draft.get("user_notes") or "현장 조사 결과를 입력해 주십시오.",
        "[처리 결과 입력]": "플랫폼 현장 이력과 연계 등록",
        "[현장 확인·검경 결과에 따른 조치 입력]": "검경 결과 확인 후 예찰·방제 조치 결정",
        "[현장 상태 입력]": "방제 전 현장 상태 기록",
        "[조치 결과 입력]": draft.get("user_notes") or "방제 결과 및 처리 수량 입력",
        "[보고 대상·승인 절차 입력]": "담당 부서 검토 후 내부 결재",
        "[후속 사업 및 행정 연계 계획]": "사후 모니터링 결과를 플랫폼 이력에 등록",
    })
    return common


def apply_report_template(draft_id: str) -> dict[str, Any]:
    draft = load_draft(draft_id)
    report_type = draft["report_type"]
    template_name = TEMPLATE_FILES.get(report_type)
    if not template_name:
        raise ValueError(f"지원하지 않는 문서 유형입니다: {report_type}")

    template_path = TEMPLATE_ROOT / template_name
    if not template_path.is_file():
        raise FileNotFoundError(f"행정양식 파일이 없습니다: {template_path}")

    output_dir = DATA_ROOT / "generated_drafts" / draft_id / "template"
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_title = re.sub(r'[\\/:*?"<>|]+', "_", draft["title"])
    docx_path = output_dir / f"{safe_title}.docx"
    pdf_path = output_dir / f"{safe_title}.pdf"

    document = Document(template_path)
    replacements = _replacements(draft)
    for paragraph in _all_paragraphs(document):
        _replace_paragraph(paragraph, replacements)
    document.save(docx_path)

    libreoffice = shutil.which("libreoffice") or shutil.which("soffice")
    if not libreoffice:
        raise RuntimeError("LibreOffice가 없어 행정양식 PDF를 생성할 수 없습니다.")
    completed = subprocess.run(
        [libreoffice, "--headless", "--convert-to", "pdf", "--outdir", str(output_dir), str(docx_path)],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if completed.returncode != 0 or not pdf_path.is_file():
        raise RuntimeError(f"행정양식 PDF 변환 실패: {completed.stderr.strip() or completed.stdout.strip()}")

    center = draft["data_summary"].get("center_grid", {})
    template_output = {
        "status": "generated",
        "center_grid_id": center.get("grid_id"),
        "year": draft["year"],
        "sido_name": draft["sido_name"],
        "sigungu_name": draft["sigungu_name"],
        "risk_score": center.get("risk_score"),
        "risk_grade": center.get("risk_grade"),
        "priority_score": center.get("priority_score"),
        "priority_grade": center.get("priority_grade"),
        "docx_path": str(docx_path.resolve()),
        "pdf_path": str(pdf_path.resolve()),
    }
    draft["template_output"] = template_output
    save_draft(draft)
    return template_output


def get_template_file(draft_id: str, file_format: str) -> Path:
    if file_format not in {"docx", "pdf"}:
        raise ValueError("행정양식 파일은 DOCX와 PDF만 지원합니다.")
    draft = load_draft(draft_id)
    output = draft.get("template_output")
    if not isinstance(output, dict):
        raise FileNotFoundError("행정양식이 아직 생성되지 않았습니다.")
    path = Path(str(output.get(f"{file_format}_path", ""))).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"생성 파일을 찾을 수 없습니다: {path}")
    return path


def _next_document_no(csv_path: Path) -> str:
    maximum = 0
    if csv_path.is_file():
        with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
            for row in csv.DictReader(file):
                value = str(row.get("document_no", "")).strip()
                if value.isdigit():
                    maximum = max(maximum, int(value))
    return str(maximum + 1)


def register_report(draft_id: str) -> dict[str, Any]:
    draft = load_draft(draft_id)
    if isinstance(draft.get("registered_report"), dict):
        return draft["registered_report"]

    report_type = draft["report_type"]
    directory = GENERATED_REPORT_ROOT / REPORT_DIRECTORIES[report_type]
    pdf_dir = directory / "pdf"
    docx_dir = directory / "docx"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    docx_dir.mkdir(parents=True, exist_ok=True)
    csv_path = directory / "문서목록.csv"
    document_no = _next_document_no(csv_path)

    source_pdf = get_template_file(draft_id, "pdf")
    source_docx = get_template_file(draft_id, "docx")
    file_stem = f"{document_no}_{draft['year']}_{draft['sigungu_name']}_{REPORT_LABELS[report_type]}"
    pdf_name = f"{file_stem}.pdf"
    docx_name = f"{file_stem}.docx"
    shutil.copy2(source_pdf, pdf_dir / pdf_name)
    shutil.copy2(source_docx, docx_dir / docx_name)

    existing_headers: list[str] = []
    if csv_path.is_file():
        with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.reader(file)
            existing_headers = next(reader, [])

    default_headers = [
        "document_no", "file_name", "year", "center_grid_id", "sido_name", "sigungu_name",
        "risk_score", "risk_grade", "priority_score", "priority_grade", "created_at",
    ]
    headers = existing_headers or default_headers
    center = draft["data_summary"].get("center_grid", {})
    row = {
        "document_no": document_no,
        "file_name": pdf_name,
        "year": str(draft["year"]),
        "center_grid_id": str(center.get("grid_id", "")),
        "sido_name": draft["sido_name"],
        "sigungu_name": draft["sigungu_name"],
        "risk_score": _value(center.get("risk_score")),
        "risk_grade": _value(center.get("risk_grade")),
        "priority_score": _value(center.get("priority_score")),
        "priority_grade": _value(center.get("priority_grade")),
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "prediction_link_status": "UNLINKED",
        "link_status": "UNLINKED",
        "control_status": "방제 결과 등록",
        "survey_datetime": draft["end_date"],
    }

    write_header = not csv_path.is_file() or csv_path.stat().st_size == 0
    with csv_path.open("a", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=headers, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerow({key: row.get(key, "") for key in headers})

    registered = {
        "report_type": report_type,
        "document_no": document_no,
        "file_name": pdf_name,
    }
    draft["status"] = "registered"
    draft["registered_report"] = registered
    save_draft(draft)
    return registered
