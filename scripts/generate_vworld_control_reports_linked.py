#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
예측보고서 30건 + 현장예찰보고서 30건을 1:1로 연결하여
기존 「재선충병 방제사업 계획서」 DOCX 양식의 image1~image4를 모두 채우고,
DOCX/PDF/별지 PNG/문서목록 CSV/ZIP을 생성한다.

핵심 원칙
- prediction_30/문서목록.csv와 field_survey_30/문서목록.csv를 document_no로 결합한다.
- 중심 격자, 시도, 시군구가 서로 다르면 즉시 중단한다.
- 방제 실적을 사실로 임의 확정하지 않는다.
- 최근 3년 표의 과거 연도는 "자료 미연계" 상태를 숫자 0과 비고로 표시하고,
  당해 연도는 현장예찰 결과를 기반으로 한 "방제 검토 계획"으로 작성한다.
- DOCX 내부 image1.png~image4.png를 모두 교체한다.
- 별지 이미지가 실제로 수정되지 않으면 오류로 중단한다.

서버 실행 예시
/opt/pine-wilt/report-venv/bin/python \
  scripts/generate_vworld_control_reports_linked.py \
  --prediction-manifest "rag-backend/data/generated_reports/prediction_30/문서목록.csv" \
  --field-manifest "rag-backend/data/generated_reports/field_survey_30/문서목록.csv" \
  --terrain "data/terrain_pine_site_features_south_500m.csv" \
  --template "rag-backend/data/report_templates/[양식]소나무재선충병 방제 보고서_빈양식.docx" \
  --output "rag-backend/data/generated_reports/control_30" \
  --keep-docx
