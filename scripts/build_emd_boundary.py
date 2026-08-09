# -*- coding: utf-8 -*-
"""행정동(읍면동) 경계를 웹지도용 경량 GeoJSON으로 변환한다.

원본: 통계청 행정동 경계 shapefile(BND_ADM_DONG_PG)
  - 좌표계 EPSG:5186(중부원점 2010), 인코딩 CP949, 전국 3,559개
  - ADM_CD(8자리)가 격자 geojson의 emd_code와 동일 체계라 그대로 조인된다.

격자에 실제로 등장하는 읍면동만 남겨 용량을 줄이고,
시군구 경계와 동일한 방식(EPSG:5186에서 simplify)으로 단순화한다.

출력: DX_08-dev/public/data/emd_boundary.geojson
실행: .\\rag-backend\\venv\\Scripts\\python.exe .\\scripts\\build_emd_boundary.py
"""
from __future__ import annotations

import json
import os

import geopandas as gpd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_ROOT = os.path.dirname(ROOT)

SHP = os.path.join(
    DATASET_ROOT, "BND_ADM_DONG_PG", "BND_ADM_DONG_PG.shp"
)
# 격자에 존재하는 읍면동만 남기기 위한 기준 파일
GRID_GEOJSON = os.path.join(
    DATASET_ROOT, "DX_08-dev", "public", "data", "final_ui_candidate_v4.geojson"
)
OUT = os.path.join(
    DATASET_ROOT, "DX_08-dev", "public", "data", "emd_boundary.geojson"
)

# 시군구 경계(simplify_sigungu_boundary.py)와 동일 강도
SIMPLIFY_TOLERANCE_M = 150


def main() -> None:
    print(f"[1/6] 격자에서 사용 중인 읍면동 코드 수집: {GRID_GEOJSON}")
    with open(GRID_GEOJSON, encoding="utf-8") as f:
        grid = json.load(f)
    used = set()
    for feature in grid["features"]:
        code = feature["properties"].get("emd_code")
        if code:
            used.add(str(code).strip())
    print(f"      격자 {len(grid['features']):,}개 / 읍면동 {len(used):,}개")

    print(f"[2/6] 행정동 경계 읽는 중(CP949): {SHP}")
    gdf = gpd.read_file(SHP, encoding="cp949")
    print(f"      원본 {len(gdf):,}개 / CRS {gdf.crs}")

    gdf["ADM_CD"] = gdf["ADM_CD"].astype(str).str.strip()

    print("[3/6] 격자에 존재하는 읍면동만 필터링")
    filtered = gdf[gdf["ADM_CD"].isin(used)].copy()
    missing = used - set(filtered["ADM_CD"])
    print(f"      남은 경계 {len(filtered):,}개")
    if missing:
        print(f"      ⚠️ 경계를 못 찾은 코드 {len(missing)}개: {sorted(missing)[:10]}")

    print(f"[4/6] {SIMPLIFY_TOLERANCE_M}m 기준 단순화 (EPSG:5186에서 수행)")
    filtered["geometry"] = filtered.geometry.simplify(
        tolerance=SIMPLIFY_TOLERANCE_M, preserve_topology=True
    )
    filtered["geometry"] = filtered.geometry.make_valid()
    filtered = filtered[
        filtered.geometry.notna() & ~filtered.geometry.is_empty
    ].copy()

    print("[5/6] EPSG:4326으로 변환")
    result = filtered.to_crs("EPSG:4326")

    # 프론트가 쓰는 이름으로 맞춘다(격자 속성과 동일한 키).
    result = result.rename(columns={"ADM_CD": "emd_code", "ADM_NM": "emd_name"})
    result = result[["emd_code", "emd_name", "geometry"]]

    print(f"[6/6] 저장: {OUT}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    result.to_file(OUT, driver="GeoJSON", encoding="utf-8")

    size_mb = os.path.getsize(OUT) / 1024 / 1024
    print()
    print("생성 완료")
    print(f"- 피처 수: {len(result):,}")
    print(f"- 파일 크기: {size_mb:.2f} MB")
    print(f"- 경로: {OUT}")


if __name__ == "__main__":
    main()
