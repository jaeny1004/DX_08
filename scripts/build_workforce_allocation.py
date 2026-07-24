from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import pandas as pd


# =========================================================
# 1. 프로젝트 경로
# =========================================================

PROJECT_DIR = Path(
    r"C:\Users\User\Desktop\산림 데이터셋\DX_08"
)

WORKER_XLSX_PATH = (
    PROJECT_DIR
    / "data"
    / "workers"
    / "전국_구단위_소나무비율_요원배치_더미데이터.xlsx"
)

GRID_GEOJSON_PATH = (
    PROJECT_DIR
    / "public"
    / "data"
    / "final_ui_candidate_v4.geojson"
)

OUTPUT_DIR = (
    PROJECT_DIR
    / "data"
    / "workforce"
)


# =========================================================
# 2. 시연용 업무량 환산 기준
#
# 공식 산림청 작업시간 기준이 아니라
# 경진대회 시연용 업무량 환산 가정이다.
# =========================================================

# 예찰 대상 격자 1개 기본 점검시간
BASE_INSPECTION_MINUTES = 45

# 접근성 60점 미만 추가시간
ACCESS_BELOW_60_EXTRA_MINUTES = 20

# 접근성 40점 미만 추가시간
ACCESS_BELOW_40_EXTRA_MINUTES = 30

# 환경주의 격자 추가시간
ENV_CAUTION_EXTRA_MINUTES = 15

# 최우선 예찰 격자 추가시간
TOP_PRIORITY_EXTRA_MINUTES = 15

# 요원 1명의 하루 실작업시간
WORK_MINUTES_PER_PERSON_DAY = 360

# 기본 운영기간
OPERATION_DAYS = 5

# 접근 취약 우선예찰 격자 20개당 드론요원 1명
LOW_ACCESS_GRIDS_PER_DRONE = 20

# 매우 높음 위험격자 30개당 방제 대기요원 1명
VERY_HIGH_GRIDS_PER_CONTROL_WORKER = 30


# =========================================================
# 3. 공통 함수
# =========================================================

def stop(message: str) -> None:
    print("\n[실행 중단]")
    print(message)
    raise SystemExit(1)


def safe_float(
    value,
    default: float = 0.0,
) -> float:
    """
    값을 안전하게 float로 변환한다.
    변환할 수 없거나 무한값이면 기본값을 반환한다.
    """
    try:
        number = float(value)

        if math.isfinite(number):
            return number

    except (TypeError, ValueError):
        pass

    return default


def normalize_code(
    value,
    length: int,
) -> str:
    """
    엑셀이나 CSV에서 숫자로 읽힌 행정구역 코드를
    지정된 길이의 문자열로 변환한다.

    예:
    47130.0 -> "47130"
    1010 -> "01010"
    """
    if value is None:
        return ""

    text = str(value).strip()

    if not text or text.lower() == "nan":
        return ""

    if text.endswith(".0"):
        text = text[:-2]

    return text.zfill(length)


def parse_number_with_unit(
    value,
    unit: str,
) -> float | None:
    """
    '12.5km', '1.3h'처럼 단위가 포함된 값을
    숫자로 변환한다.
    """
    if value is None:
        return None

    text = str(value).strip()

    if not text or text.lower() == "nan":
        return None

    text = text.replace(unit, "").strip()

    try:
        return round(float(text), 2)

    except ValueError:
        return None


def find_column(
    columns: list[str],
    candidates: list[str],
) -> str:
    """
    후보 컬럼명 중 실제 데이터에 존재하는
    첫 번째 컬럼명을 반환한다.
    """
    normalized_columns = {
        str(column).strip(): column
        for column in columns
    }

    for candidate in candidates:
        if candidate in normalized_columns:
            return normalized_columns[candidate]

    raise KeyError(
        "필요한 컬럼을 찾지 못했습니다.\n"
        f"후보 컬럼: {candidates}\n"
        f"실제 컬럼: {columns}"
    )


# =========================================================
# 4. 위험도·예찰 우선순위 등급 정규화
# =========================================================

def normalize_risk_grade(
    properties: dict,
) -> str:
    """
    모델 내부 위험단계 라벨을
    UI 위험도 등급으로 변환한다.
    """
    stage_label = properties.get(
        "risk_stage_label"
    )

    mapping = {
        "고위험 1순위 후보": "매우 높음",
        "고위험 2순위 후보": "높음",
        "고위험 3순위 후보": "주의",
        "고위험 4순위 후보": "관찰",
    }

    if stage_label in mapping:
        return mapping[stage_label]

    return str(
        properties.get("risk_grade")
        or "낮음"
    )