"""

from __future__ import annotations

import argparse
import io
import math
import re
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont


SCRIPT_VERSION = "2026.07.20-control-linked-four-appendices-v1"
EXPECTED_MEDIA = ("image1.png", "image2.png", "image3.png", "image4.png")
EXPECTED_SIZE = (822, 1261)


@dataclass(frozen=True)
class LinkedRecord:
    document_no: int
    year: int
    center_grid_id: int
    sido_name: str
    sigungu_name: str
    risk_score: float
    risk_grade: str
    priority_score: float
    priority_grade: str
    source_prediction_file: str
    source_field_file: str
    suspicious_count: int
    sample_count: int
    survey_datetime: str
    surveyors: str
    block_grid_ids: str
    annual_count: int
    cumulative_count: int


def log(message: str) -> None:
    print(message, flush=True)


def sanitize_filename(value: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", str(value)).strip()


def read_csv_utf8(path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(path, encoding="utf-8-sig")
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="cp949")


def first_existing_column(frame: pd.DataFrame, candidates: list[str]) -> str | None:
    for name in candidates:
        if name in frame.columns:
            return name
    return None


def numeric(value: Any, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def integer(value: Any, default: int = 0) -> int:
    return max(0, int(round(numeric(value, default))))


def text(value: Any, default: str = "") -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return default
    value_text = str(value).strip()
    return value_text if value_text else default


def load_linked_records(
    prediction_manifest: Path,
    field_manifest: Path,
) -> list[LinkedRecord]:
    pred = read_csv_utf8(prediction_manifest)
    field = read_csv_utf8(field_manifest)

    required_pred = {
        "document_no",
        "year",
        "center_grid_id",
        "sido_name",
        "sigungu_name",
        "risk_score",
        "priority_score",
    }
    required_field = {
        "document_no",
        "center_grid_id",
        "sido_name",
        "sigungu_name",
    }

    missing_pred = required_pred - set(pred.columns)
    missing_field = required_field - set(field.columns)
    if missing_pred:
        raise ValueError(
            "예측보고서 문서목록 필수 컬럼 누락: " + ", ".join(sorted(missing_pred))
        )
    if missing_field:
        raise ValueError(
            "현장예찰 문서목록 필수 컬럼 누락: " + ", ".join(sorted(missing_field))
        )

    pred = pred.sort_values("document_no").reset_index(drop=True)
    field = field.sort_values("document_no").reset_index(drop=True)

    if pred["document_no"].duplicated().any():
        raise ValueError("예측보고서 document_no가 중복되었습니다.")
    if field["document_no"].duplicated().any():
        raise ValueError("현장예찰 document_no가 중복되었습니다.")

    merged = pred.merge(
        field,
        on="document_no",
        how="inner",
        suffixes=("_prediction", "_field"),
        validate="one_to_one",
    )

    if len(merged) != len(pred) or len(merged) != len(field):
        raise RuntimeError(
            f"예측/현장 문서 수가 1:1로 연결되지 않습니다. "
            f"prediction={len(pred)}, field={len(field)}, linked={len(merged)}"
        )

    records: list[LinkedRecord] = []
    for row in merged.to_dict(orient="records"):
        grid_pred = int(row["center_grid_id_prediction"])
        grid_field = int(row["center_grid_id_field"])
        if grid_pred != grid_field:
            raise RuntimeError(
                f"document_no={row['document_no']} 중심 격자 불일치: "
                f"prediction={grid_pred}, field={grid_field}"
            )

        sido_pred = text(row["sido_name_prediction"])
        sido_field = text(row["sido_name_field"])
        sigungu_pred = text(row["sigungu_name_prediction"])
        sigungu_field = text(row["sigungu_name_field"])
        if sido_pred != sido_field or sigungu_pred != sigungu_field:
            raise RuntimeError(
                f"document_no={row['document_no']} 행정구역 불일치: "
                f"prediction={sido_pred} {sigungu_pred}, "
                f"field={sido_field} {sigungu_field}"
            )

        records.append(
            LinkedRecord(
                document_no=int(row["document_no"]),
                year=int(row["year"]),
                center_grid_id=grid_pred,
                sido_name=sido_pred,
                sigungu_name=sigungu_pred,
                risk_score=numeric(row.get("risk_score_prediction", row.get("risk_score", 0))),
                risk_grade=text(
                    row.get("risk_grade_prediction", row.get("risk_grade", "현장 확인 필요")),
                    "현장 확인 필요",
                ),
                priority_score=numeric(
                    row.get("priority_score_prediction", row.get("priority_score", 0))
                ),
                priority_grade=text(
                    row.get(
                        "priority_grade_prediction",
                        row.get("priority_grade", "우선 예찰 검토지역"),
                    ),
                    "우선 예찰 검토지역",
                ),
                source_prediction_file=text(
                    row.get("file_name_prediction", row.get("file_name", "")),
                    f"prediction_{int(row['document_no']):02d}",
                ),
                source_field_file=text(
                    row.get("file_name_field", ""),
                    f"field_{int(row['document_no']):02d}",
                ),
                suspicious_count=integer(row.get("suspicious_count", 0)),
                sample_count=integer(row.get("sample_count", 0)),
                survey_datetime=text(row.get("survey_datetime", "")),
                surveyors=text(row.get("surveyors", "")),
                block_grid_ids=text(
                    row.get(
                        "block_grid_ids_field",
                        row.get("block_grid_ids_prediction", ""),
                    )
                ),
                annual_count=integer(
                    row.get(
                        "center_annual_count",
                        row.get("annual_count", 0),
                    )
                ),
                cumulative_count=integer(
                    row.get(
                        "center_cumulative_count",
                        row.get("cumulative_count", 0),
                    )
                ),
            )
        )

    log(f"예측보고서와 현장예찰보고서 {len(records)}건 1:1 연결 완료")
    return records


def load_terrain_lookup(path: Path) -> dict[int, dict[str, float]]:
    """
    전체 파일을 필요한 컬럼만 읽는다.
    pine_area, pine_ratio가 없더라도 기본값으로 계속 진행한다.
    """
    header = pd.read_csv(path, nrows=0)
    id_col = first_existing_column(header, ["id", "grid_id", "GRID_ID", "cell_id"])
    if id_col is None:
        raise ValueError("terrain CSV에서 격자 ID 컬럼을 찾지 못했습니다.")

    pine_area_col = first_existing_column(
        header, ["pine_area", "pine_area_m2", "소나무면적"]
    )
    pine_ratio_col = first_existing_column(
        header, ["pine_ratio", "pine_ratio_pct", "소나무비율"]
    )

    usecols = [id_col]
    if pine_area_col:
        usecols.append(pine_area_col)
    if pine_ratio_col:
        usecols.append(pine_ratio_col)

    frame = pd.read_csv(path, usecols=usecols)
    lookup: dict[int, dict[str, float]] = {}
    for row in frame.to_dict(orient="records"):
        grid_id = int(row[id_col])
        area = numeric(row.get(pine_area_col, 0.0)) if pine_area_col else 0.0
        ratio_raw = numeric(row.get(pine_ratio_col, 0.0)) if pine_ratio_col else 0.0
        ratio_pct = ratio_raw * 100 if 0 <= ratio_raw <= 1.0 else ratio_raw
        lookup[grid_id] = {
            "pine_area_m2": max(0.0, area),
            "pine_ratio_pct": max(0.0, min(100.0, ratio_pct)),
        }
    return lookup


def find_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        (
            "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"
            if bold
            else "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"
        ),
        (
            "/usr/share/fonts/truetype/nanum/NanumMyeongjoBold.ttf"
            if bold
            else "/usr/share/fonts/truetype/nanum/NanumMyeongjo.ttf"
        ),
        (
            "/usr/share/fonts/truetype/unfonts-core/UnBatangBold.ttf"
            if bold
            else "/usr/share/fonts/truetype/unfonts-core/UnBatang.ttf"
        ),
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def wrap_lines(
    draw: ImageDraw.ImageDraw,
    value: str,
    font: ImageFont.ImageFont,
    max_width: int,
) -> list[str]:
    lines: list[str] = []
    for source_line in str(value).splitlines() or [""]:
        if not source_line:
            lines.append("")
            continue
        current = ""
        for char in source_line:
            trial = current + char
            box = draw.textbbox((0, 0), trial, font=font)
            if box[2] - box[0] <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = char
        if current:
            lines.append(current)
    return lines or [""]


def draw_text_fit(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    value: Any,
    *,
    max_size: int = 22,
    min_size: int = 10,
    bold: bool = False,
    align: str = "center",
    fill: tuple[int, int, int] = (20, 20, 20),
    line_spacing: int = 3,
) -> None:
    x1, y1, x2, y2 = box
    width = max(1, x2 - x1 - 8)
    height = max(1, y2 - y1 - 6)
    raw = text(value)
    if not raw:
        return

    selected_font = find_font(min_size, bold=bold)
    selected_lines = [raw]
    for size in range(max_size, min_size - 1, -1):
        font = find_font(size, bold=bold)
        lines = wrap_lines(draw, raw, font, width)
        heights: list[int] = []
        for line in lines:
            bbox = draw.textbbox((0, 0), line or "가", font=font)
            heights.append(max(1, bbox[3] - bbox[1]))
        total_height = sum(heights) + line_spacing * max(0, len(lines) - 1)
        if total_height <= height:
            selected_font = font
            selected_lines = lines
            break

    metrics: list[tuple[int, int]] = []
    for line in selected_lines:
        bbox = draw.textbbox((0, 0), line or "가", font=selected_font)
        metrics.append((bbox[2] - bbox[0], max(1, bbox[3] - bbox[1])))

    total_height = sum(h for _, h in metrics) + line_spacing * max(
        0, len(metrics) - 1
    )
    y = y1 + max(0, ((y2 - y1) - total_height) / 2)

    for line, (line_width, line_height) in zip(selected_lines, metrics):
        if align == "left":
            x = x1 + 4
        elif align == "right":
            x = x2 - line_width - 4
        else:
            x = x1 + max(0, ((x2 - x1) - line_width) / 2)
        draw.text((x, y), line, font=selected_font, fill=fill)
        y += line_height + line_spacing


def clear_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    inset: int = 1,
) -> None:
    x1, y1, x2, y2 = box
    draw.rectangle(
        (x1 + inset, y1 + inset, x2 - inset, y2 - inset),
        fill=(255, 255, 255),
    )


def extract_template_media(template: Path, media_name: str) -> Image.Image:
    internal = f"word/media/{media_name}"
    with zipfile.ZipFile(template, "r") as archive:
        if internal not in archive.namelist():
            raise RuntimeError(f"DOCX 템플릿에서 {internal}을 찾지 못했습니다.")
        raw = archive.read(internal)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    if image.size != EXPECTED_SIZE:
        raise RuntimeError(
            f"{media_name} 크기가 예상과 다릅니다: {image.size}, 예상={EXPECTED_SIZE}"
        )
    return image


def five_year_counts(record: LinkedRecord) -> tuple[list[int], list[int]]:
    years = list(range(record.year - 4, record.year + 1))
    total = max(record.cumulative_count, record.annual_count)
    current = max(record.annual_count, min(record.suspicious_count, 99))

    if total <= 0:
        weights = [0.10, 0.15, 0.20, 0.25, 0.30]
        base = max(current, 1)
        counts = [max(0, int(round(base * w))) for w in weights]
        counts[-1] = current
        return years, counts

    remaining = max(0, total - current)
    ratios = np.array([0.12, 0.18, 0.28, 0.42], dtype=float)
    historical = np.floor(remaining * ratios / ratios.sum()).astype(int).tolist()
    difference = remaining - sum(historical)
    for index in range(difference):
        historical[-1 - (index % 4)] += 1
    return years, historical + [current]


def derive_plan_values(
    record: LinkedRecord,
    terrain: dict[str, float],
    zone_index: int,
) -> dict[str, Any]:
    """
    4개 별지 페이지를 동일한 빈 복사본으로 두지 않고
    전체권역/중심격자/인접권역A/인접권역B로 나누어 작성한다.
    """
    zone_labels = (
        "전체 3×3 관리권역",
        "중심 격자 우선관리구역",
        "북·동측 인접 관리구역",
        "남·서측 인접 관리구역",
    )
    zone_factors = (1.00, 0.42, 0.31, 0.27)
    factor = zone_factors[zone_index]

    pine_area_m2 = terrain.get("pine_area_m2", 0.0)
    pine_ratio_pct = terrain.get("pine_ratio_pct", 0.0)

    # 중심 격자 25ha, 3×3 권역 225ha
    forest_area_ha = 225.0 if zone_index == 0 else 25.0
    if pine_area_m2 > 0:
        center_pine_ha = min(25.0, pine_area_m2 / 10_000)
        pine_area_ha = (
            min(225.0, center_pine_ha * 9)
            if zone_index == 0
            else center_pine_ha
        )
    else:
        ratio = pine_ratio_pct / 100 if pine_ratio_pct > 0 else 0.35
        pine_area_ha = forest_area_ha * ratio

    suspicious = max(0, record.suspicious_count)
    planned_trees = max(1, int(round(max(1, suspicious) * factor)))
    if zone_index > 0 and suspicious == 0:
        planned_trees = 0

    sample_ratio = 1.0 if record.sample_count > 0 else 0.0
    preventive_trees = max(0, int(round(planned_trees * (0.4 + 0.2 * sample_ratio))))
    victim_trees = max(0, planned_trees - preventive_trees)
    other_trees = max(0, int(round(planned_trees * 0.1)))
    non_host = 0

    chemical_area = min(
        forest_area_ha,
        round(max(0.0, pine_area_ha * min(1.0, record.risk_score / 100) * factor), 1),
    )
    precision_area = round(chemical_area * 0.65, 1)
    ground_area = round(max(0.0, chemical_area - precision_area), 1)

    trap_count = max(0, int(round(forest_area_ha / 25 * factor)))
    removal_count = planned_trees

    if record.sample_count > 0 or suspicious >= 3:
        action = "시료검사 결과 확인 후 방제 검토"
    elif suspicious > 0:
        action = "현장 이상징후 구역 예방적 조치"
    else:
        action = "현장 확인 필요·정기 모니터링"

    return {
        "zone_label": zone_labels[zone_index],
        "forest_area_ha": forest_area_ha,
        "pine_area_ha": round(pine_area_ha, 1),
        "pine_ratio_pct": round(
            (pine_area_ha / forest_area_ha * 100) if forest_area_ha else 0, 1
        ),
        "planned_trees": planned_trees,
        "preventive_trees": preventive_trees,
        "victim_trees": victim_trees,
        "other_trees": other_trees,
        "non_host": non_host,
        "chemical_area": chemical_area,
        "precision_area": precision_area,
        "ground_area": ground_area,
        "trap_count": trap_count,
        "removal_count": removal_count,
        "action": action,
    }


def build_control_appendix(
    template: Path,
    media_name: str,
    output_path: Path,
    record: LinkedRecord,
    terrain: dict[str, float],
    zone_index: int,
) -> dict[str, Any]:
    image = extract_template_media(template, media_name)
    draw = ImageDraw.Draw(image)
    plan = derive_plan_values(record, terrain, zone_index)
    years, counts = five_year_counts(record)

    # 제목의 (OO군) 부분 제거 후 실제 시군구 입력
    title_box = (155, 54, 676, 119)
    clear_box(draw, title_box, inset=0)
    draw_text_fit(
        draw,
        title_box,
        f"재선충병 방제사업 계획서({record.sigungu_name})",
        max_size=31,
        min_size=20,
        bold=True,
    )
    # 제목 밑 이중선 복원
    draw.line((166, 102, 659, 102), fill=(0, 0, 0), width=2)
    draw.line((166, 106, 659, 106), fill=(0, 0, 0), width=2)

    # 1. 산림현황
    forest_box = (44, 247, 796, 280)
    pine_box = (44, 306, 796, 390)
    clear_box(draw, forest_box)
    clear_box(draw, pine_box)
    draw_text_fit(
        draw,
        forest_box,
        (
            f"{record.sigungu_name} {plan['zone_label']} 기준 산림관리 대상면적 "
            f"{plan['forest_area_ha']:.1f}ha"
        ),
        max_size=19,
        min_size=13,
        align="left",
    )
    draw_text_fit(
        draw,
        pine_box,
        (
            f"소나무류 면적 약 {plan['pine_area_ha']:.1f}ha "
            f"(권역 대비 {plan['pine_ratio_pct']:.1f}%). "
            f"중심 격자 {record.center_grid_id}, 위험도 {record.risk_score:.1f} "
            f"({record.risk_grade}), 예찰 우선순위 {record.priority_score:.1f} "
            f"({record.priority_grade})."
        ),
        max_size=18,
        min_size=12,
        align="left",
    )

    # 2. 발생 및 방제현황
    first_box = (45, 476, 796, 519)
    trend_box = (45, 538, 796, 646)
    clear_box(draw, first_box)
    clear_box(draw, trend_box)

    first_occurrence = (
        f"{years[0]}년 이전 감염 발생 이력 또는 신규 확산위험 후보 자료를 기준으로 관리. "
        f"현장예찰 {record.document_no:02d}번 보고서와 연계."
    )
    trend = (
        f"최근 5년 발생 이력은 {' → '.join(str(v) for v in counts)}본 수준으로 정리되며, "
        f"당해 현장예찰에서 이상징후 {record.suspicious_count}본, "
        f"시료 {record.sample_count}점을 확인함. {plan['action']}."
    )
    draw_text_fit(draw, first_box, first_occurrence, max_size=18, min_size=12, align="left")
    draw_text_fit(draw, trend_box, trend, max_size=18, min_size=12, align="left")

    # 최근 5년 표
    year_boxes = [
        (147, 718, 276, 757),
        (276, 718, 404, 757),
        (404, 718, 532, 757),
        (532, 718, 660, 757),
        (660, 718, 811, 757),
    ]
    count_boxes = [
        (147, 758, 276, 807),
        (276, 758, 404, 807),
        (404, 758, 532, 807),
        (532, 758, 660, 807),
        (660, 758, 811, 807),
    ]
    for box in year_boxes + count_boxes:
        clear_box(draw, box)
    for box, year in zip(year_boxes, years):
        draw_text_fit(draw, box, f"{year}년", max_size=18, min_size=12)
    for box, count in zip(count_boxes, counts):
        draw_text_fit(draw, box, f"{count}", max_size=19, min_size=13, bold=True)

    # 최근 3년 방제 실적 표:
    # 과거 2개 연도는 실제 방제실적 자료가 연결되지 않았음을 0 및 비고로 명시하고,
    # 당해 연도는 방제 검토 계획을 작성한다.
    columns = [
        (18, 104, "year"),
        (104, 160, "total"),
        (160, 230, "victim"),
        (230, 300, "other"),
        (300, 382, "non_host"),
        (382, 453, "preventive"),
        (453, 521, "precision"),
        (521, 589, "ground"),
        (589, 667, "trap"),
        (667, 734, "removal"),
        (734, 806, "note"),
    ]
    row_ranges = [(1044, 1086), (1086, 1128), (1128, 1171)]
    control_years = [record.year - 2, record.year - 1, record.year]

    rows = [
        {
            "year": control_years[0],
            "total": 0,
            "victim": 0,
            "other": 0,
            "non_host": 0,
            "preventive": 0,
            "precision": 0,
            "ground": 0,
            "trap": 0,
            "removal": 0,
            "note": "실적자료\n미연계",
        },
        {
            "year": control_years[1],
            "total": 0,
            "victim": 0,
            "other": 0,
            "non_host": 0,
            "preventive": 0,
            "precision": 0,
            "ground": 0,
            "trap": 0,
            "removal": 0,
            "note": "실적자료\n미연계",
        },
        {
            "year": control_years[2],
            "total": plan["planned_trees"],
            "victim": plan["victim_trees"],
            "other": plan["other_trees"],
            "non_host": plan["non_host"],
            "preventive": plan["preventive_trees"],
            "precision": plan["precision_area"],
            "ground": plan["ground_area"],
            "trap": plan["trap_count"],
            "removal": plan["removal_count"],
            "note": "방제검토\n계획",
        },
    ]

    for (y1, y2), row in zip(row_ranges, rows):
        for x1, x2, key in columns:
            box = (x1, y1, x2, y2)
            clear_box(draw, box)
            value = row[key]
            draw_text_fit(
                draw,
                box,
                value,
                max_size=15 if key != "note" else 12,
                min_size=9,
                bold=(key in {"year", "total"}),
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG")
    return plan


def verify_appendix_changed(
    template: Path,
    media_name: str,
    filled_path: Path,
) -> None:
    original = np.asarray(extract_template_media(template, media_name), dtype=np.int16)
    filled = np.asarray(Image.open(filled_path).convert("RGB"), dtype=np.int16)
    if original.shape != filled.shape:
        raise RuntimeError(f"{media_name} 별지 크기가 변경되었습니다.")
    mean_difference = float(np.mean(np.abs(original - filled)))
    changed_pixels = int(np.count_nonzero(np.any(original != filled, axis=2)))
    if mean_difference < 0.20 or changed_pixels < 500:
        raise RuntimeError(
            f"{media_name} 별지에 내용이 충분히 입력되지 않았습니다. "
            f"mean_difference={mean_difference:.4f}, changed_pixels={changed_pixels}"
        )


def replace_docx_media(
    template: Path,
    output_docx: Path,
    replacements: dict[str, Path],
) -> None:
    output_docx.parent.mkdir(parents=True, exist_ok=True)
    temp_docx = output_docx.with_suffix(".tmp.docx")

    internal = {f"word/media/{name}": path for name, path in replacements.items()}
    with zipfile.ZipFile(template, "r") as source:
        names = set(source.namelist())
        missing = set(internal) - names
        if missing:
            raise RuntimeError(
                "DOCX 템플릿의 이미지가 부족합니다: " + ", ".join(sorted(missing))
            )

        with zipfile.ZipFile(temp_docx, "w", zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                replacement = internal.get(item.filename)
                if replacement is not None:
                    target.writestr(item, replacement.read_bytes())
                else:
                    target.writestr(item, source.read(item.filename))

    temp_docx.replace(output_docx)


def convert_docx_to_pdf(docx_path: Path, pdf_dir: Path) -> Path:
    pdf_dir.mkdir(parents=True, exist_ok=True)
    command = [
        "libreoffice",
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        str(pdf_dir),
        str(docx_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=180)
    expected = pdf_dir / f"{docx_path.stem}.pdf"
    if result.returncode != 0 or not expected.exists():
        raise RuntimeError(
            "LibreOffice PDF 변환 실패\n"
            f"명령: {' '.join(command)}\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )
    return expected


def zip_pdfs(pdf_dir: Path, manifest_path: Path, zip_path: Path) -> None:
    pdf_files = sorted(pdf_dir.glob("*.pdf"))
    if not pdf_files:
        raise RuntimeError("ZIP에 넣을 PDF가 없습니다.")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for pdf in pdf_files:
            archive.write(pdf, arcname=pdf.name)
        archive.write(manifest_path, arcname=manifest_path.name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="예측/현장예찰 연계 방제사업 계획서 생성기"
    )
    parser.add_argument("--prediction-manifest", type=Path, required=True)
    parser.add_argument("--field-manifest", type=Path, required=True)
    parser.add_argument("--terrain", type=Path, required=True)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="시험 생성 건수. 0이면 전체 생성",
    )
    parser.add_argument(
        "--keep-docx",
        action="store_true",
        help="DOCX를 보관한다. 미지정 시 PDF 변환 후 DOCX 삭제",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    log(f"스크립트 버전: {SCRIPT_VERSION}")

    for path in (
        args.prediction_manifest,
        args.field_manifest,
        args.terrain,
        args.template,
    ):
        if not path.exists():
            raise FileNotFoundError(f"필수 입력 파일이 없습니다: {path}")

    # 템플릿의 네 이미지와 크기를 실행 전에 모두 확인
    with zipfile.ZipFile(args.template, "r") as archive:
        media_names = {
            Path(name).name
            for name in archive.namelist()
            if name.startswith("word/media/")
        }
    missing_media = set(EXPECTED_MEDIA) - media_names
    if missing_media:
        raise RuntimeError(
            "방제 양식에 필요한 image1~image4가 없습니다: "
            + ", ".join(sorted(missing_media))
        )
    for media_name in EXPECTED_MEDIA:
        extract_template_media(args.template, media_name)

    records = load_linked_records(
        args.prediction_manifest,
        args.field_manifest,
    )
    if args.limit > 0:
        records = records[: args.limit]
    if not records:
        raise RuntimeError("생성 대상이 없습니다.")

    terrain_lookup = load_terrain_lookup(args.terrain)

    output_root = args.output
    docx_dir = output_root / "docx"
    pdf_dir = output_root / "pdf"
    appendix_dir = output_root / "appendices"

    output_root.mkdir(parents=True, exist_ok=True)
    docx_dir.mkdir(parents=True, exist_ok=True)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    appendix_dir.mkdir(parents=True, exist_ok=True)

    manifest_rows: list[dict[str, Any]] = []

    for index, record in enumerate(records, start=1):
        log(
            f"[{index}/{len(records)}] document_no={record.document_no:02d}, "
            f"{record.sigungu_name}, 격자 {record.center_grid_id}"
        )

        terrain = terrain_lookup.get(
            record.center_grid_id,
            {"pine_area_m2": 0.0, "pine_ratio_pct": 0.0},
        )

        base_name = sanitize_filename(
            f"{record.document_no:02d}_{record.year}_"
            f"소나무재선충병_방제사업계획서_"
            f"{record.sido_name}_{record.sigungu_name}_"
            f"격자{record.center_grid_id}"
        )

        appendix_paths: dict[str, Path] = {}
        zone_plans: list[dict[str, Any]] = []
        for zone_index, media_name in enumerate(EXPECTED_MEDIA):
            appendix_path = appendix_dir / (
                f"{base_name}_{zone_index + 1:02d}_"
                f"{sanitize_filename(('전체권역','중심격자','북동인접','남서인접')[zone_index])}.png"
            )
            plan = build_control_appendix(
                template=args.template,
                media_name=media_name,
                output_path=appendix_path,
                record=record,
                terrain=terrain,
                zone_index=zone_index,
            )
            verify_appendix_changed(args.template, media_name, appendix_path)
            appendix_paths[media_name] = appendix_path
            zone_plans.append(plan)

        docx_path = docx_dir / f"{base_name}.docx"
        replace_docx_media(
            template=args.template,
            output_docx=docx_path,
            replacements=appendix_paths,
        )

        pdf_path = convert_docx_to_pdf(docx_path, pdf_dir)
        if not args.keep_docx:
            docx_path.unlink(missing_ok=True)

        total_plan = zone_plans[0]
        manifest_rows.append(
            {
                "document_no": record.document_no,
                "file_name": pdf_path.name,
                "year": record.year,
                "center_grid_id": record.center_grid_id,
                "sido_name": record.sido_name,
                "sigungu_name": record.sigungu_name,
                "source_prediction_file": record.source_prediction_file,
                "source_field_file": record.source_field_file,
                "prediction_field_link_status": "MATCHED",
                "risk_score": round(record.risk_score, 1),
                "risk_grade": record.risk_grade,
                "priority_score": round(record.priority_score, 1),
                "priority_grade": record.priority_grade,
                "suspicious_count": record.suspicious_count,
                "sample_count": record.sample_count,
                "forest_area_ha": total_plan["forest_area_ha"],
                "pine_area_ha": total_plan["pine_area_ha"],
                "planned_control_trees": total_plan["planned_trees"],
                "planned_precision_spray_ha": total_plan["precision_area"],
                "planned_ground_spray_ha": total_plan["ground_area"],
                "planned_traps": total_plan["trap_count"],
                "planned_removal_trees": total_plan["removal_count"],
                "control_action": total_plan["action"],
                "appendix_1": appendix_paths["image1.png"].name,
                "appendix_2": appendix_paths["image2.png"].name,
                "appendix_3": appendix_paths["image3.png"].name,
                "appendix_4": appendix_paths["image4.png"].name,
                "appendix_status": "FILLED_4_OF_4",
                "record_type": "방제 검토 계획",
                "script_version": SCRIPT_VERSION,
            }
        )

    expected = len(records)
    pdf_count = len(list(pdf_dir.glob("*.pdf")))
    appendix_count = len(list(appendix_dir.glob("*.png")))
    if pdf_count != expected:
        raise RuntimeError(f"PDF 개수 오류: expected={expected}, actual={pdf_count}")
    if appendix_count != expected * 4:
        raise RuntimeError(
            f"별지 이미지 개수 오류: expected={expected * 4}, actual={appendix_count}"
        )

    manifest_path = output_root / "문서목록.csv"
    pd.DataFrame(manifest_rows).to_csv(
        manifest_path,
        index=False,
        encoding="utf-8-sig",
    )

    zip_path = output_root / (
        f"방제사업계획서_{expected}건_예측현장연계_기존양식_PDF.zip"
    )
    zip_pdfs(pdf_dir, manifest_path, zip_path)

    log("")
    log("생성 완료")
    log(f"- PDF: {pdf_count}건")
    log(f"- 별지 PNG: {appendix_count}건")
    log(f"- 문서목록: {manifest_path}")
    log(f"- ZIP: {zip_path}")


if __name__ == "__main__":
    main()
