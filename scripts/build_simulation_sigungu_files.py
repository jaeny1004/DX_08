from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import set_precision


KEEP_COLUMNS = [
    "grid_id",
    "id",
    "risk_score",
    "risk_percentile",
    "risk_candidate_flag",
    "pine_ratio",
    "recent_pressure_score",
    "access_score_v3",
    "geometry",
]

SIGUNGU_CODE_ALIASES = [
    "sigungu_code",
    "sigungu_cd",
    "sgg_cd",
    "SIG_CD",
    "SIGUNGU_CD",
    "code",
    "CODE",
]

SIGUNGU_NAME_ALIASES = [
    "sigungu_name",
    "sigungu_nm",
    "sgg_nm",
    "SIG_KOR_NM",
    "SIGUNGU_NM",
    "name",
    "NAME",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "전체 시뮬레이션 격자 GeoJSON을 시군구별 경량 GeoJSON으로 분할합니다."
        )
    )

    parser.add_argument(
        "--grid",
        required=True,
        help="전체 격자 GeoJSON 경로",
    )

    parser.add_argument(
        "--sigungu",
        required=True,
        help="시군구 경계 GeoJSON 경로",
    )

    parser.add_argument(
        "--output",
        required=True,
        help="출력 폴더 경로",
    )

    return parser.parse_args()


def find_column(
    columns: list[str],
    aliases: list[str],
    label: str,
) -> str:
    for alias in aliases:
        if alias in columns:
            return alias

    raise ValueError(
        f"{label} 컬럼을 찾지 못했습니다. "
        f"현재 컬럼: {', '.join(columns)}"
    )


def safe_filename(code: str) -> str:
    cleaned = "".join(
        character
        for character in str(code)
        if character.isalnum() or character in ("-", "_")
    )

    if not cleaned:
        raise ValueError(f"유효하지 않은 시군구 코드: {code}")

    return f"{cleaned}.geojson"


