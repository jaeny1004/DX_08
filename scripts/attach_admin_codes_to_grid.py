from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd


# =========================================================
# 1. 프로젝트 경로 설정
# =========================================================

PROJECT_DIR = Path(
    r"C:\Users\User\Desktop\산림 데이터셋\DX_08"
)

# 입력 격자 GeoJSON
GRID_INPUT_PATH = (
    PROJECT_DIR
    / "public"
    / "data"
    / "final_ui_candidate_v4.geojson"
)

# 행정동 경계 Shapefile
ADMIN_BOUNDARY_PATH = (
    PROJECT_DIR
    / "public"
    / "data"
    / "센서스"
    /"BND_ADM_DONG_PG.shp"
)

# 센서스 행정구역 코드표
ADMIN_CODE_XLSX_PATH = (
    PROJECT_DIR
    / "public"
    / "data"
    / "센서스 공간정보 지역 코드.xlsx"
)

# 사용할 엑셀 시트
ADMIN_CODE_SHEET_NAME = "2025년 6월"

# 검증용 출력 파일
PUBLIC_OUTPUT_PATH = (
    PROJECT_DIR
    / "public"
    / "data"
    / "final_ui_candidate_v4_with_admin.geojson"
)

BACKEND_OUTPUT_PATH = (
    PROJECT_DIR
    / "rag-backend"
    / "data"
    / "final_ui_candidate_v4_with_admin.geojson"
)

# 행정동이 붙지 않은 격자 목록
UNMATCHED_OUTPUT_PATH = (
    PROJECT_DIR
    / "data"
    / "admin"
    / "unmatched_grid_admin.csv"
)

# 행정동별 결합 통계
SUMMARY_OUTPUT_PATH = (
    PROJECT_DIR
    / "data"
    / "admin"
    / "admin_join_summary.csv"
)

# 분석 좌표계
ANALYSIS_CRS = "EPSG:5186"

# 웹 지도 출력 좌표계
WEB_CRS = "EPSG:4326"

MANUAL_ADMIN_CODE_FIXES = {
    "37580351": {
        "sido_code": "37",
        "sido_name": "경상북도",
        "sigungu_code": "37580",
        "sigungu_name": "성주군",
        "emd_code": "37580351",
        "emd_name": "금수강산면",
    }
}

# =========================================================
# 2. 공통 함수
# =========================================================

def stop(message: str) -> None:
    """오류 메시지를 출력하고 실행을 중단한다."""
    print("\n[실행 중단]")
    print(message)
    sys.exit(1)


def check_file_exists(path: Path, label: str) -> None:
    """필수 입력 파일이 존재하는지 확인한다."""
    if not path.exists():
        stop(
            f"{label} 파일을 찾지 못했습니다.\n"
            f"확인 경로: {path}"
        )


def normalize_code(
    series: pd.Series,
    length: int,
) -> pd.Series:
    """
    숫자 또는 문자열로 읽힌 행정구역 코드를
    지정한 자릿수의 문자열로 변환한다.

    예:
    10.0 -> '010'
    '530' -> '530'
    """
    normalized = (
        series
        .astype("string")
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
    )

    normalized = normalized.where(
        normalized.notna(),
        pd.NA,
    )

    return normalized.str.zfill(length)


def get_grid_id_column(
    columns: list[str],
) -> str:
    """
    격자 식별자 컬럼을 찾는다.
    grid_id를 우선하고, 없으면 id를 사용한다.
    """
    if "grid_id" in columns:
        return "grid_id"

    if "id" in columns:
        return "id"

    stop(
        "격자 식별자 컬럼을 찾지 못했습니다.\n"
        "필요한 컬럼: grid_id 또는 id"
    )

    return ""


# =========================================================
# 3. 센서스 코드표 읽기
# =========================================================

