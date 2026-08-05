from __future__ import annotations

from pathlib import Path
import sys

import geopandas as gpd
import pandas as pd


PROJECT_DIR = Path(
    r"C:\Users\User\Desktop\산림 데이터셋\DX_08"
)

ADMIN_SHP_PATH = (
    PROJECT_DIR
    / "data"
    / "admin"
    / "BND_ADM_DONG_PG.shp"
)

ADMIN_CODE_XLSX_PATH = (
    PROJECT_DIR
    / "data"
    / "admin"
    / "센서스 공간정보 지역 코드.xlsx"
)

OUTPUT_PATH = (
    PROJECT_DIR
    / "public"
    / "data"
    / "sigungu_boundary.geojson"
)

SHEET_NAME = "2025년 6월"

ANALYSIS_CRS = "EPSG:5186"
WEB_CRS = "EPSG:4326"


MANUAL_ADMIN_CODE_FIXES = {
    "37580351": {
        "sido_code": "37",
        "sido_name": "경상북도",
        "sigungu_code": "37580",
        "sigungu_name": "성주군",
        "emd_name": "금수강산면",
    }
}


def stop(message: str) -> None:
    print("\n[실행 중단]")
    print(message)
    sys.exit(1)


def normalize_code(
    series: pd.Series,
    length: int,
) -> pd.Series:
    return (
        series
        .astype("string")
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
        .str.zfill(length)
    )


def load_code_table() -> pd.DataFrame:
    code_df = pd.read_excel(
        ADMIN_CODE_XLSX_PATH,
        sheet_name=SHEET_NAME,
        header=1,
        dtype="string",
    )

    required_columns = {
        "시도코드",
        "시도명칭",
        "시군구코드",
        "시군구명칭",
        "읍면동코드",
    }

    missing_columns = (
        required_columns - set(code_df.columns)
    )

    if missing_columns:
        stop(
            "센서스 코드표 컬럼이 부족합니다.\n"
            f"누락 컬럼: {sorted(missing_columns)}"
        )

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

    code_df["sigungu_code"] = (
        code_df["sido_code"]
        + code_df["sigungu_code_part"]
    )

    code_df["adm_code"] = (
        code_df["sigungu_code"]
        + code_df["emd_code_part"]
    )

    code_df = code_df.rename(
        columns={
            "시도명칭": "sido_name",
            "시군구명칭": "sigungu_name",
        }
    )

    return (
        code_df[
            [
                "adm_code",
                "sido_code",
                "sido_name",
                "sigungu_code",
                "sigungu_name",
            ]
        ]
        .dropna(subset=["adm_code"])
        .drop_duplicates(
            subset=["adm_code"],
            keep="first",
        )
    )


def main() -> None:
    print("=" * 70)
    print("시군구 클릭용 경계 GeoJSON 생성")
    print("=" * 70)

    if not ADMIN_SHP_PATH.exists():
        stop(
            "행정동 경계 파일이 없습니다.\n"
            f"{ADMIN_SHP_PATH}"
        )

    if not ADMIN_CODE_XLSX_PATH.exists():
        stop(
            "센서스 코드표가 없습니다.\n"
            f"{ADMIN_CODE_XLSX_PATH}"
        )

    code_df = load_code_table()

    admin_gdf = gpd.read_file(
        ADMIN_SHP_PATH
    )

    if admin_gdf.crs is None:
        stop(
            "행정동 경계 좌표계가 없습니다."
        )

    admin_gdf = admin_gdf.to_crs(
        ANALYSIS_CRS
    )

    admin_gdf["adm_code"] = normalize_code(
        admin_gdf["ADM_CD"],
        8,
    )

    admin_gdf = admin_gdf.merge(
        code_df,
        on="adm_code",
        how="left",
    )

    # 센서스 코드표에 반영되지 않은 최신 행정구역 보정
    for adm_code, values in (
        MANUAL_ADMIN_CODE_FIXES.items()
    ):
        mask = (
            admin_gdf["adm_code"] == adm_code
        )

        if not mask.any():
            continue

        admin_gdf.loc[
            mask,
            "sido_code",
        ] = values["sido_code"]

        admin_gdf.loc[
            mask,
            "sido_name",
        ] = values["sido_name"]

        admin_gdf.loc[
            mask,
            "sigungu_code",
        ] = values["sigungu_code"]

        admin_gdf.loc[
            mask,
            "sigungu_name",
        ] = values["sigungu_name"]

    missing_count = int(
        admin_gdf["sigungu_code"]
        .isna()
        .sum()
    )

    if missing_count > 0:
        print(
            f"[경고] 시군구 정보 누락 행정동: "
            f"{missing_count:,}개"
        )

        print(
            admin_gdf.loc[
                admin_gdf["sigungu_code"].isna(),
                [
                    "ADM_CD",
                    "ADM_NM",
                ],
            ]
            .head(20)
            .to_string(index=False)
        )

    admin_gdf = admin_gdf.dropna(
        subset=[
            "sido_code",
            "sigungu_code",
        ]
    )

    print(
        f"행정동 경계 수: "
        f"{len(admin_gdf):,}개"
    )

    # 읍면동 경계를 시군구 단위로 병합
    sigungu_gdf = admin_gdf.dissolve(
        by=[
            "sido_code",
            "sido_name",
            "sigungu_code",
            "sigungu_name",
        ],
        as_index=False,
    )

    # 도형 유효성 보정
    invalid_count = int(
        (~sigungu_gdf.geometry.is_valid).sum()
    )

    if invalid_count > 0:
        print(
            f"유효하지 않은 도형 "
            f"{invalid_count:,}개 보정"
        )

        sigungu_gdf["geometry"] = (
            sigungu_gdf.geometry.make_valid()
        )

    sigungu_gdf = sigungu_gdf[
        [
            "sido_code",
            "sido_name",
            "sigungu_code",
            "sigungu_name",
            "geometry",
        ]
    ].copy()

    sigungu_gdf = sigungu_gdf.to_crs(
        WEB_CRS
    )

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    sigungu_gdf.to_file(
        OUTPUT_PATH,
        driver="GeoJSON",
        encoding="utf-8",
    )

    print()
    print(
        f"생성된 시군구 경계: "
        f"{len(sigungu_gdf):,}개"
    )

    print(
        f"저장 좌표계: "
        f"{sigungu_gdf.crs}"
    )

    print("저장 위치:")
    print(OUTPUT_PATH)

    print()
    print("작업 완료")


if __name__ == "__main__":
    main()