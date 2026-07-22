from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = BACKEND_ROOT / "data"
CANDIDATE_GEOJSON = DATA_ROOT / "final_ui_candidate_v4.geojson"
DRAFT_ROOT = DATA_ROOT / "generated_drafts"

REPORT_LABELS = {
    "prediction": "신규 확산위험 분석 보고서",
    "field_survey": "현장 예찰 결과 보고서",
    "control": "방제 결과 보고서",
}

ALIASES = {
    "grid_id": ["center_grid_id", "grid_id", "id", "GRID_ID"],
    "sido": ["sido_name", "sido", "ctpv_nm", "SIDO_NM"],
    "sigungu": ["sigungu_name", "sigungu", "sgg_nm", "SIGUNGU_NM"],
    "risk_score": ["risk_score", "riskScore", "pred_score", "prediction_score", "probability"],
    "risk_grade": ["risk_grade", "riskGrade", "risk_level", "risk_label"],
    "priority_score": ["field_priority_score_v3", "priority_score", "priorityScore", "survey_priority_score"],
    "priority_grade": ["field_priority_grade_v3", "priority_grade", "priorityGrade", "priority_label", "priority_stage_label"],
    "pine_ratio": ["pine_ratio", "pineRatio"],
    "infection_pressure": ["infection_pressure", "recent_pressure_score", "recent_infection_pressure"],
    "access_score": ["access_score_v3", "access_score", "accessibility_score"],
    "road_distance": ["road_dist_m", "distance_to_nearest_road_m_v3"],
    "road_type": ["road_class_near", "nearest_road_type"],
    "environment_flag": ["env_flag", "environment_caution_flag_v3"],
}


def _pick(props: dict[str, Any], key: str) -> Any:
    for name in ALIASES[key]:
        value = props.get(name)
        if value is not None and str(value).strip() != "":
            return value
    return None


def _text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text[:-2] if text.endswith(".0") and text[:-2].isdigit() else text


def _float(value: Any) -> float | None:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _max(values: list[float]) -> float | None:
    return round(max(values), 2) if values else None


