from pathlib import Path
import json

import geopandas as gpd

INPUT_PATH = Path("public/data/sigungu_boundary.geojson")
OUTPUT_PATH = Path("public/data/sigungu_boundary_web.geojson")

# 웹지도용 단순화 강도(미터)
# 100~300m 권장. 값이 클수록 용량이 줄지만 경계가 더 단순해집니다.
SIMPLIFY_TOLERANCE_M = 150


def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(
            f"입력 파일이 없습니다: {INPUT_PATH.resolve()}"
        )

    print(f"[1/6] 원본 읽는 중: {INPUT_PATH}")
    gdf = gpd.read_file(INPUT_PATH)

    if gdf.empty:
        raise RuntimeError("입력 GeoJSON에 피처가 없습니다.")

    print(f"[2/6] 원본 CRS: {gdf.crs}")
    print(f"[2/6] 원본 피처 수: {len(gdf):,}")

    # CRS가 없으면 웹지도 GeoJSON으로 간주
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")

    # 단순화는 미터 단위 좌표계에서 수행
    print("[3/6] EPSG:5186으로 변환")
    projected = gdf.to_crs("EPSG:5186")

    print(
        f"[4/6] {SIMPLIFY_TOLERANCE_M}m 기준으로 "
        "경계 단순화"
    )
    projected["geometry"] = projected.geometry.simplify(
        tolerance=SIMPLIFY_TOLERANCE_M,
        preserve_topology=True,
    )

    # 깨진 지오메트리 보정
    projected["geometry"] = projected.geometry.make_valid()
    projected = projected[
        projected.geometry.notna()
        & ~projected.geometry.is_empty
    ].copy()

    print("[5/6] EPSG:4326으로 변환")
    result = projected.to_crs("EPSG:4326")

    # 지도에 필요한 속성만 남김
    preferred_columns = [
        "sido_code",
        "sido_name",
        "sigungu_code",
        "sigungu_name",
        "geometry",
    ]
    existing_columns = [
        col for col in preferred_columns
        if col in result.columns
    ]

    if "geometry" not in existing_columns:
        existing_columns.append("geometry")

    result = result[existing_columns]

    print(f"[6/6] 저장: {OUTPUT_PATH}")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    result.to_file(
        OUTPUT_PATH,
        driver="GeoJSON",
        encoding="utf-8",
    )

    with OUTPUT_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        payload = json.load(file)

    size_mb = OUTPUT_PATH.stat().st_size / 1024 / 1024

    print()
    print("생성 완료")
    print(f"- 피처 수: {len(payload.get('features', [])):,}")
    print(f"- 파일 크기: {size_mb:.2f} MB")
    print(f"- 경로: {OUTPUT_PATH.resolve()}")


if __name__ == "__main__":
    main()
