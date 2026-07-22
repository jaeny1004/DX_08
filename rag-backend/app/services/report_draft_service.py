from __future__ import annotations

import json
import math
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
    "risk_grade": ["risk_grade", "riskGrade", "risk_level", "risk_label", "risk_stage_label"],
    "priority_score": ["field_priority_score_v3", "priority_score", "priorityScore", "survey_priority_score"],
    "priority_grade": ["field_priority_grade_v3", "priority_grade_v3", "priority_grade", "priorityGrade", "priority_label", "priority_stage_label"],
    "pine_ratio": ["pine_ratio", "pineRatio"],
    "infection_pressure": ["infection_pressure", "recent_pressure_score", "recent_infection_pressure"],
    "access_score": ["access_score_v3", "access_score", "accessibility_score"],
    "road_distance": ["road_dist_m", "distance_to_nearest_road_m_v3"],
    "road_type": ["road_class_near", "nearest_road_type"],
    "environment_flag": ["env_flag", "environment_caution_flag_v3"],
    "recommended_action": ["field_recommended_action_v3", "recommended_action", "action_text"],
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


def _normalize_risk_grade(value: Any) -> str:
    text = _text(value)
    mapping = {
        "고위험 1순위 후보": "매우 높음",
        "고위험 2순위 후보": "높음",
        "고위험 3순위 후보": "주의",
        "고위험 4순위 후보": "관찰",
    }
    return mapping.get(text, text or "등급 없음")


def _normalize_priority_grade(value: Any) -> str:
    text = _text(value)
    mapping = {
        "예찰 1순위 후보": "최우선 예찰",
        "예찰 2순위 후보": "우선 예찰",
        "예찰 3순위 후보": "집중 관찰",
        "예찰 4순위 후보": "정기 관찰",
    }
    return mapping.get(text, text or "일반 관리")


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


def _distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = a
    lon2, lat2 = b
    radius = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0.0, 1 - h)))


