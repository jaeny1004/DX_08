# -*- coding: utf-8 -*-
r"""수종별 환경(기후대·산림토양형·토심·고도) 선호 프로파일을 데이터에서 도출한다.

수종전환 추천의 "정량 적합도 점수"용 근거 테이블. 외부 생태 자료를 추측하지 않고,
임상도에서 산출한 격자 수종구성(terrain_species_composition_south_500m.csv)과
지형·입지(terrain_pine_site_features_south_500m.csv)를 격자 id로 조인해,
각 수종이 "실제로 어떤 기후대·토양형·고도에 분포하는지"를 면적 가중으로 집계한다.

즉 SDM-lite(species distribution) 근거: "이 수종은 실제로 이런 환경에서 자란다".

입력: data/terrain_species_composition_south_500m.csv, data/terrain_pine_site_features_south_500m.csv
출력: data/species_env_profile.json  (+ 백엔드용 rag-backend/data/에도 복사)

각 수종 s에 대해:
  area_g(s) = comp_g(s) * forest_ratio_g * 250,000   (격자 g에서 s의 산림 면적[㎡])
  profile[s] = {
    "total_area": Σ area,
    "climate": {기후대명: 면적},        # 온대북부/중부/남부/난대
    "soil":    {산림토양형그룹: 면적},   # B, DR, DRb, GrB, Va ...(끝 첨자 제거)
    "depth":   {토심등급: 면적},         # 얕음/보통/깊음
    "elev":    {고도bin(200m): 면적},    # "0","200","400",...
  }

실행: .\rag-backend\venv\Scripts\python.exe .\scripts\build_species_env_profile.py
"""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECIES_CSV = os.path.join(ROOT, "data", "terrain_species_composition_south_500m.csv")
TERRAIN_CSV = os.path.join(ROOT, "data", "terrain_pine_site_features_south_500m.csv")
OUT_JSON = os.path.join(ROOT, "data", "species_env_profile.json")
OUT_JSON_BACKEND = os.path.join(ROOT, "rag-backend", "data", "species_env_profile.json")
CELL_AREA = 250000.0
ELEV_BIN = 200.0

CLIMATE = {"1": "온대북부", "2": "온대중부", "3": "온대남부", "4": "난대"}
DEPTH = {"10": "얕음", "20": "보통", "30": "깊음"}
SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉"


def norm(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.upper() == "UNKNOWN":
        return None
    return s


def soil_group(site_label: str | None) -> str | None:
    """산림토양형 기호에서 끝 첨자(₁₂/12)를 제거해 토양군으로 묶는다. 예 B₂→B, DRb₂→DRb."""
    s = norm(site_label)
    if not s:
        return None
    s = s.rstrip(SUBSCRIPT + "0123456789")
    return s or None


def main() -> None:
    print("[1/4] 지형·입지 CSV 로딩")
    terr = pd.read_csv(
        TERRAIN_CSV,
        usecols=["id", "elev_mean", "climate_zone_mode", "soil_depth_mode", "site_label_mode"],
        low_memory=False,
    )
    terr["id"] = terr["id"].astype("int64")
    terr = terr.set_index("id")

    print("[2/4] 수종구성 CSV 로딩")
    sp = pd.read_csv(
        SPECIES_CSV,
        usecols=["id", "forest_ratio", "species_composition"],
        low_memory=False,
    )
    sp["id"] = sp["id"].astype("int64")

    print("[3/4] 격자 조인 + 수종별 환경 면적 집계")
    profile: dict[str, dict] = defaultdict(
        lambda: {
            "total_area": 0.0,
            "climate": defaultdict(float),
            "soil": defaultdict(float),
            "depth": defaultdict(float),
            "elev": defaultdict(float),
        }
    )
    n = 0
    for row in sp.itertuples(index=False):
        gid = int(row.id)
        if gid not in terr.index:
            continue
        comp = json.loads(row.species_composition)
        if not comp:
            continue
        fr = float(row.forest_ratio) if not pd.isna(row.forest_ratio) else 0.0
        forest_area = fr * CELL_AREA
        if forest_area <= 0:
            continue

        t = terr.loc[gid]
        czone = CLIMATE.get(norm(t.climate_zone_mode)) if norm(t.climate_zone_mode) else None
        sgroup = soil_group(t.site_label_mode)
        depth = DEPTH.get(norm(t.soil_depth_mode)) if norm(t.soil_depth_mode) else None
        elev = None if pd.isna(t.elev_mean) else str(int(float(t.elev_mean) // ELEV_BIN * ELEV_BIN))

        for name, ratio in comp.items():
            area = float(ratio) * forest_area
            p = profile[name]
            p["total_area"] += area
            if czone:
                p["climate"][czone] += area
            if sgroup:
                p["soil"][sgroup] += area
            if depth:
                p["depth"][depth] += area
            if elev is not None:
                p["elev"][elev] += area
        n += 1

    print(f"      집계 격자 {n:,}개, 수종 {len(profile)}종")

    print("[4/4] JSON 저장")
    out = {}
    for name, p in profile.items():
        out[name] = {
            "total_area": round(p["total_area"]),
            "climate": {k: round(v) for k, v in p["climate"].items()},
            "soil": {k: round(v) for k, v in p["soil"].items()},
            "depth": {k: round(v) for k, v in p["depth"].items()},
            "elev": {k: round(v) for k, v in p["elev"].items()},
        }
    for path in (OUT_JSON, OUT_JSON_BACKEND):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print("      wrote", path)


if __name__ == "__main__":
    main()
