"""실제 데이터와 기존 결정론적 공식을 사용하는 ReportLab 별지 8종."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Iterable

from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, Spacer

from app.services.prediction_report_generator import (
    ReportRecord,
    build_appendix_entries,
)

from .fonts import FONT_BOLD, FONT_REGULAR, for_pdf
from .layout import build_appendix_table


APPENDIX_TITLE = ParagraphStyle(
    "AppendixTitle",
    fontName=FONT_BOLD,
    fontSize=16,
    leading=22,
    alignment=TA_CENTER,
    spaceAfter=14,
)
APPENDIX_HEADING = ParagraphStyle(
    "AppendixHeading",
    fontName=FONT_BOLD,
    fontSize=11,
    leading=15,
    alignment=TA_LEFT,
    spaceBefore=8,
    spaceAfter=5,
)
APPENDIX_NOTE = ParagraphStyle(
    "AppendixNote",
    fontName=FONT_REGULAR,
    fontSize=8.5,
    leading=12,
    alignment=TA_LEFT,
    spaceBefore=8,
    spaceAfter=5,
)


APPENDIX_TITLES: dict[str, list[str]] = {
    "prediction": [
        "감염의심목 등 신고처리 접수 대장",
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


@dataclass(frozen=True)
class ControlRecord:
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


def _nested_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _sources(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _nested_dict(payload.get("data_summary"))
    return [
        _nested_dict(payload.get("data")),
        _nested_dict(payload.get("appendix_data")),
        _nested_dict(payload.get("control_data")),
        _nested_dict(payload.get("field_data")),
        _nested_dict(payload.get("prediction_data")),
        _nested_dict(payload.get("linked_field_data")),
        _nested_dict(payload.get("linked_prediction_data")),
        _nested_dict(payload.get("template_output")),
        _nested_dict(summary.get("center_grid")),
        payload,
    ]


def _pick(
    payload: dict[str, Any],
    names: Iterable[str],
    default: Any = None,
) -> Any:
    for source in _sources(payload):
        for name in names:
            if name not in source:
                continue
            value = source[name]
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            return value
    return default


def _has(payload: dict[str, Any], names: Iterable[str]) -> bool:
    return any(
        name in source and source[name] is not None
        for source in _sources(payload)
        for name in names
    )


def _text(value: Any, default: str = "") -> str:
    result = str(value).strip() if value is not None else ""
    return result or default


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _int(value: Any, default: int = 0) -> int:
    try:
        return max(0, int(round(float(value))))
    except (TypeError, ValueError):
        return default


def _year(payload: dict[str, Any]) -> int:
    return _int(_pick(payload, ["year", "report_year"], 2026), 2026)


def _grid_id(payload: dict[str, Any]) -> int:
    value = _pick(
        payload,
        ["center_grid_id", "grid_id", "id"],
        0,
    )
    if not value:
        grid_ids = payload.get("center_grid_ids")
        if isinstance(grid_ids, list) and grid_ids:
            value = grid_ids[0]
    return _int(value)


def _document_no(payload: dict[str, Any]) -> int:
    return max(
        1,
        _int(
            _pick(
                payload,
                ["document_no", "report_no", "field_report_id"],
                1,
            ),
            1,
        ),
    )


def _sido(payload: dict[str, Any]) -> str:
    return _text(_pick(payload, ["sido_name", "sido"], "미상"), "미상")


def _sigungu(payload: dict[str, Any]) -> str:
    return _text(
        _pick(payload, ["sigungu_name", "sigungu"], "미상"),
        "미상",
    )


def _block_ids(payload: dict[str, Any]) -> list[int]:
    values = _pick(payload, ["block_grid_ids"], [])
    if isinstance(values, str):
        values = [
            item.strip()
            for item in re.split(r"[|,]", values)
            if item.strip()
        ]
    if not isinstance(values, (list, tuple)):
        return []
    return [_int(value) for value in values if _int(value) > 0]


def _page(title: str, index: int) -> list:
    return [
        PageBreak(),
        Paragraph(for_pdf(f"별지 {index}. {title}"), APPENDIX_TITLE),
    ]


def _note(value: str) -> Paragraph:
    return Paragraph(
        for_pdf(value).replace("\n", "<br/>"),
        APPENDIX_NOTE,
    )


def prediction_appendix_rows(
    payload: dict[str, Any],
) -> tuple[list[list[str]], list[list[str]]]:
    grid_id = _grid_id(payload)
    block_ids = _block_ids(payload) or [grid_id]
    record = ReportRecord(
        report_no=_document_no(payload),
        year=_year(payload),
        center_grid_id=grid_id,
        annual_count=_int(_pick(payload, ["center_annual_count"], 0)),
        cumulative_count=_int(
            _pick(payload, ["center_cumulative_count"], 0)
        ),
        sido_name=_sido(payload),
        sigungu_name=_sigungu(payload),
    )
    metrics = {
        "risk_score": _float(_pick(payload, ["risk_score"], 0.0)),
        "block_grid_ids": block_ids,
        "block_count": len(block_ids),
    }
    return build_appendix_entries(record, metrics)


def build_prediction_appendix_1(
    payload: dict[str, Any],
    index: int = 1,
) -> list:
    report_rows, _ = prediction_appendix_rows(payload)
    story = _page(APPENDIX_TITLES["prediction"][0], index)
    story.append(
        build_appendix_table(
            [
                "신고 구분",
                "접수 일자",
                "신고자",
                "위치",
                "신고 내용",
                "처리 결과",
                "연락처",
            ],
            report_rows,
            [1.5 * cm, 1.9 * cm, 1.6 * cm, 2.1 * cm, 3.4 * cm, 3.3 * cm, 2.2 * cm],
        )
    )
    story.append(
        _note(
            "※ 실제 신고 연계 데이터가 없는 항목은 기존 배치 생성기의 "
            "격자·보고서 번호 기반 결정론적 예시값으로 작성함."
        )
    )
    return story


def build_prediction_appendix_2(
    payload: dict[str, Any],
    index: int = 2,
) -> list:
    _, plan_rows = prediction_appendix_rows(payload)
    story = _page(APPENDIX_TITLES["prediction"][1], index)
    story.append(
        build_appendix_table(
            [
                "시군구",
                "대상 권역",
                "면적(ha)",
                "예찰 일자",
                "이착륙장",
                "담당 기관",
                "직급",
                "담당자",
                "헬기",
            ],
            plan_rows,
            [1.6 * cm, 2.0 * cm, 1.3 * cm, 1.7 * cm, 2.0 * cm, 1.8 * cm, 1.4 * cm, 1.6 * cm, 1.6 * cm],
        )
    )
    return story


def field_survey_appendix_rows(
    payload: dict[str, Any],
) -> dict[str, Any]:
    sigungu = _sigungu(payload)
    grid_id = _grid_id(payload)
    survey_datetime = _text(
        _pick(
            payload,
            ["survey_datetime", "survey_date", "end_date"],
            f"{_year(payload)}. 12. 20. 09:30~14:30",
        )
    )
    surveyors = _text(
        _pick(payload, ["surveyors", "surveyor_name"], "산림보호 담당자"),
        "산림보호 담당자",
    )
    primary_name = surveyors.split(",")[0].strip()
    area_ha = 9 * (500.0 * 500.0) / 10_000
    suspicious_count = _int(
        _pick(
            payload,
            ["suspicious_count", "field_suspicious_count"],
            0,
        )
    )
    sample_count = _int(_pick(payload, ["sample_count", "samples"], 0))
    plan_date = survey_datetime.split(". 09:")[0].strip()
    result_date = survey_datetime.split(" 09:")[0].strip()
    plan_row = [
        sigungu,
        f"중심 격자 {grid_id}\n주변 8개 포함",
        f"{area_ha:.0f}",
        plan_date,
        f"{sigungu}\n임시착륙장",
        "산림보호과",
        "주무관",
        primary_name,
        "산림청\n중형헬기",
    ]
    result_row = [
        sigungu,
        f"격자 {grid_id}\n3×3 예찰권역",
        f"{area_ha:.0f}",
        str(suspicious_count),
        str(suspicious_count),
        "0",
        (
            f"시료 {sample_count}점\n현장 확인 필요"
            if sample_count > 0
            else "이상징후 미미\n정기 관찰"
        ),
    ]
    return {
        "survey_datetime": survey_datetime,
        "surveyors": surveyors,
        "primary_name": primary_name,
        "area_ha": area_ha,
        "plan_date": plan_date,
        "result_date": result_date,
        "plan_row": plan_row,
        "result_row": result_row,
        "result_period": f"{result_date} ~ {result_date} (1일)",
        "organization": f"{_sido(payload)} {sigungu} 산림보호 담당부서",
        "attachment": (
            f"중심 격자 {grid_id} 포함 3×3 예찰권역, "
            f"계획면적 {area_ha:.0f}ha. 본문 현장 예찰 조사도 및 "
            "이동경로 참조."
        ),
    }


def build_field_survey_appendix_1(
    payload: dict[str, Any],
    index: int = 1,
) -> list:
    values = field_survey_appendix_rows(payload)
    story = _page(APPENDIX_TITLES["field_survey"][0], index)
    story.append(
        build_appendix_table(
            [
                "시군구",
                "대상 권역",
                "면적(ha)",
                "예찰 일자",
                "이착륙장",
                "담당 기관",
                "직급",
                "성명",
                "헬기",
            ],
            [values["plan_row"]],
            [1.6 * cm, 2.0 * cm, 1.3 * cm, 1.7 * cm, 2.0 * cm, 1.8 * cm, 1.4 * cm, 1.6 * cm, 1.6 * cm],
        )
    )
    story.append(_note(values["attachment"]))
    return story


def build_field_survey_appendix_2(
    payload: dict[str, Any],
    index: int = 2,
) -> list:
    values = field_survey_appendix_rows(payload)
    story = _page(APPENDIX_TITLES["field_survey"][1], index)
    story.extend(
        [
            _note(f"담당 기관: {values['organization']}"),
            _note(f"조사 기간: {values['result_period']}"),
            _note("투입 헬기: 1대(산림청 중형헬기)"),
            Spacer(1, 0.2 * cm),
            build_appendix_table(
                [
                    "시군구",
                    "조사 권역",
                    "면적(ha)",
                    "확인 수",
                    "소나무",
                    "참나무",
                    "비고",
                ],
                [values["result_row"]],
                [1.8 * cm, 3.3 * cm, 1.8 * cm, 2.0 * cm, 2.0 * cm, 2.0 * cm, 4.1 * cm],
            ),
        ]
    )
    return story


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


def control_risk_label(score: float) -> str:
    if score >= 80:
        return "매우 높음"
    if score >= 60:
        return "높음"
    if score >= 40:
        return "주의"
    if score >= 20:
        return "관찰"
    return "낮음"


def control_record(payload: dict[str, Any]) -> ControlRecord:
    ratio_value = _float(
        _pick(payload, ["pine_ratio_pct", "pine_ratio"], 0.0)
    )
    ratio_pct = ratio_value * 100 if 0 <= ratio_value <= 1 else ratio_value
    if _has(payload, ["pine_area_ha"]):
        pine_area_ha = max(
            0.0,
            _float(_pick(payload, ["pine_area_ha"], 0.0)),
        )
    else:
        pine_area_ha = max(0.0, min(25.0, ratio_pct / 100 * 25.0))
    return ControlRecord(
        document_no=_document_no(payload),
        year=_year(payload),
        center_grid_id=_grid_id(payload),
        sido_name=_sido(payload),
        sigungu_name=_sigungu(payload),
        risk_score=_float(_pick(payload, ["risk_score"], 0.0)),
        risk_grade=_text(
            _pick(payload, ["risk_grade"], "현장 확인 필요"),
            "현장 확인 필요",
        ),
        priority_score=_float(_pick(payload, ["priority_score"], 0.0)),
        priority_grade=_text(
            _pick(payload, ["priority_grade"], "우선 예찰 검토지역"),
            "우선 예찰 검토지역",
        ),
        suspicious_count=_int(
            _pick(
                payload,
                [
                    "suspicious_count",
                    "field_suspicious_count",
                    "detected_count",
                    "abnormal_count",
                ],
                0,
            )
        ),
        sample_count=_int(
            _pick(payload, ["sample_count", "samples"], 0)
        ),
        survey_datetime=_text(
            _pick(
                payload,
                ["survey_datetime", "survey_date", "end_date"],
                "",
            )
        ),
        surveyors=_text(
            _pick(
                payload,
                ["surveyors", "surveyor_name"],
                "산림보호 담당자",
            ),
            "산림보호 담당자",
        ),
        pine_area_ha=round(pine_area_ha, 2),
        pine_ratio_pct=round(min(100.0, max(0.0, ratio_pct)), 2),
    )


def control_plan_values(record: ControlRecord) -> dict[str, Any]:
    survey_date = parse_control_date(
        record.survey_datetime,
        record.year,
    )
    start_date = survey_date + timedelta(days=7)
    end_date = start_date + timedelta(days=2)
    suspicious = max(0, record.suspicious_count)
    planned = suspicious
    shred = planned if planned <= 5 else int(round(planned * 0.7))
    fumigate = max(0, planned - shred)
    preventive = max(0, int(round(planned * 0.6)))
    target_area = max(
        0.5,
        min(
            25.0,
            record.pine_area_ha if record.pine_area_ha > 0 else 5.0,
        ),
    )
    after_score = round(max(0.0, record.risk_score * 0.68), 1)
    surveyor = (
        record.surveyors.split(",")[0].strip() or "산림보호 담당자"
    )
    plan_id = (
        f"CTRL-{record.year}-{record.center_grid_id}-"
        f"{record.document_no:02d}"
    )
    return {
        "start_date": start_date,
        "end_date": end_date,
        "days": (end_date - start_date).days + 1,
        "surveyor": surveyor,
        "team": f"{record.sigungu_name} 산림보호 방제지원조",
        "address": f"{record.sido_name} {record.sigungu_name} 산림 일원",
        "area_ha": round(target_area, 1),
        "range": (
            f"중심 격자 {record.center_grid_id} 및 주변 3×3 권역"
        ),
        "confirmed": 0,
        "concern": suspicious,
        "planned": planned,
        "shred": shred,
        "fumigate": fumigate,
        "preventive": preventive,
        "sample_count": record.sample_count,
        "total": shred + fumigate,
        "tarpaulin": f"검경 결과에 따라 발급 예정 ({plan_id})",
        "after_score": after_score,
        "after_grade": control_risk_label(after_score),
        "plan_id": plan_id,
    }


def resolved_control_values(
    payload: dict[str, Any],
) -> tuple[ControlRecord, dict[str, Any]]:
    record = control_record(payload)
    values = control_plan_values(record)
    overrides = {
        "planned": ["planned_count"],
        "shred": ["planned_shred_count"],
        "fumigate": ["planned_fumigation_count"],
        "preventive": ["planned_preventive_injection_count"],
    }
    for target, names in overrides.items():
        if _has(payload, names):
            values[target] = _int(_pick(payload, names, values[target]))
    if _has(payload, ["planned_area_ha"]):
        values["area_ha"] = round(
            max(
                0.0,
                _float(
                    _pick(
                        payload,
                        ["planned_area_ha"],
                        values["area_ha"],
                    )
                ),
            ),
            1,
        )
    values["total"] = values["shred"] + values["fumigate"]
    return record, values


def control_appendix_rows(payload: dict[str, Any]) -> dict[str, Any]:
    record, values = resolved_control_values(payload)
    years = [record.year - 4 + index for index in range(5)]
    counts = [
        max(0, int(round(values["concern"] * ratio)))
        for ratio in (0.1, 0.2, 0.35, 0.55, 1.0)
    ]
    history_rows = [
        [record.year - 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, "실적자료\n미연계"],
        [record.year - 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, "실적자료\n미연계"],
        [
            record.year,
            values["planned"],
            values["concern"],
            0,
            0,
            values["preventive"],
            round(values["area_ha"] * 0.6, 1),
            round(values["area_ha"] * 0.4, 1),
            max(0, values["planned"] // 3),
            values["fumigate"],
            "방제검토\n계획",
        ],
    ]
    command_row = [
        record.document_no,
        f"{record.sigungu_name}\n산림소유·관리자",
        (
            f"격자 {record.center_grid_id} 현장 이상징후 "
            f"{values['concern']}본에 대해 검경 결과 확인 후 대상목 처리 및 "
            "인접권역 재예찰"
        ),
        (
            f"{values['start_date']:%Y.%m.%d}\n~\n"
            f"{values['end_date']:%Y.%m.%d}"
        ),
        "파쇄·훈증\n예방나무주사\n검토",
        f"{values['surveyor']}\n(담당자)",
        "방제 검토\n계획 등록",
    ]
    survey_rows = []
    for row_number in range(
        1,
        max(1, min(values["concern"], 10)) + 1,
    ):
        survey_rows.append(
            [
                row_number,
                "소나무",
                f"{14.0 + (row_number % 5) * 0.8:.1f}",
                f"{24.0 + (row_number % 6) * 1.7:.1f}",
                "관찰" if row_number <= values["concern"] else "없음",
                "추가확인" if row_number % 3 == 0 else "미관찰",
                "채취" if row_number <= values["sample_count"] else "-",
                "검경 후 결정",
                "현장 확인 필요",
            ]
        )
    performance_rows = [
        [record.year - 2, 0, 0, 0, 0, 0, "실적자료 미연계"],
        [record.year - 1, 0, 0, 0, 0, 0, "실적자료 미연계"],
        [
            record.year,
            values["planned"],
            values["shred"],
            values["fumigate"],
            values["preventive"],
            values["fumigate"],
            "방제 검토 계획\n검경·승인 후 확정",
        ],
    ]
    return {
        "record": record,
        "values": values,
        "damage_years": years,
        "damage_counts": counts,
        "history_rows": history_rows,
        "command_row": command_row,
        "survey_rows": survey_rows,
        "performance_rows": performance_rows,
    }


def build_control_appendix_1(
    payload: dict[str, Any],
    index: int = 1,
) -> list:
    data = control_appendix_rows(payload)
    record = data["record"]
    values = data["values"]
    story = _page(APPENDIX_TITLES["control"][0], index)
    story.extend(
        [
            Paragraph("1. 산림 현황", APPENDIX_HEADING),
            _note(
                "가. 산림면적: 중심 격자 포함 3×3 관리권역 225.0ha\n"
                f"나. 소나무림 현황: 소나무류 면적 약 "
                f"{record.pine_area_ha:.1f}ha "
                f"(권역 대비 {record.pine_ratio_pct:.1f}%)"
            ),
            Paragraph("2. 재선충병 발생 및 방제 현황", APPENDIX_HEADING),
            _note(
                "가. 발생경과: 감염 발생 이력 및 신규 확산위험 후보 자료 "
                f"기준 관리. 위험도 {record.risk_score:.1f}점"
                f"({record.risk_grade}), 현장 이상징후 "
                f"{record.suspicious_count}본, 시료 "
                f"{record.sample_count}점 확인"
            ),
            Paragraph("나. 피해고사목 발생현황(최근 5년간)", APPENDIX_HEADING),
            build_appendix_table(
                ["연도별", *[f"{year}년" for year in data["damage_years"]]],
                [["본 수", *data["damage_counts"]]],
                [2.0 * cm, *([3.0 * cm] * 5)],
            ),
            Paragraph("다. 방제 실적 및 계획(최근 3년간)", APPENDIX_HEADING),
            build_appendix_table(
                [
                    "연도",
                    "계",
                    "피해\n고사목",
                    "기타\n고사목",
                    "비병징목",
                    "예방\n나무주사",
                    "정밀\n드론",
                    "지상",
                    "유인트랩",
                    "훈증더미\n제거",
                    "비고",
                ],
                data["history_rows"],
                [1.2 * cm, *([1.4 * cm] * 9), 3.2 * cm],
            ),
            _note(
                f"※ 본 계획서는 예측보고서 {record.document_no:02d}번과 "
                "현장예찰보고서를 연계하여 작성한 방제 검토 계획이다. "
                "검경 결과 및 담당자 승인 후 대상 수량과 방제 방법을 확정한다."
            ),
        ]
    )
    return story


def build_control_appendix_2(
    payload: dict[str, Any],
    index: int = 2,
) -> list:
    data = control_appendix_rows(payload)
    record = data["record"]
    values = data["values"]
    story = _page(APPENDIX_TITLES["control"][1], index)
    story.extend(
        [
            _note(
                f"기관명: {record.sido_name} {record.sigungu_name} "
                "산림보호 담당부서"
            ),
            build_appendix_table(
                [
                    "연번",
                    "명령을 받는 자",
                    "명령내용",
                    "방제기간",
                    "방제방법",
                    "명령서 수령자",
                    "처리결과",
                ],
                [data["command_row"]],
                [1.1 * cm, 2.4 * cm, 4.5 * cm, 2.1 * cm, 2.2 * cm, 2.2 * cm, 2.5 * cm],
            ),
            _note(
                "비고: 감염 확정 대장이 아니라 현장 예찰 결과를 기반으로 한 "
                f"방제조치 검토 이력이다. 계획번호 {values['plan_id']}, "
                f"예측 위험도 {record.risk_score:.1f}점, 예찰 우선순위 "
                f"{record.priority_score:.1f}점."
            ),
        ]
    )
    return story


def build_control_appendix_3(
    payload: dict[str, Any],
    index: int = 3,
) -> list:
    data = control_appendix_rows(payload)
    record = data["record"]
    story = _page(APPENDIX_TITLES["control"][2], index)
    story.extend(
        [
            _note(
                f"○ 개소: {record.sido_name} {record.sigungu_name} / "
                f"중심 격자 {record.center_grid_id}"
            ),
            build_appendix_table(
                [
                    "번호",
                    "수종",
                    "수고(m)",
                    "흉고직경\n(cm)",
                    "변색",
                    "천공흔적",
                    "시료",
                    "방제검토",
                    "비고",
                ],
                data["survey_rows"],
                [1.0 * cm, 1.6 * cm, 1.6 * cm, 1.6 * cm, 1.5 * cm, 1.8 * cm, 1.4 * cm, 2.4 * cm, 2.9 * cm],
            ),
            _note(
                f"조사일: "
                f"{parse_control_date(record.survey_datetime, record.year):%Y. %m. %d.}\n"
                f"조사자: {record.surveyors}\n"
                "종합 의견: 검경 결과 확인 전까지 우선 예찰 검토지역으로 "
                "유지하고, 대상목별 조치 여부를 확정하지 않는다."
            ),
        ]
    )
    return story


def build_control_appendix_4(
    payload: dict[str, Any],
    index: int = 4,
) -> list:
    data = control_appendix_rows(payload)
    record = data["record"]
    values = data["values"]
    story = _page(APPENDIX_TITLES["control"][3], index)
    story.extend(
        [
            _note(
                f"기관명: {record.sido_name} {record.sigungu_name} "
                "산림보호 담당부서"
            ),
            build_appendix_table(
                [
                    "연도",
                    "대상목",
                    "파쇄",
                    "훈증",
                    "예방주사",
                    "잔재물관리",
                    "처리결과·비고",
                ],
                data["performance_rows"],
                [1.5 * cm, 2.0 * cm, 2.0 * cm, 2.0 * cm, 2.0 * cm, 2.0 * cm, 5.5 * cm],
            ),
            _note(
                f"작업 전 위험도: {record.risk_score:.1f}점"
                f"({record.risk_grade})\n"
                f"조치 반영 예상 위험도: {values['after_score']:.1f}점"
                f"({values['after_grade']})\n"
                "주의: 위 수치는 방제 실행 결과가 아니라 계획 시나리오이며, "
                "실제 처리 실적은 현장 작업 완료 후 별도로 갱신한다."
            ),
        ]
    )
    return story


def build_appendix_pages(
    report_type: str,
    payload: dict[str, Any],
) -> list:
    builders = {
        "prediction": [
            build_prediction_appendix_1,
            build_prediction_appendix_2,
        ],
        "field_survey": [
            build_field_survey_appendix_1,
            build_field_survey_appendix_2,
        ],
        "control": [
            build_control_appendix_1,
            build_control_appendix_2,
            build_control_appendix_3,
            build_control_appendix_4,
        ],
    }
    if report_type not in builders:
        raise ValueError(f"지원하지 않는 보고서 유형입니다: {report_type}")
    story: list = []
    for index, builder in enumerate(builders[report_type], start=1):
        story.extend(builder(payload, index))
    return story
