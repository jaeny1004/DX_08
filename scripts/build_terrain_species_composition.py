# -*- coding: utf-8 -*-
r"""임상도(TB_FGDI_FS_IM5000, EPSG:5179)를 500m 격자(EPSG:5186)에 면적조인하여
격자별 수종구성(species_composition)을 산출한다.

원본 데이터 저장 규칙(CLAUDE.md): 원본 임상도 gdb를 읽어 data/에 경량 산출물 CSV를 생성한다.
- 입력: 임상도 gdb, 격자 CSV(data/terrain_pine_site_features_south_500m.csv), 코드맵(data/koftr_species_code_map.json)
- 출력: data/terrain_species_composition_south_500m.csv

방법:
1) 격자 CSV를 1회 로드(EPSG:5186), 각 셀을 25km 타일에 centroid로 배정(셀당 정확히 1회 처리).
2) 타일별로 임상도를 5179 bbox로 읽어(빠름) 5186으로 재투영, KOFTR_GROU만 사용.
3) overlay(intersection)로 격자 x 임상도 조각 면적 → (grid_id, code)별 면적 합산.
4) 격자별 산림 수종끼리 정규화한 species_composition(JSON) + forest_ratio 산출 후 CSV 저장.

실행(Windows PowerShell):
  .\rag-backend\venv\Scripts\python.exe .\scripts\build_terrain_species_composition.py
  옵션: --max-tiles N (앞 N개 타일만 — 스모크 테스트), --tile-km 25
"""
from __future__ import annotations
import os, sys, csv, json, time, argparse
from collections import defaultdict
import numpy as np
import geopandas as gpd
from shapely import wkt
from shapely.geometry import box
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GDB = r"C:\Users\User\Desktop\산림 데이터셋\TB_FGDI_FS_IM5000\TB_FGDI_FS_IM5000.gdb"
GRID_CSV = os.path.join(ROOT, "data", "terrain_pine_site_features_south_500m.csv")
MAP_JSON = os.path.join(ROOT, "data", "koftr_species_code_map.json")
OUT_CSV = os.path.join(ROOT, "data", "terrain_species_composition_south_500m.csv")
LAYER = "TB_FGDI_FS_IM5000"
CELL_AREA = 250000.0  # 500m x 500m

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def load_grid():
    """격자 CSV -> GeoDataFrame(grid_id, geometry) EPSG:5186."""
    gid, geoms = [], []
    with open(GRID_CSV, encoding="utf-8-sig") as f:
        r = csv.reader(f); next(r)
        for row in r:
            gid.append(int(row[1])); geoms.append(wkt.loads(row[0]))
    g = gpd.GeoDataFrame({"grid_id": gid}, geometry=geoms, crs=5186)
    return g

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-tiles", type=int, default=0, help="앞 N개 타일만 처리(0=전체)")
    ap.add_argument("--tile-km", type=float, default=25.0)
    args = ap.parse_args()

    t0 = time.time()
    code_map = {d["code"]: d for d in json.load(open(MAP_JSON, encoding="utf-8"))}
    name_of = {c: d["species_name"] for c, d in code_map.items()}
    is_forest = {c: d["is_forest"] for c, d in code_map.items()}

    log("격자 로드 중...")
    grid = load_grid()
    grid["cx"] = grid.geometry.centroid.x
    grid["cy"] = grid.geometry.centroid.y
    minx, miny, maxx, maxy = grid.total_bounds
    log(f"격자 {len(grid):,}개 로드. 범위 X[{minx:.0f}..{maxx:.0f}] Y[{miny:.0f}..{maxy:.0f}] ({time.time()-t0:.1f}s)")

    # 타일 배정(centroid 기준 -> 셀당 1회)
    ts = args.tile_km * 1000.0
    grid["tx"] = ((grid["cx"] - minx) // ts).astype(int)
    grid["ty"] = ((grid["cy"] - miny) // ts).astype(int)
    tiles = list(grid.groupby(["tx", "ty"]).groups.keys())
    tiles.sort()
    if args.max_tiles > 0:
        tiles = tiles[:args.max_tiles]
    log(f"타일 {len(tiles)}개 (tile={args.tile_km}km)")

    to5179 = Transformer.from_crs(5186, 5179, always_xy=True)
    area_by = defaultdict(float)  # (grid_id, code) -> area
    n_im_total = 0

    for i, key in enumerate(tiles, 1):
        cells = grid[(grid.tx == key[0]) & (grid.ty == key[1])]
        cminx, cminy, cmaxx, cmaxy = cells.total_bounds
        # 5186 bbox -> 5179 bbox (+1km 마진)
        xs, ys = [], []
        for cx, cy in [(cminx, cminy), (cminx, cmaxy), (cmaxx, cminy), (cmaxx, cmaxy)]:
            x, y = to5179.transform(cx, cy); xs.append(x); ys.append(y)
        bbox5179 = (min(xs)-1000, min(ys)-1000, max(xs)+1000, max(ys)+1000)
        try:
            im = gpd.read_file(GDB, layer=LAYER, bbox=bbox5179, engine="pyogrio",
                               columns=["KOFTR_GROU"])
        except Exception as e:
            log(f"  타일 {i}/{len(tiles)} {key} 읽기 실패: {e}"); continue
        if len(im) == 0:
            continue
        n_im_total += len(im)
        im = im.to_crs(5186)
        im["code"] = im["KOFTR_GROU"].astype(str)
        im["geometry"] = im.geometry.buffer(0)
        im = im[im.geometry.notna() & ~im.geometry.is_empty][["code", "geometry"]]

        inter = gpd.overlay(cells[["grid_id", "geometry"]], im,
                            how="intersection", keep_geom_type=True)
        if len(inter) == 0:
            continue
        inter["a"] = inter.geometry.area
        agg = inter.groupby(["grid_id", "code"])["a"].sum()
        for (gidv, code), a in agg.items():
            area_by[(int(gidv), code)] += float(a)

        if i % 20 == 0 or i == len(tiles):
            log(f"  타일 {i}/{len(tiles)} 처리, 누적 임상도 {n_im_total:,}폴리곤, "
                f"누적 (격자,수종) {len(area_by):,}건 ({time.time()-t0:.0f}s)")

    # 격자별 집계
    log("격자별 수종구성 집계 중...")
    per_grid = defaultdict(dict)  # grid_id -> {code: area}
    for (gidv, code), a in area_by.items():
        per_grid[gidv][code] = a

    rows = []
    for gidv in sorted(per_grid.keys()):
        comp_area = per_grid[gidv]
        forest = {c: a for c, a in comp_area.items() if is_forest.get(c, False)}
        f_area = sum(forest.values())
        total_area = sum(comp_area.values())
        comp = {}
        if f_area > 0:
            for c, a in forest.items():
                comp[name_of.get(c, c)] = round(a / f_area, 4)
        comp = dict(sorted(comp.items(), key=lambda x: -x[1]))
        dom = next(iter(comp), "")
        # 원본 임상도의 국소적 폴리곤 겹침으로 면적이 셀면적을 근소하게 넘는 경우가
        # 있어(전체의 ~0.006%) 비율 지표는 1.0으로 클램프한다. 정규화된 comp 비율은 무관.
        rows.append({
            "id": gidv,
            "forest_ratio": round(min(f_area / CELL_AREA, 1.0), 4),
            "covered_ratio": round(min(total_area / CELL_AREA, 1.0), 4),
            "dominant_species": dom,
            "dominant_ratio": comp.get(dom, 0.0) if dom else 0.0,
            "n_species": len(comp),
            "species_composition": json.dumps(comp, ensure_ascii=False),
        })

    with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "forest_ratio", "covered_ratio",
                                          "dominant_species", "dominant_ratio",
                                          "n_species", "species_composition"])
        w.writeheader(); w.writerows(rows)

    log(f"완료: {OUT_CSV}")
    log(f"  수종구성 산출 격자 {len(rows):,}개 / 전체 격자 {len(grid):,}개")
    log(f"  총 소요 {time.time()-t0:.0f}s, 임상도 누적 {n_im_total:,}폴리곤")

if __name__ == "__main__":
    main()