def load_admin_code_table() -> pd.DataFrame:
    """
    센서스 공간정보 지역 코드.xlsx에서
    시도·시군구·읍면동 코드표를 읽는다.
    """
    print("\n[1/7] 센서스 행정구역 코드표 읽는 중...")

    try:
        code_df = pd.read_excel(
            ADMIN_CODE_XLSX_PATH,
            sheet_name=ADMIN_CODE_SHEET_NAME,
            header=1,
            dtype="string",
        )
    except ValueError as error:
        stop(
            f"엑셀 시트 '{ADMIN_CODE_SHEET_NAME}'를 "
            f"찾지 못했습니다.\n{error}"
        )
    except Exception as error:
        stop(
            "센서스 코드표를 읽는 중 오류가 발생했습니다.\n"
            f"{error}"
        )

    expected_columns = {
        "시도코드",
        "시도명칭",
        "시군구코드",
        "시군구명칭",
        "읍면동코드",
        "읍면동명칭",
    }

    missing_columns = expected_columns - set(code_df.columns)

    if missing_columns:
        stop(
            "센서스 코드표에서 필요한 컬럼을 찾지 못했습니다.\n"
            f"누락 컬럼: {sorted(missing_columns)}\n"
            f"실제 컬럼: {code_df.columns.tolist()}"
        )

    code_df = code_df[
        [
            "시도코드",
            "시도명칭",
            "시군구코드",
            "시군구명칭",
            "읍면동코드",
            "읍면동명칭",
        ]
    ].copy()

    # 코드 자릿수 보정
    code_df["sido_code"] = normalize_code(
        code_df["시도코드"],
        2,
    )

    code_df["sigungu_code_part"] = normalize_code(
        code_df["시군구코드"],
        3,
    )

    code_df["emd_code_part"] = normalize_code(
        code_df["읍면동코드"],
        3,
    )

    # 행정동 경계 ADM_CD와 연결할 8자리 코드
    code_df["adm_code"] = (
        code_df["sido_code"]
        + code_df["sigungu_code_part"]
        + code_df["emd_code_part"]
    )

    # 5자리 시군구 코드
    code_df["sigungu_code"] = (
        code_df["sido_code"]
        + code_df["sigungu_code_part"]
    )

    # 사용자에게 제공할 컬럼명으로 변경
    code_df = code_df.rename(
        columns={
            "시도명칭": "sido_name",
            "시군구명칭": "sigungu_name",
            "읍면동명칭": "emd_name_code_table",
        }
    )

    code_df = code_df[
        [
            "adm_code",
            "sido_code",
            "sido_name",
            "sigungu_code",
            "sigungu_name",
            "emd_code_part",
            "emd_name_code_table",
        ]
    ].copy()

    # 빈 행 제거
    code_df = code_df.dropna(
        subset=["adm_code"]
    )

    # 코드 중복 확인
    duplicate_count = int(
        code_df["adm_code"].duplicated().sum()
    )

    if duplicate_count > 0:
        duplicated = code_df[
            code_df["adm_code"].duplicated(
                keep=False
            )
        ].sort_values("adm_code")

        duplicate_sample = duplicated.head(20)

        print(
            f"[경고] 센서스 코드표에 중복 ADM 코드가 "
            f"{duplicate_count:,}건 있습니다."
        )
        print(duplicate_sample.to_string(index=False))

        # 동일 코드 중 첫 번째 행 사용
        code_df = code_df.drop_duplicates(
            subset=["adm_code"],
            keep="first",
        )

    print(
        f"센서스 행정구역 코드: "
        f"{len(code_df):,}개"
    )

    return code_df


# =========================================================
# 4. 행정동 경계 읽기
# =========================================================

