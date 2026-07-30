#!/usr/bin/env python3
"""원본 배치 별지 공식과 경량 ReportLab 데이터 행을 셀 단위 비교한다."""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "rag-backend"
OUTPUT_ROOT = (
    PROJECT_ROOT
    / "data"
    / "precompute_logs"
    / "reportlab_appendix_compare"
)
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.report_render.appendices import (  # noqa: E402
    control_appendix_rows,
    control_plan_values,
    control_record,
    field_survey_appendix_rows,
    prediction_appendix_rows,
)


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"모듈을 불러올 수 없습니다: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def normalized(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalized(item) for item in value]
    return value


def compare(label: str, old: Any, new: Any) -> dict[str, Any]:
    old_value = normalized(old)
    new_value = normalized(new)
    return {
        "label": label,
        "equal": old_value == new_value,
        "old": old_value,
        "new": new_value,
    }


def prediction_check(prediction: Any, payload: dict[str, Any]) -> dict[str, Any]:
    record = prediction.ReportRecord(
        report_no=payload["document_no"],
        year=payload["year"],
        center_grid_id=payload["center_grid_id"],
        annual_count=0,
        cumulative_count=0,
        sido_name=payload["sido_name"],
        sigungu_name=payload["sigungu_name"],
    )
    metrics = {
        "risk_score": payload["risk_score"],
        "block_grid_ids": payload["block_grid_ids"],
        "block_count": len(payload["block_grid_ids"]),
    }
    old_rows = prediction.build_appendix_entries(record, metrics)
    new_rows = prediction_appendix_rows(payload)
    return compare("prediction 전체 셀", old_rows, new_rows)


def field_check(field: Any, payload: dict[str, Any]) -> list[dict[str, Any]]:
    record = field.ReportRecord(
        report_no=payload["document_no"],
        year=payload["year"],
        center_grid_id=payload["center_grid_id"],
        annual_count=0,
        cumulative_count=0,
        sido_name=payload["sido_name"],
        sigungu_name=payload["sigungu_name"],
    )
    survey = field.FieldSurveyData(
        survey_datetime=payload["survey_datetime"],
        weather="맑음",
        temperature_c=18.0,
        wind_speed_ms=1.5,
        organization_team="산림보호과",
        surveyors=payload["surveyors"],
        discovery_route="현장 예찰",
        address="산림 일원",
        forest_compartment="1임반",
        latitude=35.0,
        longitude=128.0,
        ai_result="현장 확인 필요",
        overall_judgment="우선 예찰 검토",
        species="소나무",
        total_trees=20,
        detail_classification="변색",
        tree_height_m=15.0,
        dbh_cm=27.0,
        discoloration_stage="관찰",
        vector_trace="미관찰",
        bark_wood_observation="추가 확인",
        investigator_opinion="현장 확인 필요",
        sample_description="목편 3점",
        qr_code="QR-TEST",
        system_link_result="연계",
        followup_date="2021.12.25",
        inspection_agency_status="검경 의뢰",
        followup_plan="재예찰",
        route_type="차량·도보",
        sample_count=payload["sample_count"],
        suspicious_count=payload["suspicious_count"],
    )
    template_path = (
        BACKEND_ROOT
        / "data"
        / "report_templates"
        / "[양식]소나무재선충병 현장 예찰 보고서_빈양식.docx"
    )
    output_directory = OUTPUT_ROOT / "original_field"
    output_directory.mkdir(parents=True, exist_ok=True)
    captured_plan: list[str] = []
    captured_result: list[str] = []
    original_draw = field.draw_text_fit

    def capture_plan(_draw: Any, _box: Any, value: Any, **_kwargs: Any) -> None:
        captured_plan.append(str(value))

    field.draw_text_fit = capture_plan
    try:
        field.build_air_survey_plan_appendix(
            template_path,
            output_directory / "plan.png",
            record,
            survey,
            {},
        )
    finally:
        field.draw_text_fit = original_draw

    def capture_result(_draw: Any, _box: Any, value: Any, **_kwargs: Any) -> None:
        captured_result.append(str(value))

    field.draw_text_fit = capture_result
    try:
        field.build_air_survey_result_appendix(
            template_path,
            output_directory / "result.png",
            record,
            survey,
            {},
        )
    finally:
        field.draw_text_fit = original_draw

    values = field_survey_appendix_rows(payload)
    expected_plan = [
        values["plan_row"][0],
        values["plan_row"][1],
        values["plan_row"][2],
        values["plan_row"][3],
        values["plan_row"][4],
        values["plan_row"][5],
        values["plan_row"][6],
        values["plan_row"][7],
        values["plan_row"][8],
        values["attachment"],
    ]
    expected_result = [
        values["organization"],
        values["result_period"],
        "1대(산림청 중형헬기)",
        *values["result_row"],
    ]
    return [
        compare("field_survey 별지1 전체 셀", captured_plan, expected_plan),
        compare(
            "field_survey 별지2 전체 셀",
            captured_result,
            expected_result,
        ),
    ]