def main() -> None:
    args = parse_args()

    grid_path = Path(args.grid).expanduser().resolve()
    sigungu_path = Path(args.sigungu).expanduser().resolve()
    output_dir = Path(args.output).expanduser().resolve()

    if not grid_path.exists():
        raise FileNotFoundError(f"격자 파일을 찾지 못했습니다: {grid_path}")

    if not sigungu_path.exists():
        raise FileNotFoundError(f"시군구 파일을 찾지 못했습니다: {sigungu_path}")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("전체 격자:", grid_path)
    print("시군구 경계:", sigungu_path)
    print("출력 폴더:", output_dir)
    print("=" * 80)

    print("\n[1/7] 전체 격자 GeoJSON 읽는 중...")
    grid_gdf = gpd.read_file(
        grid_path,
        engine="pyogrio",
    )

    if grid_gdf.crs is None:
        raise ValueError("전체 격자 파일에 좌표계가 없습니다.")

    if grid_gdf.crs.to_epsg() != 4326:
        grid_gdf = grid_gdf.to_crs("EPSG:4326")

    available_keep_columns = [
        column
        for column in KEEP_COLUMNS
        if column in grid_gdf.columns
    ]

    if "geometry" not in available_keep_columns:
        available_keep_columns.append("geometry")

    grid_gdf = grid_gdf[available_keep_columns].copy()

    if "grid_id" not in grid_gdf.columns:
        if "id" not in grid_gdf.columns:
            raise ValueError("격자 식별 컬럼 grid_id 또는 id가 없습니다.")

        grid_gdf = grid_gdf.rename(columns={"id": "grid_id"})

    if "id" in grid_gdf.columns:
        grid_gdf = grid_gdf.drop(columns=["id"])

    print(f"전체 격자 수: {len(grid_gdf):,}")

    print("[2/7] 시군구 경계 읽는 중...")
    sigungu_gdf = gpd.read_file(
        sigungu_path,
        engine="pyogrio",
    )

    if sigungu_gdf.crs is None:
        raise ValueError("시군구 파일에 좌표계가 없습니다.")

    if sigungu_gdf.crs.to_epsg() != 4326:
        sigungu_gdf = sigungu_gdf.to_crs("EPSG:4326")

    code_column = find_column(
        list(sigungu_gdf.columns),
        SIGUNGU_CODE_ALIASES,
        "시군구 코드",
    )

    name_column = find_column(
        list(sigungu_gdf.columns),
        SIGUNGU_NAME_ALIASES,
        "시군구명",
    )

    sigungu_gdf = sigungu_gdf[
        [code_column, name_column, "geometry"]
    ].copy()

    sigungu_gdf = sigungu_gdf.rename(
        columns={
            code_column: "sigungu_code",
            name_column: "sigungu_name",
        }
    )

    sigungu_gdf["sigungu_code"] = (
        sigungu_gdf["sigungu_code"]
        .astype(str)
        .str.strip()
    )

    sigungu_gdf["sigungu_name"] = (
        sigungu_gdf["sigungu_name"]
        .astype(str)
        .str.strip()
    )

    print(f"시군구 수: {len(sigungu_gdf):,}")

    print("[3/7] 격자 중심점 계산 중...")
    centroid_series = grid_gdf.geometry.centroid

    grid_gdf["center_lng"] = centroid_series.x.round(6)
    grid_gdf["center_lat"] = centroid_series.y.round(6)

    point_gdf = gpd.GeoDataFrame(
        grid_gdf[["grid_id"]].copy(),
        geometry=centroid_series,
        crs="EPSG:4326",
    )

    print("[4/7] 시군구 공간조인 중...")
    joined = gpd.sjoin(
        point_gdf,
        sigungu_gdf[
            ["sigungu_code", "sigungu_name", "geometry"]
        ],
        how="left",
        predicate="within",
    )

    joined = joined[
        [
            "grid_id",
            "sigungu_code",
            "sigungu_name",
        ]
    ].drop_duplicates(
        subset=["grid_id"],
        keep="first",
    )

    grid_gdf = grid_gdf.merge(
        joined,
        on="grid_id",
        how="left",
    )

    missing_count = int(
        grid_gdf["sigungu_code"].isna().sum()
    )

    print(f"시군구 미매핑 격자: {missing_count:,}개")

    if missing_count > 0:
        print("미매핑 격자를 최근접 시군구로 보정합니다.")

        missing = grid_gdf[
            grid_gdf["sigungu_code"].isna()
        ][["grid_id", "center_lng", "center_lat"]].copy()

        missing_points = gpd.GeoDataFrame(
            missing[["grid_id"]].copy(),
            geometry=gpd.points_from_xy(
                missing["center_lng"],
                missing["center_lat"],
            ),
            crs="EPSG:4326",
        ).to_crs("EPSG:5186")

        sigungu_metric = sigungu_gdf.to_crs("EPSG:5186")

        nearest = gpd.sjoin_nearest(
            missing_points,
            sigungu_metric[
                ["sigungu_code", "sigungu_name", "geometry"]
            ],
            how="left",
            max_distance=2000,
            distance_col="nearest_distance_m",
        )

        nearest = nearest[
            [
                "grid_id",
                "sigungu_code",
                "sigungu_name",
            ]
        ].drop_duplicates(
            subset=["grid_id"],
            keep="first",
        )

        nearest_map = nearest.set_index("grid_id")

        missing_mask = grid_gdf["sigungu_code"].isna()

        grid_gdf.loc[
            missing_mask,
            "sigungu_code",
        ] = grid_gdf.loc[
            missing_mask,
            "grid_id",
        ].map(nearest_map["sigungu_code"])

        grid_gdf.loc[
            missing_mask,
            "sigungu_name",
        ] = grid_gdf.loc[
            missing_mask,
            "grid_id",
        ].map(nearest_map["sigungu_name"])

    final_missing_count = int(
        grid_gdf["sigungu_code"].isna().sum()
    )

    print(f"최종 시군구 미매핑 격자: {final_missing_count:,}개")

    if final_missing_count > 0:
        grid_gdf = grid_gdf[
            grid_gdf["sigungu_code"].notna()
        ].copy()

    print("[5/7] 속성과 좌표 정밀도 정리 중...")

    numeric_round = {
        "risk_score": 6,
        "risk_percentile": 6,
        "pine_ratio": 6,
        "recent_pressure_score": 6,
        "access_score_v3": 6,
        "center_lng": 6,
        "center_lat": 6,
    }

    for column, digits in numeric_round.items():
        if column in grid_gdf.columns:
            grid_gdf[column] = pd.to_numeric(
                grid_gdf[column],
                errors="coerce",
            ).fillna(0).round(digits)

    if "risk_candidate_flag" in grid_gdf.columns:
        grid_gdf["risk_candidate_flag"] = (
            grid_gdf["risk_candidate_flag"]
            .astype(str)
            .str.strip()
            .str.lower()
            .map(
                {
                    "true": 1,
                    "false": 0,
                    "1": 1,
                    "0": 0,
                }
            )
            .fillna(0)
            .astype("int8")
        )

    grid_gdf["geometry"] = set_precision(
        grid_gdf.geometry,
        grid_size=0.000001,
    )

    print("[6/7] 시군구별 파일 저장 중...")

    index_items: list[dict] = []

    grouped = grid_gdf.groupby(
        ["sigungu_code", "sigungu_name"],
        sort=True,
    )

    for sequence, ((code, name), group) in enumerate(
        grouped,
        start=1,
    ):
        code = str(code)
        name = str(name)
        filename = safe_filename(code)
        output_path = output_dir / filename

        group = gpd.GeoDataFrame(
            group.copy(),
            geometry="geometry",
            crs="EPSG:4326",
        )

        min_lng, min_lat, max_lng, max_lat = group.total_bounds

        group.to_file(
            output_path,
            driver="GeoJSON",
            encoding="utf-8",
            engine="pyogrio",
            layer_options={
                "COORDINATE_PRECISION": "6",
            },
        )

        file_size_mb = (
            output_path.stat().st_size / 1024 / 1024
        )

        index_items.append(
            {
                "code": code,
                "name": name,
                "file": filename,
                "count": int(len(group)),
                "sizeMb": round(file_size_mb, 3),
                "bounds": [
                    round(float(min_lng), 6),
                    round(float(min_lat), 6),
                    round(float(max_lng), 6),
                    round(float(max_lat), 6),
                ],
            }
        )

        print(
            f"[{sequence:03d}/{len(grouped):03d}] "
            f"{code} {name} | "
            f"{len(group):,}개 | "
            f"{file_size_mb:.2f}MB"
        )

    print("[7/7] index.json 저장 중...")

    index_payload = {
        "version": 1,
        "crs": "EPSG:4326",
        "totalFeatureCount": int(len(grid_gdf)),
        "sigunguCount": len(index_items),
        "items": index_items,
    }

    index_path = output_dir / "index.json"

    index_path.write_text(
        json.dumps(
            index_payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    total_size_mb = sum(
        path.stat().st_size
        for path in output_dir.glob("*.geojson")
    ) / 1024 / 1024

    print("\n" + "=" * 80)
    print("시군구별 경량 GeoJSON 생성 완료")
    print("=" * 80)
    print("출력 폴더:", output_dir)
    print("시군구 수:", len(index_items))
    print("총 격자 수:", f"{len(grid_gdf):,}")
    print("총 GeoJSON 용량:", f"{total_size_mb:.1f}MB")
    print("인덱스:", index_path)


if __name__ == "__main__":
    main()