def load_admin_boundary(
    code_df: pd.DataFrame,
) -> gpd.GeoDataFrame:
    """
    행정동 경계 Shapefile을 읽고
    센서스 코드표를 ADM_CD 기준으로 결합한다.
    """
    print("\n[2/7] 행정동 경계 읽는 중...")

    try:
        admin_gdf = gpd.read_file(
            ADMIN_BOUNDARY_PATH
        )
    except Exception as error:
        stop(
            "행정동 경계 파일을 읽는 중 "
            "오류가 발생했습니다.\n"
            f"{error}"
        )

    expected_columns = {
        "ADM_CD",
        "ADM_NM",
        "geometry",
    }

    missing_columns = (
        expected_columns
        - set(admin_gdf.columns)
    )

    if missing_columns:
        stop(
            "행정동 경계에 필요한 컬럼이 없습니다.\n"
            f"누락 컬럼: {sorted(missing_columns)}\n"
            f"실제 컬럼: {admin_gdf.columns.tolist()}"
        )

    if admin_gdf.crs is None:
        stop(
            "행정동 경계 파일의 좌표계가 없습니다.\n"
            "PRJ 파일이 함께 있는지 확인하세요."
        )

    print(f"행정동 경계 원본 CRS: {admin_gdf.crs}")
    print(f"행정동 경계 수: {len(admin_gdf):,}개")

    # 분석 좌표계 통일
    if admin_gdf.crs.to_string() != ANALYSIS_CRS:
        print(
            f"행정동 경계를 {ANALYSIS_CRS}로 "
            "변환합니다."
        )

        admin_gdf = admin_gdf.to_crs(
            ANALYSIS_CRS
        )

    admin_gdf = admin_gdf[
        [
            "BASE_DATE",
            "ADM_CD",
            "ADM_NM",
            "geometry",
        ]
    ].copy()

    admin_gdf["adm_code"] = normalize_code(
        admin_gdf["ADM_CD"],
        8,
    )

    # 유효하지 않은 폴리곤 보정
    invalid_count = int(
        (~admin_gdf.geometry.is_valid).sum()
    )

    if invalid_count > 0:
        print(
            f"[경고] 유효하지 않은 행정경계 "
            f"{invalid_count:,}개를 보정합니다."
        )

        admin_gdf["geometry"] = (
            admin_gdf.geometry.make_valid()
        )

    # 센서스 코드표 연결
    admin_gdf = admin_gdf.merge(
        code_df,
        on="adm_code",
        how="left",
        validate="one_to_one",
    )

    # 경계 파일의 이름을 최종 행정동 이름으로 사용
    admin_gdf["emd_name"] = (
        admin_gdf["ADM_NM"]
        .astype("string")
        .str.strip()
    )

    # 최종 8자리 행정동 코드
    admin_gdf["emd_code"] = (
        admin_gdf["adm_code"]
    )
    # 최신 행정구역 개편이 센서스 코드표에 반영되지 않은 경우 수동 보정
    for adm_code, fix_values in MANUAL_ADMIN_CODE_FIXES.items():
        fix_mask = admin_gdf["adm_code"] == adm_code

        if fix_mask.any():
            admin_gdf.loc[
                fix_mask,
                "sido_code"
            ] = fix_values["sido_code"]

            admin_gdf.loc[
                fix_mask,
                "sido_name"
            ] = fix_values["sido_name"]

            admin_gdf.loc[
                fix_mask,
                "sigungu_code"
            ] = fix_values["sigungu_code"]

            admin_gdf.loc[
                fix_mask,
                "sigungu_name"
            ] = fix_values["sigungu_name"]

            admin_gdf.loc[
                fix_mask,
                "emd_code"
            ] = fix_values["emd_code"]

            admin_gdf.loc[
                fix_mask,
                "emd_name"
            ] = fix_values["emd_name"]

            print(
                f"[수동 보정] {adm_code} "
                f"{fix_values['sido_name']} "
                f"{fix_values['sigungu_name']} "
                f"{fix_values['emd_name']}"
            )
    unmatched_code_count = int(
        admin_gdf["sido_name"].isna().sum()
    )

    print(
        f"센서스 코드표 연결 성공: "
        f"{len(admin_gdf) - unmatched_code_count:,}개"
    )

    if unmatched_code_count > 0:
        print(
            f"[경고] 센서스 코드표와 연결되지 않은 "
            f"행정동 경계: {unmatched_code_count:,}개"
        )

        print(
            admin_gdf.loc[
                admin_gdf["sido_name"].isna(),
                [
                    "ADM_CD",
                    "ADM_NM",
                ],
            ]
            .head(20)
            .to_string(index=False)
        )

    return admin_gdf[
        [
            "adm_code",
            "sido_code",
            "sido_name",
            "sigungu_code",
            "sigungu_name",
            "emd_code",
            "emd_name",
            "BASE_DATE",
            "geometry",
        ]
    ].copy()


# =========================================================
# 5. 격자 GeoJSON 읽기
# =========================================================