def _safe_name(value: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", value).strip()[:120] or "report"


def _load_features() -> list[dict[str, Any]]:
    if not CANDIDATE_GEOJSON.is_file():
        raise FileNotFoundError(f"현재 분석 데이터 파일이 없습니다: {CANDIDATE_GEOJSON}")
    payload = json.loads(CANDIDATE_GEOJSON.read_text(encoding="utf-8"))
    features = payload.get("features")
    if not isinstance(features, list):
        raise ValueError("GeoJSON features 배열을 확인할 수 없습니다.")
    return features


def _geometry_center(geometry: dict[str, Any] | None) -> tuple[float | None, float | None]:
    values: list[tuple[float, float]] = []

    def visit(item: Any) -> None:
        if not isinstance(item, list):
            return
        if len(item) >= 2 and isinstance(item[0], (int, float)) and isinstance(item[1], (int, float)):
            values.append((float(item[0]), float(item[1])))
            return
        for child in item:
            visit(child)

    visit((geometry or {}).get("coordinates"))
    if not values:
        return None, None
    return round(sum(x for x, _ in values) / len(values), 7), round(sum(y for _, y in values) / len(values), 7)


def collect_current_data(sido_name: str, sigungu_name: str, grid_ids: list[str]) -> dict[str, Any]:
    selected: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    wanted = set(grid_ids)

    for feature in _load_features():
        props = feature.get("properties") or {}
        if not isinstance(props, dict):
            continue
        if sido_name and _text(_pick(props, "sido")) != sido_name:
            continue
        if sigungu_name and _text(_pick(props, "sigungu")) != sigungu_name:
            continue
        if wanted and _text(_pick(props, "grid_id")) not in wanted:
            continue
        selected.append((props, feature.get("geometry")))

    if not selected:
        raise ValueError("선택 지역과 중심 격자에 해당하는 분석 데이터가 없습니다.")

    risks = [v for v in (_float(_pick(p, "risk_score")) for p, _ in selected) if v is not None]
    priorities = [v for v in (_float(_pick(p, "priority_score")) for p, _ in selected) if v is not None]
    pine = [v for v in (_float(_pick(p, "pine_ratio")) for p, _ in selected) if v is not None]
    pressure = [v for v in (_float(_pick(p, "infection_pressure")) for p, _ in selected) if v is not None]
    access = [v for v in (_float(_pick(p, "access_score")) for p, _ in selected) if v is not None]

    center_props, center_geometry = selected[0]
    longitude, latitude = _geometry_center(center_geometry)
    return {
        "selected_grid_count": len(selected),
        "grid_ids": [_text(_pick(p, "grid_id")) for p, _ in selected],
        "average_risk_score": _mean(risks),
        "maximum_risk_score": _max(risks),
        "average_priority_score": _mean(priorities),
        "maximum_priority_score": _max(priorities),
        "average_pine_ratio": _mean(pine),
        "average_infection_pressure": _mean(pressure),
        "average_access_score": _mean(access),
        "center_grid": {
            "grid_id": _text(_pick(center_props, "grid_id")),
            "risk_score": _float(_pick(center_props, "risk_score")),
            "risk_grade": _text(_pick(center_props, "risk_grade")),
            "priority_score": _float(_pick(center_props, "priority_score")),
            "priority_grade": _text(_pick(center_props, "priority_grade")),
            "pine_ratio": _float(_pick(center_props, "pine_ratio")),
            "infection_pressure": _float(_pick(center_props, "infection_pressure")),
            "access_score": _float(_pick(center_props, "access_score")),
            "road_distance": _float(_pick(center_props, "road_distance")),
            "road_type": _text(_pick(center_props, "road_type")),
            "environment_flag": _text(_pick(center_props, "environment_flag")),
            "longitude": longitude,
            "latitude": latitude,
        },
    }


def build_sections(payload: dict[str, Any], summary: dict[str, Any]) -> list[dict[str, str]]:
    region = f"{payload['sido_name']} {payload.get('sigungu_name', '')}".strip()
    center = summary.get("center_grid", {})
    common = (
        f"대상 지역은 {region}, 중심 격자는 {center.get('grid_id', '-')}이다. "
        f"위험도 {center.get('risk_score') or '-'}점({center.get('risk_grade') or '등급 없음'}), "
        f"예찰 우선순위 {center.get('priority_score') or '-'}점({center.get('priority_grade') or '등급 없음'})을 기준으로 작성하였다."
    )
    report_type = payload["report_type"]
    if report_type == "field_survey":
        sections = [
            {"key": "overview", "heading": "1. 현장 예찰 개요", "content": common},
            {"key": "result", "heading": "2. 현장 예찰 결과", "content": "본 문서는 현장 확인 결과를 등록하기 위한 행정 초안이다. 감염 확정 전에는 현장 확인 필요 및 시료 검경 대기로 표현한다."},
            {"key": "action", "heading": "3. 후속 조치", "content": "현장 이상징후 확인 시 시료 채취, QR 연계, 검경 의뢰 및 후속 예찰 일정을 기록한다."},
        ]
    elif report_type == "control":
        sections = [
            {"key": "overview", "heading": "1. 방제 개요", "content": common},
            {"key": "result", "heading": "2. 방제 결과", "content": "현장 확인 및 검경 결과에 따라 적용한 파쇄·훈증·예방나무주사 등의 방제 실적을 기록한다."},
            {"key": "followup", "heading": "3. 사후 관리", "content": "방제 완료 후 위험도 변화, 잔재물 관리 및 후속 모니터링 일정을 기록한다."},
        ]
    else:
        sections = [
            {"key": "overview", "heading": "1. 분석 개요", "content": common},
            {"key": "risk", "heading": "2. 신규 확산위험 후보 분석", "content": "감염 확정값이 아닌 신규 발생 후보지역 예측 결과이며, 상위 후보격자는 우선 예찰 검토지역으로 활용한다."},
            {"key": "action", "heading": "3. 선제 대응", "content": "위험도와 예찰 우선순위를 함께 검토하여 현장 예찰, 드론 확인 및 행정 조치 순서를 수립한다."},
        ]
    if payload.get("user_notes", "").strip():
        sections.append({"key": "memo", "heading": "담당자 메모", "content": payload["user_notes"].strip()})
    return sections


def _draft_path(draft_id: str) -> Path:
    return DRAFT_ROOT / draft_id / "draft.json"


def create_draft(payload: dict[str, Any], created_by: str) -> dict[str, Any]:
    grid_ids = [str(v).strip() for v in payload.get("center_grid_ids", []) if str(v).strip()]
    if len(grid_ids) != 1:
        raise ValueError("중심 격자 ID는 지도에서 1개만 선택해야 합니다.")

    now = datetime.now().astimezone().isoformat(timespec="seconds")
    draft_id = f"DRAFT-{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
    summary = collect_current_data(payload["sido_name"], payload["sigungu_name"], grid_ids)
    title = payload.get("title", "").strip() or f"{payload['year']}년 {payload['sigungu_name']} {REPORT_LABELS[payload['report_type']]}"

    draft = {
        "draft_id": draft_id,
        "report_type": payload["report_type"],
        "title": title,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
        "created_by": created_by,
        "year": payload["year"],
        "start_date": payload["start_date"],
        "end_date": payload["end_date"],
        "sido_name": payload["sido_name"],
        "sigungu_name": payload["sigungu_name"],
        "center_grid_ids": grid_ids,
        "include_sections": payload.get("include_sections", {}),
        "data_summary": summary,
        "sections": build_sections(payload, summary),
        "user_notes": payload.get("user_notes", "").strip(),
    }
    save_draft(draft)
    return draft


def save_draft(draft: dict[str, Any]) -> None:
    path = _draft_path(draft["draft_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")


def load_draft(draft_id: str) -> dict[str, Any]:
    path = _draft_path(draft_id)
    if not path.is_file():
        raise FileNotFoundError(f"초안을 찾을 수 없습니다: {draft_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def update_draft(draft_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    draft = load_draft(draft_id)
    if payload.get("title") is not None:
        draft["title"] = payload["title"].strip() or draft["title"]
    if payload.get("status") is not None:
        draft["status"] = payload["status"]
    if payload.get("sections") is not None:
        draft["sections"] = payload["sections"]
    draft["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    save_draft(draft)
    return draft


def build_xlsx(draft: dict[str, Any]) -> Path:
    directory = _draft_path(draft["draft_id"]).parent
    path = directory / f"{_safe_name(draft['title'])}.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "보고서 요약"
    sheet.append(["항목", "값"])
    sheet["A1"].font = sheet["B1"].font = Font(bold=True)
    sheet["A1"].fill = sheet["B1"].fill = PatternFill("solid", fgColor="D9EAD3")
    center = draft["data_summary"].get("center_grid", {})
    for key, value in [
        ("문서 유형", REPORT_LABELS[draft["report_type"]]),
        ("제목", draft["title"]),
        ("대상 지역", f"{draft['sido_name']} {draft['sigungu_name']}"),
        ("중심 격자", center.get("grid_id", "")),
        ("위험도", center.get("risk_score", "")),
        ("예찰 우선순위", center.get("priority_score", "")),
    ]:
        sheet.append([key, value])
    for row in sheet.iter_rows():
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.column_dimensions["A"].width = 24
    sheet.column_dimensions["B"].width = 60
    workbook.save(path)
    return path
