# -*- coding: utf-8 -*-
"""위경도 -> 행정동·격자ID 역조회용 경량 룩업 테이블을 만든다.

확진목·사진·음성일지 등에는 위경도만 있고 행정동/격자ID가 없다.
화면에 좌표 대신 "행정동 + 격자ID"를 보여주기 위해, 격자 중심점만 뽑아
가장 가까운 격자를 찾을 수 있는 작은 파일을 만든다.

원본(54MB)을 그대로 프론트에서 읽을 수 없으므로 중심점만 남긴다.
좌표는 소수점 5자리(약 1m)로 반올림하고, 컬럼별 배열로 저장해 용량을 줄인다.

출력: public/data/grid_lookup.json
실행: ..\\DX_08\\rag-backend\\venv\\Scripts\\python.exe .\\scripts\\build_grid_lookup.py
"""
from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "data", "final_ui_candidate_v4.geojson")
OUT = os.path.join(ROOT, "public", "data", "grid_lookup.json")


def ring_center(coords):
    """폴리곤 첫 링의 좌표 평균. 500m 격자라 무게중심까지 갈 필요가 없다."""
    ring = coords[0]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def main() -> None:
    print(f"[1/3] 격자 읽는 중: {SRC}")
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)
    feats = data["features"]
    print(f"      {len(feats):,}개")

    print("[2/3] 중심점 추출")
    ids, lats, lngs, emds = [], [], [], []
    emd_names: list[str] = []
    emd_index: dict[str, int] = {}

    for feature in feats:
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates")
        if not coords:
            continue
        if geom.get("type") == "MultiPolygon":
            coords = coords[0]
        lng, lat = ring_center(coords)

        props = feature.get("properties") or {}
        name = str(props.get("emd_name") or "")
        slot = emd_index.get(name)
        if slot is None:
            slot = len(emd_names)
            emd_index[name] = slot
            emd_names.append(name)

        ids.append(int(props.get("id")))
        lats.append(round(lat, 5))
        lngs.append(round(lng, 5))
        emds.append(slot)

    print(f"      격자 {len(ids):,}개 / 행정동 {len(emd_names):,}개")

    print(f"[3/3] 저장: {OUT}")
    payload = {
        # 컬럼 지향 배열 — 객체 배열보다 훨씬 작다.
        "ids": ids,
        "lats": lats,
        "lngs": lngs,
        # emds[i]는 emdNames의 인덱스(같은 행정동 이름을 반복 저장하지 않기 위함)
        "emds": emds,
        "emdNames": emd_names,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(OUT) / 1024 / 1024
    print()
    print("생성 완료")
    print(f"- 격자 {len(ids):,}개")
    print(f"- 파일 크기: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