def _capture_control_cells(
    control: Any,
    function_name: str,
    record: Any,
    values: dict[str, Any],
    output_path: Path,
) -> list[str]:
    captured: list[str] = []
    original_centered = control.centered

    def capture(_draw: Any, _box: Any, value: Any, *_args: Any, **_kwargs: Any) -> None:
        captured.append(str(value))

    control.centered = capture
    try:
        getattr(control, function_name)(record, values, output_path)
    finally:
        control.centered = original_centered
    # base_page()가 표를 그리기 전에 페이지 제목을 centered()로 한 번
    # 기록한다. 사용자가 요청한 표 셀 비교에서는 이 제목을 제외한다.
    return captured[1:]


def control_check(control: Any, payload: dict[str, Any]) -> list[dict[str, Any]]:
    record = control.Record(
        document_no=payload["document_no"],
        year=payload["year"],
        center_grid_id=payload["center_grid_id"],
        sido_name=payload["sido_name"],
        sigungu_name=payload["sigungu_name"],
        risk_score=payload["risk_score"],
        risk_grade=payload["risk_grade"],
        priority_score=payload["priority_score"],
        priority_grade=payload["priority_grade"],
        suspicious_count=payload["suspicious_count"],
        sample_count=payload["sample_count"],
        survey_datetime=payload["survey_datetime"],
        surveyors=payload["surveyors"],
        source_prediction_file="prediction.pdf",
        source_field_file="field.pdf",
        pine_area_ha=payload["pine_area_ha"],
        pine_ratio_pct=payload["pine_ratio_pct"],
    )
    old_values = control.plan_values(record)
    new_record = control_record(payload)
    new_values = control_plan_values(new_record)
    data = control_appendix_rows(payload)
    output_directory = OUTPUT_ROOT / "original_control"
    output_directory.mkdir(parents=True, exist_ok=True)

    app1 = _capture_control_cells(
        control,
        "create_appendix_1",
        record,
        old_values,
        output_directory / "appendix1.png",
    )
    expected1 = ["연도별", "본 수"]
    for year, count in zip(data["damage_years"], data["damage_counts"]):
        expected1.extend([f"{year}년", str(count)])
    headers1 = [
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
    ]
    expected1.extend(headers1)
    expected1.extend(str(value) for row in data["history_rows"] for value in row)

    app2 = _capture_control_cells(
        control,
        "create_appendix_2",
        record,
        old_values,
        output_directory / "appendix2.png",
    )
    expected2 = [
        "연번",
        "명령을 받는 자",
        "명령내용",
        "방제기간",
        "방제방법",
        "명령서 수령자",
        "처리결과",
        *[str(value) for value in data["command_row"]],
    ]
    app3 = _capture_control_cells(
        control,
        "create_appendix_3",
        record,
        old_values,
        output_directory / "appendix3.png",
    )
    expected3 = [
        "번호",
        "수종",
        "수고(m)",
        "흉고직경\n(cm)",
        "변색",
        "천공흔적",
        "시료",
        "방제검토",
        "비고",
        *[str(value) for row in data["survey_rows"] for value in row],
    ]
    app4 = _capture_control_cells(
        control,
        "create_appendix_4",
        record,
        old_values,
        output_directory / "appendix4.png",
    )
    expected4 = [
        "연도",
        "대상목",
        "파쇄",
        "훈증",
        "예방주사",
        "잔재물관리",
        "처리결과·비고",
        *[str(value) for row in data["performance_rows"] for value in row],
    ]
    return [
        compare("control plan_values 전체 키", old_values, new_values),
        compare("control 별지1 전체 표 셀", app1, expected1),
        compare("control 별지2 전체 표 셀", app2, expected2),
        compare("control 별지3 전체 표 셀", app3, expected3),
        compare("control 별지4 전체 표 셀", app4, expected4),
    ]


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    prediction = load_module(
        "appendix_original_prediction",
        PROJECT_ROOT / "scripts" / "generate_vworld_prediction_reports.py",
    )
    field = load_module(
        "appendix_original_field",
        PROJECT_ROOT / "scripts" / "generate_vworld_field_survey_reports.py",
    )
    control = load_module(
        "appendix_original_control",
        PROJECT_ROOT / "scripts" / "generate_vworld_control_reports_linked.py",
    )
    payload = {
        "document_no": 7,
        "year": 2021,
        "center_grid_id": 1001377,
        "sido_name": "경상남도",
        "sigungu_name": "거제시",
        "risk_score": 82.4,
        "risk_grade": "높음",
        "priority_score": 74.8,
        "priority_grade": "우선 예찰",
        "block_grid_ids": [
            1000156,
            1000157,
            1000158,
            1001376,
            1001377,
            1001378,
            1002596,
            1002597,
            1002598,
        ],
        "survey_datetime": "2021. 12. 18. 09:30~14:30",
        "surveyors": "홍길동, 김산림",
        "suspicious_count": 7,
        "sample_count": 3,
        "pine_area_ha": 8.25,
        "pine_ratio_pct": 33.0,
    }
    checks = [
        prediction_check(prediction, payload),
        *field_check(field, payload),
        *control_check(control, payload),
    ]
    result = {
        "input": payload,
        "checks": checks,
        "all_equal": all(item["equal"] for item in checks),
    }
    result_path = OUTPUT_ROOT / "comparison.json"
    result_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["all_equal"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