def normalize_priority_grade(
    properties: dict,
) -> str:
    """
    대시보드 지도와 동일하게
    field_priority_grade_v3를 최우선 기준으로 사용한다.
    """

    field_grade = properties.get(
        "field_priority_grade_v3"
    )

    valid_grades = {
        "최우선 예찰",
        "우선 예찰",
        "집중 관찰",
        "정기 관찰",
        "일반 관리",
    }

    if field_grade in valid_grades:
        return str(field_grade)

    priority_grade = properties.get(
        "priority_grade_v3"
    )

    if priority_grade in valid_grades:
        return str(priority_grade)

    stage_label = properties.get(
        "priority_stage_label"
    )

    stage_mapping = {
        "예찰 1순위 후보": "최우선 예찰",
        "예찰 2순위 후보": "우선 예찰",
        "예찰 3순위 후보": "집중 관찰",
        "예찰 4순위 후보": "정기 관찰",
    }

    if stage_label in stage_mapping:
        return stage_mapping[stage_label]

    return "일반 관리"


# =========================================================
# 5. 요원 엑셀 불러오기
# =========================================================

def load_worker_data(
    sigungu_name_map: dict[str, dict],
) -> list[dict]:
    """
    조원이 만든 요원 더미데이터 엑셀을 읽고
    요원 1명당 1행의 표준 구조로 정제한다.
    """
    print("\n[1/5] 요원 엑셀 읽는 중...")

    if not WORKER_XLSX_PATH.exists():
        stop(
            "요원 엑셀 파일이 없습니다.\n"
            f"{WORKER_XLSX_PATH}"
        )

    excel_file = pd.ExcelFile(
        WORKER_XLSX_PATH
    )

    worker_sheet_name = None

    for sheet_name in excel_file.sheet_names:
        if "더미" in sheet_name:
            worker_sheet_name = sheet_name
            break

    if worker_sheet_name is None:
        worker_sheet_name = (
            excel_file.sheet_names[0]
        )

    worker_df = pd.read_excel(
        WORKER_XLSX_PATH,
        sheet_name=worker_sheet_name,
    )

    worker_df.columns = [
        str(column).strip()
        for column in worker_df.columns
    ]

    print(
        f"사용 시트: {worker_sheet_name}"
    )

    print(
        f"원본 요원 수: {len(worker_df):,}명"
    )

    print(
        "원본 컬럼:",
        worker_df.columns.tolist(),
    )

    code_column = find_column(
        worker_df.columns.tolist(),
        [
            "구코드",
            "시군구코드",
            "sigungu_code",
        ],
    )

    name_column = find_column(
        worker_df.columns.tolist(),
        [
            "이름",
            "성명",
            "요원이름",
            "worker_name",
        ],
    )

    id_column = find_column(
        worker_df.columns.tolist(),
        [
            "일련번호",
            "요원ID",
            "worker_id",
        ],
    )

    type_column = find_column(
        worker_df.columns.tolist(),
        [
            "분야",
            "요원분야",
            "worker_type",
        ],
    )

    status_column = find_column(
        worker_df.columns.tolist(),
        [
            "상태",
            "현재상태",
            "status",
        ],
    )

    distance_column = find_column(
        worker_df.columns.tolist(),
        [
            "이동 거리",
            "이동거리",
            "travel_distance",
        ],
    )

    time_column = find_column(
        worker_df.columns.tolist(),
        [
            "이동 시간",
            "이동시간",
            "travel_time",
        ],
    )

    battery_column = find_column(
        worker_df.columns.tolist(),
        [
            "잔여 배터리",
            "배터리",
            "battery",
        ],
    )

    availability_mapping = {
        "대기": "즉시 가용",
        "출동": "이동 중",
        "현장": "업무 중",
        "복귀": "복귀 중",
    }

    workers: list[dict] = []

    for _, row in worker_df.iterrows():
        sigungu_code = normalize_code(
            row[code_column],
            5,
        )

        region = sigungu_name_map.get(
            sigungu_code,
            {},
        )

        worker_type = str(
            row[type_column]
        ).strip()

        status = str(
            row[status_column]
        ).strip()

        battery_value = safe_float(
            row[battery_column],
            default=-1,
        )

        if battery_value < 0:
            battery_percent = None

        elif battery_value <= 1:
            battery_percent = round(
                battery_value * 100,
                1,
            )

        else:
            battery_percent = round(
                battery_value,
                1,
            )

        workers.append({
            "worker_id": str(
                row[id_column]
            ).strip(),

            "worker_name": str(
                row[name_column]
            ).strip(),

            "worker_type": worker_type,

            "home_sigungu_code": (
                sigungu_code
            ),

            "sido_name": region.get(
                "sido_name",
                "",
            ),

            "sigungu_name": region.get(
                "sigungu_name",
                "",
            ),

            "status": status,

            "availability_status": (
                availability_mapping.get(
                    status,
                    "확인 필요",
                )
            ),

            "travel_distance_km": (
                parse_number_with_unit(
                    row[distance_column],
                    "km",
                )
            ),

            "travel_time_hour": (
                parse_number_with_unit(
                    row[time_column],
                    "h",
                )
            ),

            "battery_percent": (
                battery_percent
            ),

            "battery_context": (
                "드론 배터리"
                if worker_type == "드론요원"
                else "현장 단말/장비 배터리"
            ),
        })

    print(
        f"정제된 요원 수: {len(workers):,}명"
    )

    return workers


