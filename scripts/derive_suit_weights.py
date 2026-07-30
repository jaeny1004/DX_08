# -*- coding: utf-8 -*-
"""수종전환 적합도 공식의 가중치를 데이터에서 도출한다(재현용).

방법: 임상도 격자에서 각 환경/공간 인자(기후대·산림토양형·고도·지역)와 실제
관측 수종(격자 우점종) 사이의 **대칭 불확실성(Symmetric Uncertainty, SU)**을
계산해, 그 비율로 가중치를 정한다.

  SU(X, Y) = 2 * I(X; Y) / (H(X) + H(Y))          # 0~1, cardinality 편향 보정
  weight_k = SU_k / Σ SU                           # 정규화(합=1)

즉 "각 인자가 실제 수종 분포를 얼마나 설명하는가"에 비례해 가중치를 준다.
상호정보량(MI) 대신 SU를 쓰는 이유: 지역(시군구/공간블록)처럼 범주 수가 많은
인자가 MI를 기계적으로 크게 만드는 편향을 H(X)로 나눠 보정하기 위함.

입력: data/terrain_species_composition_south_500m.csv(격자 우점종),
      data/terrain_pine_site_features_south_500m.csv(기후·토양·고도·좌표)
출력: 콘솔에 SU와 정규화 가중치. species.py의 SUIT_WEIGHTS에 반영.

실행: .\rag-backend\venv\Scripts\python.exe .\scripts\derive_suit_weights.py
"""
from __future__ import annotations

import csv
import math
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.path.join(ROOT, "data", "terrain_species_composition_south_500m.csv")
TE = os.path.join(ROOT, "data", "terrain_pine_site_features_south_500m.csv")

CLIMATE = {"1": "온대북부", "2": "온대중부", "3": "온대남부", "4": "난대"}
SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉0123456789"
ELEV_BIN = 200.0
REGION_BLOCK_M = 20000.0  # 지역 인자용 공간 블록 크기(20km)
WKT_RE = re.compile(r"POLYGON\s*\(\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)")


def _norm(v):
    v = str(v).strip() if v is not None else ""
    return None if (not v or v.upper() == "UNKNOWN") else v


def _soil_group(s):
    s = (s or "").strip().rstrip(SUBSCRIPT)
    return s or None


def symmetric_uncertainty(pairs: list[tuple[str, str]]) -> float:
    n = len(pairs)
    if n == 0:
        return 0.0
    cx = Counter(x for x, _ in pairs)
    cy = Counter(y for _, y in pairs)
    cxy = Counter(pairs)
    hx = -sum((v / n) * math.log(v / n) for v in cx.values())
    hy = -sum((v / n) * math.log(v / n) for v in cy.values())
    mi = sum(
        (v / n) * math.log((v / n) / ((cx[x] / n) * (cy[y] / n)))
        for (x, y), v in cxy.items()
    )
    return 2 * mi / (hx + hy) if (hx + hy) > 0 else 0.0


def main() -> None:
    dom: dict[int, str] = {}
    with open(SP, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            d = r["dominant_species"].strip()
            if d:
                dom[int(r["id"])] = d

    rows: list[tuple] = []
    with open(TE, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            gid = int(r["id"])
            if gid not in dom:
                continue
            cz = _norm(r.get("climate_zone_mode"))
            soil = _soil_group(_norm(r.get("site_label_mode")))
            ev = r.get("elev_mean")
            try:
                eb = str(int(float(ev) // ELEV_BIN * ELEV_BIN)) if ev not in (None, "") else None
            except ValueError:
                eb = None
            m = WKT_RE.search(r.get("WKT", ""))
            rb = None
            if m:
                x = float(m.group(1)); y = float(m.group(2))
                rb = f"{int(x // REGION_BLOCK_M)}_{int(y // REGION_BLOCK_M)}"
            rows.append((
                dom[gid],
                CLIMATE.get(cz) if cz else None,
                soil, eb, rb,
            ))

    print(f"분석 산림격자: {len(rows):,}개")
    factors = [("climate", 1), ("soil", 2), ("elev", 3), ("regional", 4)]
    su = {}
    for key, idx in factors:
        pairs = [(r[idx], r[0]) for r in rows if r[idx] is not None]
        su[key] = symmetric_uncertainty(pairs)
    total = sum(su.values())
    weights = {k: v / total for k, v in su.items()}
    rounded = {k: round(v, 2) for k, v in weights.items()}
    diff = round(1 - sum(rounded.values()), 2)
    big = max(rounded, key=rounded.get)
    rounded[big] = round(rounded[big] + diff, 2)

    print("\n인자      SU        정규화 가중치")
    for key, _ in factors:
        print(f"  {key:9} {su[key]:.4f}   {weights[key]:.3f}")
    print(f"\nSUIT_WEIGHTS = {rounded}")


if __name__ == "__main__":
    main()