def _direction(a: tuple[float, float], b: tuple[float, float]) -> str:
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    angle = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    labels = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"]
    return labels[int((angle + 22.5) // 45) % 8]


def _feature_record(feature: dict[str, Any]) -> dict[str, Any] | None:
    props = feature.get("properties") or {}
    if not isinstance(props, dict):
        return None
    lon, lat = _geometry_center(feature.get("geometry"))
    return {
        "grid_id": _text(_pick(props, "grid_id")),
        "sido_name": _text(_pick(props, "sido")),
        "sigungu_name": _text(_pick(props, "sigungu")),
        "risk_score": _float(_pick(props, "risk_score")),
        "risk_grade": _normalize_risk_grade(_pick(props, "risk_grade")),
        "priority_score": _float(_pick(props, "priority_score")),
        "priority_grade": _normalize_priority_grade(_pick(props, "priority_grade")),
        "pine_ratio": _float(_pick(props, "pine_ratio")),
        "infection_pressure": _float(_pick(props, "infection_pressure")),
        "access_score": _float(_pick(props, "access_score")),
        "road_distance": _float(_pick(props, "road_distance")),
        "road_type": _text(_pick(props, "road_type")),
        "environment_flag": _text(_pick(props, "environment_flag")),
        "recommended_action": _text(_pick(props, "recommended_action")),
        "longitude": lon,
        "latitude": lat,
    }


def collect_current_data(sido_name: str, sigungu_name: str, grid_ids: list[str]) -> dict[str, Any]:
    wanted = set(grid_ids)
    region: list[tuple[dict[str, Any], dict[str, Any]]] = []
    center_item: tuple[dict[str, Any], dict[str, Any]] | None = None

    for feature in _load_features():
        record = _feature_record(feature)
        if not record:
            continue
        if sido_name and record["sido_name"] != sido_name:
            continue
        if sigungu_name and record["sigungu_name"] != sigungu_name:
            continue
        region.append((record, feature))
        if record["grid_id"] in wanted:
            center_item = (record, feature)

    if not region:
        raise ValueError("선택 지역에 해당하는 분석 데이터가 없습니다.")
    if center_item is None:
        raise ValueError("선택 지역과 중심 격자에 해당하는 분석 데이터가 없습니다.")

    center = center_item[0]
    center_coord = (center.get("longitude"), center.get("latitude"))
    neighbor_rows: list[dict[str, Any]] = []
    if all(isinstance(v, (int, float)) for v in center_coord):
        sortable: list[tuple[float, dict[str, Any]]] = []
        for record, _feature in region:
            if record["grid_id"] == center["grid_id"]:
                continue
            coord = (record.get("longitude"), record.get("latitude"))
            if not all(isinstance(v, (int, float)) for v in coord):
                continue
            sortable.append((_distance_km(center_coord, coord), record))
        for distance, record in sorted(sortable, key=lambda item: item[0])[:4]:
            neighbor_rows.append({
                "grid_id": record["grid_id"],
                "direction": _direction(center_coord, (record["longitude"], record["latitude"])),
                "distance_km": round(distance, 2),
                "risk_score": record["risk_score"],
                "risk_grade": record["risk_grade"],
                "priority_score": record["priority_score"],
                "priority_grade": record["priority_grade"],
            })

    risks = [r["risk_score"] for r, _ in region if r["risk_score"] is not None]
    priorities = [r["priority_score"] for r, _ in region if r["priority_score"] is not None]
    pine = [r["pine_ratio"] for r, _ in region if r["pine_ratio"] is not None]
    pressure = [r["infection_pressure"] for r, _ in region if r["infection_pressure"] is not None]
    access = [r["access_score"] for r, _ in region if r["access_score"] is not None]

    return {
        "selected_grid_count": 1,
        "region_candidate_count": len(region),
        "grid_ids": [center["grid_id"]],
        "average_risk_score": _mean(risks),
        "maximum_risk_score": _max(risks),
        "average_priority_score": _mean(priorities),
        "maximum_priority_score": _max(priorities),
        "average_pine_ratio": _mean(pine),
        "average_infection_pressure": _mean(pressure),
        "average_access_score": _mean(access),
        "center_grid": center,
        "neighbor_grids": neighbor_rows,
    }


def build_sections(payload: dict[str, Any], summary: dict[str, Any]) -> list[dict[str, str]]:
    region = f"{payload['sido_name']} {payload.get('sigungu_name', '')}".strip()
    center = summary.get("center_grid", {})
    common = (
        f"대상 지역은 {region}, 중심 격자는 {center.get('grid_id', '-')}이다. "
        f"신규 확산위험 점수 {center.get('risk_score') if center.get('risk_score') is not None else '-'}점"
        f"({center.get('risk_grade') or '등급 없음'}), 예찰 우선순위 "
        f"{center.get('priority_score') if center.get('priority_score') is not None else '-'}점"
        f"({center.get('priority_grade') or '등급 없음'})을 기준으로 작성하였다."
    )
    report_type = payload["report_type"]
    if report_type == "field_survey":
        sections = [
            {"key": "overview", "heading": "1. 현장 예찰 개요", "content": common},
            {"key": "result", "heading": "2. 현장 예찰 결과", "content": "AI 분석 결과는 감염 확정값이 아니며 현장 확인과 시료 검경을 위한 우선 검토자료로 활용한다."},
            {"key": "action", "heading": "3. 후속 조치", "content": "이상징후 확인 시 시료 채취, 검경 의뢰, 위치·사진·처리상태 등록과 후속 예찰 일정을 연계한다."},
        ]
    elif report_type == "control":
        sections = [
            {"key": "overview", "heading": "1. 방제 개요", "content": common},
            {"key": "result", "heading": "2. 방제 결과", "content": "방제 대상과 처리 실적은 현장 확인 및 검경 결과에 따라 담당자가 확정하며, 플랫폼은 대상 격자와 후속 관리 이력을 연결한다."},
            {"key": "followup", "heading": "3. 사후 관리", "content": "방제 완료 후 잔재물 관리, 재예찰 일정, 위험도 변화와 보고서 등록 이력을 관리한다."},
        ]
    else:
        sections = [
            {"key": "overview", "heading": "1. 분석 개요", "content": common},
            {"key": "risk", "heading": "2. 신규 확산위험 후보 분석", "content": "본 결과는 감염 확정값이 아닌 신규 발생 후보지역 예측 결과이며, 위험도·최근 감염압력·소나무류 비율·접근성을 종합하여 우선 예찰 검토지역을 제시한다."},
            {"key": "action", "heading": "3. 선제 대응", "content": "중심 격자와 인접 후보격자를 우선 확인하고, 접근 여건에 따라 현장 예찰 또는 드론 예찰을 배정한 뒤 확인 결과를 행정 이력에 등록한다."},
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
        ("신규 확산위험", center.get("risk_score", "")),
        ("위험 등급", center.get("risk_grade", "")),
        ("예찰 우선순위", center.get("priority_score", "")),
        ("예찰 등급", center.get("priority_grade", "")),
        ("최근 감염압력", center.get("infection_pressure", "")),
        ("소나무류 비율", center.get("pine_ratio", "")),
        ("접근성", center.get("access_score", "")),
    ]:
        sheet.append([key, value])
    sheet.append([])
    sheet.append(["인접 격자", "방향", "거리(km)", "위험도", "예찰 우선순위"])
    for item in draft["data_summary"].get("neighbor_grids", []):
        sheet.append([
            item.get("grid_id", ""), item.get("direction", ""), item.get("distance_km", ""),
            item.get("risk_score", ""), item.get("priority_score", ""),
        ])
    for row in sheet.iter_rows():
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.column_dimensions["A"].width = 24
    sheet.column_dimensions["B"].width = 60
    workbook.save(path)
    return path