# =========================================================
# 6. 격자 예상 점검시간 계산
# =========================================================

def calculate_inspection_minutes(
    properties: dict,
) -> float:
    """
    최우선 예찰 및 우선 예찰 격자에 대해서만
    시연용 예상 점검시간을 계산한다.
    """
    priority_grade = (
        normalize_priority_grade(
            properties
        )
    )

    if priority_grade not in {
        "최우선 예찰",
        "우선 예찰",
    }:
        return 0.0

    minutes = float(
        BASE_INSPECTION_MINUTES
    )

    access_score = safe_float(
        properties.get(
            "access_score_v3"
        ),
        default=100,
    )

    if access_score < 60:
        minutes += (
            ACCESS_BELOW_60_EXTRA_MINUTES
        )

    if access_score < 40:
        minutes += (
            ACCESS_BELOW_40_EXTRA_MINUTES
        )

    environment_flag = safe_float(
        properties.get(
            "environment_caution_flag_v3",
            properties.get(
                "env_flag",
                0,
            ),
        )
    )

    if environment_flag == 1:
        minutes += (
            ENV_CAUTION_EXTRA_MINUTES
        )

    if priority_grade == "최우선 예찰":
        minutes += (
            TOP_PRIORITY_EXTRA_MINUTES
        )

    return minutes


# =========================================================
# 7. 격자 GeoJSON 분석
# =========================================================