def load_grid() -> gpd.GeoDataFrame:
    """
    격자 GeoJSON을 읽고 분석 좌표계로 변환한다.
    """
    print("\n[3/7] 격자 GeoJSON 읽는 중...")

    try:
        grid_gdf = gpd.read_file(
            GRID_INPUT_PATH
        )
    except Exception as error:
        stop(
            "격자 GeoJSON을 읽는 중 "
            "오류가 발생했습니다.\n"
            f"{error}"
        )

    if grid_gdf.empty:
        stop("격자 GeoJSON에 데이터가 없습니다.")

    if grid_gdf.crs is None:
        print(
            "[경고] 격자 GeoJSON의 CRS가 없습니다."
        )
        print(
            "웹지도 GeoJSON 기준으로 "
            "EPSG:4326을 지정합니다."
        )

        grid_gdf = grid_gdf.set_crs(
            WEB_CRS,
            allow_override=True,
        )

    grid_id_column = get_grid_id_column(
        grid_gdf.columns.tolist()
    )

    print(f"격자 수: {len(grid_gdf):,}개")
    print(f"격자 ID 컬럼: {grid_id_column}")
    print(f"격자 원본 CRS: {grid_gdf.crs}")

    # 원본 순서 복구용 번호
    grid_gdf["_original_order"] = range(
        len(grid_gdf)
    )

    # 공간조인 전 기존 행정구역 컬럼 제거
    existing_admin_columns = [
        "adm_code",
        "sido_code",
        "sido_name",
        "sigungu_code",
        "sigungu_name",
        "emd_code",
        "emd_name",
        "admin_base_date",
        "admin_match_method",
        "admin_distance_m",
    ]

    columns_to_drop = [
        column
        for column in existing_admin_columns
        if column in grid_gdf.columns
    ]

    if columns_to_drop:
        print(
            "기존 행정구역 컬럼을 제거하고 "
            "새로 계산합니다:"
        )
        print(columns_to_drop)

        grid_gdf = grid_gdf.drop(
            columns=columns_to_drop
        )

    # EPSG:5186으로 변환
    grid_5186 = grid_gdf.to_crs(
        ANALYSIS_CRS
    )

    # 잘못된 격자 도형 확인
    empty_geometry_count = int(
        grid_5186.geometry.is_empty.sum()
    )

    missing_geometry_count = int(
        grid_5186.geometry.isna().sum()
    )

    if (
        empty_geometry_count > 0
        or missing_geometry_count > 0
    ):
        stop(
            "격자에 비어 있거나 누락된 geometry가 "
            "있습니다.\n"
            f"빈 geometry: {empty_geometry_count:,}개\n"
            f"누락 geometry: {missing_geometry_count:,}개"
        )

    return grid_5186


# =========================================================
# 6. 격자 중심점과 행정동 공간조인
# =========================================================

