from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import geopandas as gpd


INPUT_GEOJSON = Path(
    r"C:\Users\User\Desktop\산림 데이터셋\DX_08"
    r"\public\data\simulation_all_grids_v4.geojson"
)

OUTPUT_DIR = Path(
    r"C:\Users\User\Desktop\산림 데이터셋\DX_08"
    r"\public\data\simulation_tiles"
)

MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

# 1도 단위 공간 타일
# 약 500m 격자를 전국에서 한 번에 불러오지 않고 현재 지도 범위에 해당하는 파일만 불러오기 위한 기준
TILE_SIZE_DEG = 1.0


def tile_index(value: float) -> int:
    return math.floor(value / TILE_SIZE_DEG)


def tile_name(x_index: int, y_index: int) -> str:
    return f"tile_{x_index}_{y_index}.geojson"


def main() -> None:
    if not INPUT_GEOJSON.exists():
        raise FileNotFoundError(
            f"입력 GeoJSON을 찾지 못했습니다: {INPUT_GEOJSON}"
        )

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("입력:", INPUT_GEOJSON)
    print("출력:", OUTPUT_DIR)
    print("=" * 80)

    print("\n[1/4] 전체 GeoJSON 읽는 중...")
    gdf = gpd.read_file(
        INPUT_GEOJSON,
        engine="pyogrio",
    )

    if gdf.crs is None:
        raise ValueError("입력 GeoJSON에 좌표계가 없습니다.")

    if gdf.crs.to_epsg() != 4326:
        print(f"현재 좌표계 {gdf.crs} → EPSG:4326 변환")
        gdf = gdf.to_crs("EPSG:4326")

    print(f"전체 격자 수: {len(gdf):,}")

    print("[2/4] 공간 타일 번호 계산 중...")
    centroids = gdf.geometry.centroid

    gdf["_tile_x"] = centroids.x.map(tile_index)
    gdf["_tile_y"] = centroids.y.map(tile_index)

    grouped = gdf.groupby(
        ["_tile_x", "_tile_y"],
        sort=True,
    )

    manifest_tiles = []

    print(f"[3/4] {len(grouped):,}개 타일 파일 저장 중...")

    for index, ((tile_x, tile_y), tile_gdf) in enumerate(grouped, start=1):
        filename = tile_name(
            int(tile_x),
            int(tile_y),
        )

        output_path = OUTPUT_DIR / filename

        tile_gdf = tile_gdf.drop(
            columns=["_tile_x", "_tile_y"],
        ).copy()

        tile_gdf.to_file(
            output_path,
            driver="GeoJSON",
            encoding="utf-8",
            engine="pyogrio",
        )

        min_lng = tile_x * TILE_SIZE_DEG
        min_lat = tile_y * TILE_SIZE_DEG
        max_lng = min_lng + TILE_SIZE_DEG
        max_lat = min_lat + TILE_SIZE_DEG

        manifest_tiles.append(
            {
                "file": filename,
                "count": int(len(tile_gdf)),
                "bounds": [
                    float(min_lng),
                    float(min_lat),
                    float(max_lng),
                    float(max_lat),
                ],
            }
        )

        file_size_mb = output_path.stat().st_size / 1024 / 1024

        print(
            f"[{index:02d}/{len(grouped):02d}] "
            f"{filename} | "
            f"{len(tile_gdf):,}개 | "
            f"{file_size_mb:.1f}MB"
        )

    manifest = {
        "version": 1,
        "crs": "EPSG:4326",
        "tileSizeDegrees": TILE_SIZE_DEG,
        "totalFeatureCount": int(len(gdf)),
        "tileCount": int(len(manifest_tiles)),
        "tiles": manifest_tiles,
    }

    print("[4/4] manifest.json 저장 중...")

    MANIFEST_PATH.write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    total_size_mb = sum(
        path.stat().st_size
        for path in OUTPUT_DIR.glob("*.geojson")
    ) / 1024 / 1024

    print("\n" + "=" * 80)
    print("공간 타일 분할 완료")
    print("=" * 80)
    print("타일 개수:", len(manifest_tiles))
    print("전체 격자 수:", f"{len(gdf):,}")
    print("타일 총용량:", f"{total_size_mb:.1f}MB")
    print("매니페스트:", MANIFEST_PATH)
    print("\n다음 단계에서는 지도 현재 범위와 겹치는 타일만 불러옵니다.")


if __name__ == "__main__":
    main()