def load_grid_data():
    """
    격자 GeoJSON을 읽고 시군구·읍면동별로
    위험도, 예찰 대상, 예상 점검시간을 집계한다.
    """
    print("\n[2/5] 격자 GeoJSON 분석 중...")

    if not GRID_GEOJSON_PATH.exists():
        stop(
            "격자 GeoJSON 파일이 없습니다.\n"
            f"{GRID_GEOJSON_PATH}"
        )

    with GRID_GEOJSON_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        geojson = json.load(file)

    features = geojson.get(
        "features",
        [],
    )

    print(
        f"격자 수: {len(features):,}개"
    )

    sigungu_name_map: dict[
        str,
        dict
    ] = {}

    sigungu_summary = defaultdict(
        lambda: {
            "sido_name": "",
            "sigungu_name": "",
            "all_grid_count": 0,
            "target_grid_count": 0,
            "very_high_count": 0,
            "high_count": 0,
            "top_priority_count": 0,
            "priority_count": 0,
            "low_access_target_count": 0,
            "environment_caution_count": 0,
            "estimated_minutes": 0.0,
            "risk_sum": 0.0,
            "risk_count": 0,
            "pressure_sum": 0.0,
            "pressure_count": 0,
            "access_sum": 0.0,
            "access_count": 0,
        }
    )

    emd_summary = defaultdict(
        lambda: {
            "sido_name": "",
            "sigungu_name": "",
            "emd_name": "",
            "all_grid_count": 0,
            "target_grid_count": 0,
            "very_high_count": 0,
            "high_count": 0,
            "top_priority_count": 0,
            "priority_count": 0,
            "low_access_target_count": 0,
            "environment_caution_count": 0,
            "estimated_minutes": 0.0,
        }
    )

    target_grids: list[dict] = []

    for feature in features:
        properties = (
            feature.get(
                "properties",
                {},
            )
            or {}
        )

        sigungu_code = normalize_code(
            properties.get(
                "sigungu_code"
            ),
            5,
        )

        emd_code = normalize_code(
            properties.get(
                "emd_code"
            ),
            8,
        )

        if not sigungu_code:
            continue

        sido_name = str(
            properties.get(
                "sido_name",
                "",
            )
        )

        sigungu_name = str(
            properties.get(
                "sigungu_name",
                "",
            )
        )

        emd_name = str(
            properties.get(
                "emd_name",
                "",
            )
        )

        sigungu_name_map[
            sigungu_code
        ] = {
            "sido_name": sido_name,
            "sigungu_name": sigungu_name,
        }

        sigungu = sigungu_summary[
            sigungu_code
        ]

        sigungu["sido_name"] = (
            sido_name
        )

        sigungu["sigungu_name"] = (
            sigungu_name
        )

        emd = emd_summary[
            (
                sigungu_code,
                emd_code,
            )
        ]

        emd["sido_name"] = sido_name
        emd["sigungu_name"] = (
            sigungu_name
        )
        emd["emd_name"] = emd_name

        sigungu["all_grid_count"] += 1
        emd["all_grid_count"] += 1

        risk_grade = (
            normalize_risk_grade(
                properties
            )
        )

        priority_grade = (
            normalize_priority_grade(
                properties
            )
        )

        risk_score = safe_float(
            properties.get(
                "risk_score"
            )
        )

        sigungu["risk_sum"] += (
            risk_score
        )

        sigungu["risk_count"] += 1

        pressure_score = safe_float(
            properties.get(
                "recent_pressure_score",
                properties.get(
                    "infection_pressure",
                    0,
                ),
            )
        )

        sigungu["pressure_sum"] += (
            pressure_score
        )

        sigungu[
            "pressure_count"
        ] += 1

        access_score = safe_float(
            properties.get(
                "access_score_v3"
            )
        )

        sigungu["access_sum"] += (
            access_score
        )

        sigungu[
            "access_count"
        ] += 1

        if risk_grade == "매우 높음":
            sigungu[
                "very_high_count"
            ] += 1

            emd[
                "very_high_count"
            ] += 1

        if risk_grade == "높음":
            sigungu[
                "high_count"
            ] += 1

            emd[
                "high_count"
            ] += 1

        if (
            priority_grade
            == "최우선 예찰"
        ):
            sigungu[
                "top_priority_count"
            ] += 1

            emd[
                "top_priority_count"
            ] += 1

        if (
            priority_grade
            == "우선 예찰"
        ):
            sigungu[
                "priority_count"
            ] += 1

            emd[
                "priority_count"
            ] += 1

        estimated_minutes = (
            calculate_inspection_minutes(
                properties
            )
        )

        if estimated_minutes <= 0:
            continue

        sigungu[
            "target_grid_count"
        ] += 1

        emd[
            "target_grid_count"
        ] += 1

        sigungu[
            "estimated_minutes"
        ] += estimated_minutes

        emd[
            "estimated_minutes"
        ] += estimated_minutes

        if access_score < 40:
            sigungu[
                "low_access_target_count"
            ] += 1

            emd[
                "low_access_target_count"
            ] += 1

        environment_flag = safe_float(
            properties.get(
                "environment_caution_flag_v3",
                properties.get(
                    "env_flag",
                    0,
                ),
            )
        )

        if environment_flag == 1:
            sigungu[
                "environment_caution_count"
            ] += 1

            emd[
                "environment_caution_count"
            ] += 1

        target_grids.append({
            "grid_id": str(
                properties.get(
                    "grid_id",
                    properties.get(
                        "id",
                        "",
                    ),
                )
            ),

            "sido_name": sido_name,

            "sigungu_code": (
                sigungu_code
            ),

            "sigungu_name": (
                sigungu_name
            ),

            "emd_code": emd_code,

            "emd_name": emd_name,

            "priority_grade": (
                priority_grade
            ),

            "risk_grade": risk_grade,

            "risk_score": risk_score,

            "access_score": (
                access_score
            ),

            "estimated_minutes": (
                estimated_minutes
            ),
        })

    return (
        sigungu_name_map,
        sigungu_summary,
        emd_summary,
        target_grids,
    )