def spatial_join_grid_admin(
    grid_gdf: gpd.GeoDataFrame,
    admin_gdf: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """
    1차: 격자 내부 대표점을 기준으로 행정동과 within 공간조인
    2차: 연결되지 않은 격자는 가장 가까운 행정동으로 보정

    최종 결과에는 다음 컬럼이 추가된다.

    - admin_match_method
        within: 행정동 내부에 포함되어 직접 연결
        nearest: 최근접 행정동으로 보정

    - admin_distance_m
        within은 0m
        nearest는 최근접 행정동 경계까지의 거리
    """
    print(
        "\n[4/7] 격자와 행정동 공간조인 중..."
    )

    # -----------------------------------------------------
    # 1. 공간조인용 대표점 생성
    # -----------------------------------------------------
    point_gdf = grid_gdf[
        [
            "_original_order",
            "geometry",
        ]
    ].copy()

    # centroid보다 폴리곤 내부에 존재할 가능성이 높은 대표점 사용
    point_gdf["geometry"] = (
        point_gdf.geometry.representative_point()
    )

    admin_join_columns = [
        "adm_code",
        "sido_code",
        "sido_name",
        "sigungu_code",
        "sigungu_name",
        "emd_code",
        "emd_name",
        "BASE_DATE",
        "geometry",
    ]

    admin_for_join = admin_gdf[
        admin_join_columns
    ].copy()

    # -----------------------------------------------------
    # 2. 1차: 행정동 내부 포함 여부로 공간조인
    # -----------------------------------------------------
    joined_points = gpd.sjoin(
        point_gdf,
        admin_for_join,
        how="left",
        predicate="within",
    )

    # 경계 문제 등으로 복수 연결된 경우 하나만 유지
    duplicate_order_count = int(
        joined_points["_original_order"]
        .duplicated()
        .sum()
    )

    if duplicate_order_count > 0:
        print(
            f"[경고] 복수 행정동에 연결된 격자 "
            f"{duplicate_order_count:,}건이 있습니다."
        )
        print(
            "동일 격자는 첫 번째 행정동 연결을 사용합니다."
        )

        joined_points = (
            joined_points
            .sort_values("_original_order")
            .drop_duplicates(
                subset=["_original_order"],
                keep="first",
            )
        )

    # 직접 포함된 격자 표시
    joined_points["admin_match_method"] = (
        joined_points["emd_code"]
        .notna()
        .map(
            {
                True: "within",
                False: pd.NA,
            }
        )
    )

    joined_points["admin_distance_m"] = (
        joined_points["emd_code"]
        .notna()
        .map(
            {
                True: 0.0,
                False: pd.NA,
            }
        )
    )

    # -----------------------------------------------------
    # 3. 미연결 격자 추출
    # -----------------------------------------------------
    unmatched_mask = (
        joined_points["emd_code"].isna()
    )

    unmatched_count = int(
        unmatched_mask.sum()
    )

    print(
        f"행정동 내부 직접 연결: "
        f"{len(joined_points) - unmatched_count:,}개"
    )

    print(
        f"최근접 행정동 보정 대상: "
        f"{unmatched_count:,}개"
    )

    # -----------------------------------------------------
    # 4. 2차: 미연결 격자를 최근접 행정동에 연결
    # -----------------------------------------------------
    if unmatched_count > 0:
        unmatched_orders = (
            joined_points.loc[
                unmatched_mask,
                "_original_order",
            ]
            .tolist()
        )

        unmatched_points = point_gdf[
            point_gdf["_original_order"].isin(
                unmatched_orders
            )
        ].copy()

        nearest_joined = gpd.sjoin_nearest(
            unmatched_points,
            admin_for_join,
            how="left",
            distance_col="admin_distance_m",
        )

        # 동일 거리의 행정동이 복수인 경우 첫 번째 사용
        nearest_duplicate_count = int(
            nearest_joined["_original_order"]
            .duplicated()
            .sum()
        )

        if nearest_duplicate_count > 0:
            print(
                f"[경고] 동일한 최근접 거리를 가진 격자 "
                f"{nearest_duplicate_count:,}건이 있습니다."
            )
            print(
                "거리와 행정동 코드 순으로 정렬한 뒤 "
                "첫 번째 행정동을 사용합니다."
            )

            nearest_joined = (
                nearest_joined
                .sort_values(
                    [
                        "_original_order",
                        "admin_distance_m",
                        "adm_code",
                    ]
                )
                .drop_duplicates(
                    subset=["_original_order"],
                    keep="first",
                )
            )

        nearest_joined[
            "admin_match_method"
        ] = "nearest"

        nearest_joined = nearest_joined[
            [
                "_original_order",
                "adm_code",
                "sido_code",
                "sido_name",
                "sigungu_code",
                "sigungu_name",
                "emd_code",
                "emd_name",
                "BASE_DATE",
                "admin_match_method",
                "admin_distance_m",
            ]
        ].copy()

        # 기존 미연결 행 제거
        joined_points = joined_points.loc[
            ~unmatched_mask
        ].copy()

        # 최근접 결과 추가
        joined_points = pd.concat(
            [
                joined_points,
                nearest_joined,
            ],
            ignore_index=True,
        )

    # -----------------------------------------------------
    # 5. 필요한 속성만 정리
    # -----------------------------------------------------
    joined_points = joined_points[
        [
            "_original_order",
            "adm_code",
            "sido_code",
            "sido_name",
            "sigungu_code",
            "sigungu_name",
            "emd_code",
            "emd_name",
            "BASE_DATE",
            "admin_match_method",
            "admin_distance_m",
        ]
    ].copy()

    joined_points = joined_points.rename(
        columns={
            "BASE_DATE": "admin_base_date",
        }
    )

    joined_points = joined_points.sort_values(
        "_original_order"
    )

    # -----------------------------------------------------
    # 6. 원래 격자 폴리곤에 행정구역 속성 결합
    # -----------------------------------------------------
    result_gdf = grid_gdf.merge(
        joined_points,
        on="_original_order",
        how="left",
        validate="one_to_one",
    )

    result_gdf = gpd.GeoDataFrame(
        result_gdf,
        geometry="geometry",
        crs=grid_gdf.crs,
    )

    # 거리값 소수점 정리
    result_gdf["admin_distance_m"] = (
        pd.to_numeric(
            result_gdf["admin_distance_m"],
            errors="coerce",
        )
        .round(2)
    )

    nearest_count = int(
        (
            result_gdf["admin_match_method"]
            == "nearest"
        ).sum()
    )

    if nearest_count > 0:
        nearest_distances = result_gdf.loc[
            result_gdf["admin_match_method"]
            == "nearest",
            "admin_distance_m",
        ]

        print()
        print("[최근접 행정동 보정 결과]")
        print(f"보정 격자 수: {nearest_count:,}개")
        print(
            f"평균 거리: "
            f"{nearest_distances.mean():,.2f}m"
        )
        print(
            f"중앙값 거리: "
            f"{nearest_distances.median():,.2f}m"
        )
        print(
            f"최대 거리: "
            f"{nearest_distances.max():,.2f}m"
        )

        over_1000_count = int(
            (nearest_distances > 1_000).sum()
        )

        over_3000_count = int(
            (nearest_distances > 3_000).sum()
        )

        print(
            f"1km 초과: {over_1000_count:,}개"
        )
        print(
            f"3km 초과: {over_3000_count:,}개"
        )

    return result_gdf
# =========================================================
# 7. 결과 검증
# =========================================================

def validate_result(
    result_gdf: gpd.GeoDataFrame,
) -> None:
    """
    공간조인 결과의 결합률과 데이터 이상 여부를 확인한다.
    """
    print("\n[5/7] 결과 검증 중...")

    total_count = len(result_gdf)

    matched_count = int(
        result_gdf["emd_code"].notna().sum()
    )

    unmatched_count = (
        total_count - matched_count
    )

    match_rate = (
        matched_count / total_count * 100
        if total_count > 0
        else 0
    )

    print(f"전체 격자: {total_count:,}개")
    print(f"행정동 연결 성공: {matched_count:,}개")
    print(f"행정동 연결 실패: {unmatched_count:,}개")
    print(f"연결률: {match_rate:.4f}%")

    if len(result_gdf) != total_count:
        stop(
            "공간조인 전후 격자 수가 달라졌습니다."
        )

    if result_gdf["_original_order"].duplicated().any():
        stop(
            "결과에 중복 격자가 발생했습니다."
        )

    # 미연결 격자 저장
    if unmatched_count > 0:
        grid_id_column = get_grid_id_column(
            result_gdf.columns.tolist()
        )

        unmatched_columns = [
            grid_id_column,
            "_original_order",
        ]

        # 디버깅용 중심점 좌표
        unmatched_gdf = result_gdf[
            result_gdf["emd_code"].isna()
        ].copy()

        unmatched_points = (
            unmatched_gdf.geometry
            .representative_point()
        )

        unmatched_df = unmatched_gdf[
            unmatched_columns
        ].copy()

        unmatched_df["center_x_5186"] = (
            unmatched_points.x.values
        )

        unmatched_df["center_y_5186"] = (
            unmatched_points.y.values
        )

        UNMATCHED_OUTPUT_PATH.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        unmatched_df.to_csv(
            UNMATCHED_OUTPUT_PATH,
            index=False,
            encoding="utf-8-sig",
        )

        print(
            "미연결 격자 목록 저장:"
        )
        print(UNMATCHED_OUTPUT_PATH)

    # 행정동별 격자 개수 요약
    summary_df = (
        result_gdf[
            result_gdf["emd_code"].notna()
        ]
        .groupby(
            [
                "sido_code",
                "sido_name",
                "sigungu_code",
                "sigungu_name",
                "emd_code",
                "emd_name",
            ],
            dropna=False,
        )
        .size()
        .reset_index(
            name="grid_count"
        )
        .sort_values(
            [
                "sido_code",
                "sigungu_code",
                "emd_code",
            ]
        )
    )

    SUMMARY_OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    summary_df.to_csv(
        SUMMARY_OUTPUT_PATH,
        index=False,
        encoding="utf-8-sig",
    )

    print(
        "행정동별 격자 개수 요약 저장:"
    )
    print(SUMMARY_OUTPUT_PATH)

    if match_rate < 95:
        print()
        print(
            "[중요 경고] 행정동 연결률이 95%보다 낮습니다."
        )
        print(
            "결과를 기존 UI 파일로 교체하지 마세요."
        )
        print(
            "행정동 경계 범위와 격자 위치를 "
            "먼저 점검해야 합니다."
        )


# =========================================================
# 8. GeoJSON 저장
# =========================================================

def save_result(
    result_gdf: gpd.GeoDataFrame,
) -> None:
    """
    결과를 EPSG:4326 GeoJSON으로 저장하고
    백엔드 폴더에도 동일한 파일을 복사한다.
    """
    print("\n[6/7] GeoJSON 저장 중...")

    output_gdf = result_gdf.copy()

    # 내부 작업용 컬럼 제거
    output_gdf = output_gdf.drop(
        columns=[
            "_original_order",
        ],
        errors="ignore",
    )

    # 웹지도용 EPSG:4326 변환
    output_gdf = output_gdf.to_crs(
        WEB_CRS
    )

    PUBLIC_OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    BACKEND_OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    # NaN을 JSON null로 처리하기 위해 객체형 변환
    output_gdf = output_gdf.where(
        pd.notna(output_gdf),
        None,
    )

    try:
        output_gdf.to_file(
            PUBLIC_OUTPUT_PATH,
            driver="GeoJSON",
            encoding="utf-8",
        )
    except Exception as error:
        stop(
            "결과 GeoJSON 저장 중 "
            "오류가 발생했습니다.\n"
            f"{error}"
        )

    # UI와 RAG가 같은 행정구역 속성을 사용하도록 복사
    shutil.copy2(
        PUBLIC_OUTPUT_PATH,
        BACKEND_OUTPUT_PATH,
    )

    print("프론트엔드 검증용 결과:")
    print(PUBLIC_OUTPUT_PATH)

    print("\n백엔드 검증용 결과:")
    print(BACKEND_OUTPUT_PATH)


# =========================================================
# 9. 저장된 GeoJSON 재검사
# =========================================================

def verify_saved_geojson() -> None:
    """
    저장 완료 후 GeoJSON을 다시 읽어서
    필수 속성과 좌표계를 확인한다.
    """
    print("\n[7/7] 저장 결과 재검사 중...")

    try:
        saved_gdf = gpd.read_file(
            PUBLIC_OUTPUT_PATH
        )
    except Exception as error:
        stop(
            "저장된 GeoJSON 재검사에 실패했습니다.\n"
            f"{error}"
        )

    required_columns = {
        "adm_code",
        "sido_code",
        "sido_name",
        "sigungu_code",
        "sigungu_name",
        "emd_code",
        "emd_name",
        "admin_base_date",
        "admin_match_method",
        "admin_distance_m",
        "geometry",
    }
    missing_columns = (
        required_columns
        - set(saved_gdf.columns)
    )

    if missing_columns:
        stop(
            "저장된 GeoJSON에 필요한 행정구역 "
            "컬럼이 없습니다.\n"
            f"누락 컬럼: {sorted(missing_columns)}"
        )

    print(f"저장된 격자 수: {len(saved_gdf):,}개")
    print(f"저장된 CRS: {saved_gdf.crs}")

    matched_count = int(
        saved_gdf["emd_code"].notna().sum()
    )

    print(
        f"행정동 코드 포함 격자: "
        f"{matched_count:,}개"
    )

    sample_columns = [
        column
        for column in [
            "grid_id",
            "id",
            "sido_code",
            "sido_name",
            "sigungu_code",
            "sigungu_name",
            "emd_code",
            "emd_name",
            "admin_match_method",
            "admin_distance_m",
        ]
        if column in saved_gdf.columns
    ]

    print("\n결과 예시 5건:")
    print(
        saved_gdf[
            sample_columns
        ]
        .head(5)
        .to_string(index=False)
    )


# =========================================================
# 10. 메인 실행
# =========================================================

def main() -> None:
    print("=" * 70)
    print("500m 격자 시도·시군구·행정동 코드 부여")
    print("=" * 70)

    # 필수 파일 확인
    check_file_exists(
        GRID_INPUT_PATH,
        "격자 GeoJSON",
    )

    check_file_exists(
        ADMIN_BOUNDARY_PATH,
        "행정동 경계",
    )

    check_file_exists(
        ADMIN_CODE_XLSX_PATH,
        "센서스 행정구역 코드표",
    )

    # 처리 실행
    code_df = load_admin_code_table()

    admin_gdf = load_admin_boundary(
        code_df
    )

    grid_gdf = load_grid()

    result_gdf = spatial_join_grid_admin(
        grid_gdf,
        admin_gdf,
    )

    validate_result(
        result_gdf
    )

    save_result(
        result_gdf
    )

    verify_saved_geojson()

    print()
    print("=" * 70)
    print("작업 완료")
    print("=" * 70)
    print(
        "기존 final_ui_candidate_v4.geojson은 "
        "아직 변경하지 않았습니다."
    )
    print(
        "먼저 *_with_admin.geojson의 결합률과 "
        "화면 동작을 확인하세요."
    )


if __name__ == "__main__":
    main()