# =========================================================
# 8. 시군구·읍면동별 필요 인력 계산
# =========================================================

def create_workforce_results(
    workers: list[dict],
    sigungu_summary,
    emd_summary,
    target_grids: list[dict],
) -> tuple[
    list[dict],
    list[dict],
    dict,
]:
    """
    시군구 및 읍면동별 필요 현장요원,
    드론요원, 방제 대기요원을 계산한다.
    """
    print("\n[3/5] 필요 인력 계산 중...")

    worker_pool = defaultdict(
        lambda: {
            "field_total": 0,
            "control_total": 0,
            "drone_total": 0,
            "field_waiting": 0,
            "control_waiting": 0,
            "drone_waiting": 0,
        }
    )

    for worker in workers:
        code = worker[
            "home_sigungu_code"
        ]

        worker_type = worker[
            "worker_type"
        ]

        status = worker[
            "status"
        ]

        if worker_type == "현장요원":
            worker_pool[code][
                "field_total"
            ] += 1

            if status == "대기":
                worker_pool[code][
                    "field_waiting"
                ] += 1

        elif worker_type == "방제요원":
            worker_pool[code][
                "control_total"
            ] += 1

            if status == "대기":
                worker_pool[code][
                    "control_waiting"
                ] += 1

        elif worker_type == "드론요원":
            worker_pool[code][
                "drone_total"
            ] += 1

            if status == "대기":
                worker_pool[code][
                    "drone_waiting"
                ] += 1

    sigungu_rows: list[dict] = []

    for code, summary in sorted(
        sigungu_summary.items()
    ):
        pool = worker_pool[code]

        required_person_days = (
            summary[
                "estimated_minutes"
            ]
            / WORK_MINUTES_PER_PERSON_DAY
        )

        required_field_workers = (
            math.ceil(
                required_person_days
                / OPERATION_DAYS
            )
        )

        required_drone_workers = (
            math.ceil(
                summary[
                    "low_access_target_count"
                ]
                / LOW_ACCESS_GRIDS_PER_DRONE
            )
            if summary[
                "low_access_target_count"
            ] > 0
            else 0
        )

        required_control_workers = (
            math.ceil(
                summary[
                    "very_high_count"
                ]
                / VERY_HIGH_GRIDS_PER_CONTROL_WORKER
            )
            if summary[
                "very_high_count"
            ] > 0
            else 0
        )

        sigungu_rows.append({
            "sigungu_code": code,

            "sido_name": summary[
                "sido_name"
            ],

            "sigungu_name": summary[
                "sigungu_name"
            ],

            "all_grid_count": summary[
                "all_grid_count"
            ],

            "target_grid_count": summary[
                "target_grid_count"
            ],

            "very_high_count": summary[
                "very_high_count"
            ],

            "high_count": summary[
                "high_count"
            ],

            "top_priority_count": summary[
                "top_priority_count"
            ],

            "priority_count": summary[
                "priority_count"
            ],

            "low_access_target_count": (
                summary[
                    "low_access_target_count"
                ]
            ),

            "environment_caution_count": (
                summary[
                    "environment_caution_count"
                ]
            ),

            "avg_risk_score": round(
                summary["risk_sum"]
                / summary["risk_count"],
                2,
            )
            if summary["risk_count"]
            else 0,

            "avg_infection_pressure": round(
                summary[
                    "pressure_sum"
                ]
                / summary[
                    "pressure_count"
                ],
                2,
            )
            if summary[
                "pressure_count"
            ]
            else 0,

            "avg_access_score": round(
                summary["access_sum"]
                / summary["access_count"],
                2,
            )
            if summary["access_count"]
            else 0,

            "estimated_minutes": round(
                summary[
                    "estimated_minutes"
                ],
                1,
            ),

            "required_person_days": round(
                required_person_days,
                2,
            ),

            "required_field_workers": (
                required_field_workers
            ),

            "available_field_workers": (
                pool["field_waiting"]
            ),

            "field_worker_gap": (
                pool["field_waiting"]
                - required_field_workers
            ),

            "required_drone_workers": (
                required_drone_workers
            ),

            "available_drone_workers": (
                pool["drone_waiting"]
            ),

            "drone_worker_gap": (
                pool["drone_waiting"]
                - required_drone_workers
            ),

            "required_control_standby": (
                required_control_workers
            ),

            "available_control_workers": (
                pool["control_waiting"]
            ),

            "control_worker_gap": (
                pool["control_waiting"]
                - required_control_workers
            ),
        })

    emd_rows: list[dict] = []

    for (
        sigungu_code,
        emd_code,
    ), summary in sorted(
        emd_summary.items()
    ):
        required_person_days = (
            summary[
                "estimated_minutes"
            ]
            / WORK_MINUTES_PER_PERSON_DAY
        )

        required_field_workers = (
            math.ceil(
                required_person_days
                / OPERATION_DAYS
            )
        )

        emd_rows.append({
            "sigungu_code": (
                sigungu_code
            ),

            "sido_name": summary[
                "sido_name"
            ],

            "sigungu_name": summary[
                "sigungu_name"
            ],

            "emd_code": emd_code,

            "emd_name": summary[
                "emd_name"
            ],

            "all_grid_count": summary[
                "all_grid_count"
            ],

            "target_grid_count": summary[
                "target_grid_count"
            ],

            "very_high_count": summary[
                "very_high_count"
            ],

            "high_count": summary[
                "high_count"
            ],

            "top_priority_count": summary[
                "top_priority_count"
            ],

            "priority_count": summary[
                "priority_count"
            ],

            "low_access_target_count": (
                summary[
                    "low_access_target_count"
                ]
            ),

            "environment_caution_count": (
                summary[
                    "environment_caution_count"
                ]
            ),

            "estimated_minutes": round(
                summary[
                    "estimated_minutes"
                ],
                1,
            ),

            "required_person_days": round(
                required_person_days,
                2,
            ),

            "required_field_workers": (
                required_field_workers
            ),
        })

    return (
        sigungu_rows,
        emd_rows,
        worker_pool,
    )


# =========================================================
# 9. 실제 요원-격자 배정
# =========================================================

def create_worker_assignments(
    workers: list[dict],
    target_grids: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    대기 상태의 현장요원에게
    운영기간 내 처리 가능한 범위만 배정한다.

    요원 1명의 최대 배정 가능시간:
    360분 × 5일 = 1,800분

    처리하지 못한 격자는
    unassigned_grids.csv로 분리한다.
    """
    print("\n[4/5] 요원별 격자 배정 중...")

    max_minutes_per_worker = (
        WORK_MINUTES_PER_PERSON_DAY
        * OPERATION_DAYS
    )

    available_field_workers = defaultdict(
        list
    )

    for worker in workers:
        if (
            worker["worker_type"]
            == "현장요원"
            and worker["status"]
            == "대기"
        ):
            worker_copy = (
                worker.copy()
            )

            worker_copy[
                "assigned_minutes"
            ] = 0.0

            worker_copy[
                "assigned_grid_count"
            ] = 0

            available_field_workers[
                worker[
                    "home_sigungu_code"
                ]
            ].append(worker_copy)

    grid_groups = defaultdict(list)

    for grid in target_grids:
        grid_groups[
            grid["sigungu_code"]
        ].append(grid)

    assignments: list[dict] = []
    unassigned_grids: list[dict] = []

    for sigungu_code, grids in (
        grid_groups.items()
    ):
        area_workers = (
            available_field_workers[
                sigungu_code
            ]
        )

        grids.sort(
            key=lambda item: (
                0
                if item[
                    "priority_grade"
                ] == "최우선 예찰"
                else 1,

                -item[
                    "risk_score"
                ],
            )
        )

        if not area_workers:
            for grid in grids:
                unassigned_grids.append({
                    **grid,

                    "unassigned_reason": (
                        "대기 현장요원 없음"
                    ),
                })

            continue

        for grid in grids:
            grid_minutes = safe_float(
                grid[
                    "estimated_minutes"
                ]
            )

            sorted_workers = sorted(
                area_workers,
                key=lambda worker: (
                    worker[
                        "assigned_minutes"
                    ],

                    worker[
                        "assigned_grid_count"
                    ],
                ),
            )

            assigned_worker = None

            for worker in sorted_workers:
                projected_minutes = (
                    worker[
                        "assigned_minutes"
                    ]
                    + grid_minutes
                )

                if (
                    projected_minutes
                    <= max_minutes_per_worker
                ):
                    assigned_worker = worker
                    break

            if assigned_worker is None:
                unassigned_grids.append({
                    **grid,

                    "unassigned_reason": (
                        "운영기간 내 "
                        "가용 작업시간 초과"
                    ),
                })

                continue

            assigned_worker[
                "assigned_minutes"
            ] += grid_minutes

            assigned_worker[
                "assigned_grid_count"
            ] += 1

            assignments.append({
                "worker_id": assigned_worker[
                    "worker_id"
                ],

                "worker_name": assigned_worker[
                    "worker_name"
                ],

                "worker_type": assigned_worker[
                    "worker_type"
                ],

                "sigungu_code": (
                    sigungu_code
                ),

                "sigungu_name": grid[
                    "sigungu_name"
                ],

                "emd_code": grid[
                    "emd_code"
                ],

                "emd_name": grid[
                    "emd_name"
                ],

                "grid_id": grid[
                    "grid_id"
                ],

                "visit_order": assigned_worker[
                    "assigned_grid_count"
                ],

                "priority_grade": grid[
                    "priority_grade"
                ],

                "risk_grade": grid[
                    "risk_grade"
                ],

                "estimated_minutes": (
                    grid_minutes
                ),

                "worker_total_assigned_minutes": (
                    assigned_worker[
                        "assigned_minutes"
                    ]
                ),

                "worker_capacity_minutes": (
                    max_minutes_per_worker
                ),

                "assignment_status": (
                    "배정 예정"
                ),
            })

    return (
        assignments,
        unassigned_grids,
    )


# =========================================================
# 10. CSV 저장
# =========================================================

def save_csv(
    filename: str,
    rows: list[dict],
) -> None:
    output_path = (
        OUTPUT_DIR
        / filename
    )

    if not rows:
        print(
            f"[경고] {filename}: "
            "저장할 데이터가 없습니다."
        )
        return

    dataframe = pd.DataFrame(
        rows
    )

    dataframe.to_csv(
        output_path,
        index=False,
        encoding="utf-8-sig",
    )

    print(
        f"저장: {output_path}"
    )


# =========================================================
# 11. 메인 실행
# =========================================================

def main() -> None:
    print("=" * 72)
    print(
        "소나무재선충병 AI 예찰 "
        "요원 배치 데이터 생성"
    )
    print("=" * 72)

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    (
        sigungu_name_map,
        sigungu_summary,
        emd_summary,
        target_grids,
    ) = load_grid_data()

    workers = load_worker_data(
        sigungu_name_map
    )

    (
        sigungu_rows,
        emd_rows,
        worker_pool,
    ) = create_workforce_results(
        workers,
        sigungu_summary,
        emd_summary,
        target_grids,
    )

    (
        assignments,
        unassigned_grids,
    ) = create_worker_assignments(
        workers,
        target_grids,
    )

    print("\n[5/5] 결과 파일 저장 중...")

    save_csv(
        "worker_master.csv",
        workers,
    )

    save_csv(
        "admin_workforce_summary.csv",
        sigungu_rows,
    )

    save_csv(
        "emd_workforce_summary.csv",
        emd_rows,
    )

    save_csv(
        "worker_assignment.csv",
        assignments,
    )

    save_csv(
        "unassigned_grids.csv",
        unassigned_grids,
    )

    print()
    print("=" * 72)
    print("작업 완료")
    print("=" * 72)

    print(
        f"요원 마스터: "
        f"{len(workers):,}명"
    )

    print(
        f"시군구 요약: "
        f"{len(sigungu_rows):,}개"
    )

    print(
        f"읍면동 요약: "
        f"{len(emd_rows):,}개"
    )

    print(
        f"예찰 대상 격자: "
        f"{len(target_grids):,}개"
    )

    print(
        f"요원-격자 배정: "
        f"{len(assignments):,}건"
    )

    print(
        f"미배정 격자: "
        f"{len(unassigned_grids):,}건"
    )

    print()
    print("결과 저장 폴더:")
    print(OUTPUT_DIR)

    print()
    print(
        "[주의] 필요 인력과 예상 점검시간은 "
        "공식 작업기준이 아니라 경진대회 "
        "시연용 업무량 환산값입니다."
    )


if __name__ == "__main__":
    main()