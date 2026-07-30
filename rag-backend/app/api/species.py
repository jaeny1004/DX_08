"""AI 친환경 수종전환 추천 엔드포인트.

재선충병 피해 극심 후보 격자를 활엽수 등 대체 수림대로 전환할 때, 해당 격자의
입지(기후대·산림토양형·토심·향·지형)와 현재 수종구성, 그리고 같은 시군구에서
실제로 자라는 활엽수 분포를 근거로 대체 수종을 추천한다.

핵심: 추천 후보는 임의 생성이 아니라 "같은 지역에서 실제로 우점하는 활엽수"(임상도
근거)에서 뽑고, OpenAI는 이 근거 위에서 적합사유·예산·유의사항을 서술한다.
과장 표현·감염 확정 표현은 사용하지 않는다(프로젝트 용어 원칙).
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.generator import DEFAULT_MODEL

router = APIRouter(prefix="/api/species", tags=["수종전환"])

# 백엔드(서버리스)는 rag-backend/ 안의 파일만 배포되므로 rag-backend/data에서 읽는다.
# 원본은 프로젝트 루트 data/이며, scripts로 이 위치에 복사해 배포한다(chat.py의
# final_ui_candidate와 동일 규칙).
CODE_MAP_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "koftr_species_code_map.json"
)
ENV_PROFILE_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "species_env_profile.json"
)
ELEV_BIN = 200.0
SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉"
# 대체 수종 정량 적합도 가중치 (합=1.0).
# 데이터 기반 도출: 임상도 362,863개 산림격자에서 각 인자(기후대·산림토양형·고도·지역)와
# 실제 수종 분포 간 대칭 불확실성(SU=2·MI/(H(인자)+H(수종)), cardinality 보정)을 계산해
# 정규화한 값. 즉 "각 인자가 실제 수종 분포를 얼마나 설명하는가"에 비례.
SUIT_WEIGHTS = {"climate": 0.26, "soil": 0.14, "elev": 0.23, "regional": 0.37}

_client = None


def _supabase():
    global _client
    if _client is None:
        from supabase import create_client

        _client = create_client(
            os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"]
        )
    return _client


@lru_cache(maxsize=1)
def _species_group() -> dict[str, str]:
    """수종명 -> 그룹(침엽수/활엽수/혼효림/비산림). koftr_species_code_map.json 기반."""
    if not CODE_MAP_PATH.exists():
        return {}
    data = json.loads(CODE_MAP_PATH.read_text(encoding="utf-8"))
    return {d["species_name"]: d["group"] for d in data}


@lru_cache(maxsize=1)
def _env_profile() -> dict[str, Any]:
    """수종별 환경(기후·토양·고도) 분포 프로파일. build_species_env_profile.py 산출물."""
    if not ENV_PROFILE_PATH.exists():
        return {}
    return json.loads(ENV_PROFILE_PATH.read_text(encoding="utf-8"))


def _soil_group(site_label: Any) -> str | None:
    """산림토양형 기호에서 끝 첨자를 제거해 토양군으로 묶는다. 예 B₂→B, DRb₂→DRb."""
    if not site_label:
        return None
    s = str(site_label).strip().rstrip(SUBSCRIPT + "0123456789")
    return s or None


def _score_candidates(
    regional: list[dict[str, Any]],
    site: dict[str, Any],
    elevation: float | None,
) -> list[dict[str, Any]]:
    """후보 활엽수의 정량 적합도 점수 계산(내림차순). 각 매치는 0~1.

    Suit(s) = w_climate·climateMatch + w_soil·soilMatch
              + w_elev·elevMatch + w_regional·regionalAdapt
    - *Match: 수종 s의 전체 분포 면적 중 대상 격자와 같은 환경에 있는 비율.
    - regionalAdapt: 시군구 regional_score를 최댓값으로 정규화.
    """
    profile = _env_profile()
    climate = site.get("climate_zone")
    soil = _soil_group(site.get("forest_soil_type"))
    elev_bin = None
    if elevation is not None:
        try:
            elev_bin = int(float(elevation) // ELEV_BIN * ELEV_BIN)
        except (TypeError, ValueError):
            elev_bin = None
    max_reg = max((d["regional_score"] for d in regional), default=0.0) or 1.0

    scored: list[dict[str, Any]] = []
    for d in regional:
        s = d["species"]
        prof = profile.get(s)
        climate_match = soil_match = elev_match = 0.0
        if prof and prof.get("total_area"):
            tot = float(prof["total_area"])
            if climate:
                climate_match = prof.get("climate", {}).get(climate, 0) / tot
            if soil:
                soil_match = prof.get("soil", {}).get(soil, 0) / tot
            if elev_bin is not None:
                step = int(ELEV_BIN)
                elev_match = sum(
                    prof.get("elev", {}).get(str(elev_bin + off), 0)
                    for off in (-step, 0, step)
                ) / tot
        regional_adapt = d["regional_score"] / max_reg
        suit = (
            SUIT_WEIGHTS["climate"] * climate_match
            + SUIT_WEIGHTS["soil"] * soil_match
            + SUIT_WEIGHTS["elev"] * elev_match
            + SUIT_WEIGHTS["regional"] * regional_adapt
        )
        scored.append(
            {
                "species": s,
                "suit_score": round(suit, 4),
                "breakdown": {
                    "climate_match": round(climate_match, 3),
                    "soil_match": round(soil_match, 3),
                    "elev_match": round(elev_match, 3),
                    "regional_adaptation": round(regional_adapt, 3),
                },
                "regional_score": d["regional_score"],
            }
        )
    scored.sort(key=lambda x: -x["suit_score"])
    return scored


class RecommendRequest(BaseModel):
    grid_id: int


class RecommendResponse(BaseModel):
    grid_id: int
    region: str
    site_summary: dict[str, Any]
    current_composition: dict[str, float]
    regional_broadleaf: list[dict[str, Any]]
    scored_candidates: list[dict[str, Any]]
    weights: dict[str, float]
    recommended_species: list[dict[str, Any]]
    rationale: str
    budget_estimate: str
    notes: str
    is_ai_generated: bool


def _single(rows: list[dict[str, Any]], grid_id: int) -> dict[str, Any]:
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"격자 {grid_id}를 예측 대상 격자에서 찾지 못했습니다.",
        )
    return rows[0]


def _regional_broadleaf(sigungu: str, group: dict[str, str]) -> list[dict[str, Any]]:
    """같은 시군구 격자들의 수종구성에서 활엽수 종을 면적가중 집계해 상위 반환."""
    resp = (
        _supabase()
        .table("prediction_grid_static")
        .select("species_composition")
        .eq("sigungu_name", sigungu)
        .execute()
    )
    weight: dict[str, float] = {}
    grids = 0
    for row in resp.data or []:
        payload = row.get("species_composition")
        if not payload:
            continue
        comp = payload.get("composition") if isinstance(payload, dict) else None
        if not comp:
            continue
        grids += 1
        for name, ratio in comp.items():
            if group.get(name) == "활엽수":
                weight[name] = weight.get(name, 0.0) + float(ratio)
    ranked = sorted(weight.items(), key=lambda x: -x[1])
    return [
        {"species": name, "regional_score": round(score, 2)}
        for name, score in ranked[:12]
    ]


def _ai_narrative(
    region: str,
    site: dict[str, Any],
    composition: dict[str, float],
    top: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """정량 점수로 이미 선정된 상위 수종에 대한 서술(rationale/예산/유의)만 생성.
    순위·수종·점수는 바꾸지 않는다. OPENAI_API_KEY 없거나 실패 시 None."""
    if not os.getenv("OPENAI_API_KEY") or not top:
        return None
    comp_txt = ", ".join(f"{k} {v:.0%}" for k, v in composition.items()) or "정보 없음"
    picks = "; ".join(
        f"{c['species']}(적합도 {round(c['suit_score'] * 100)}점: "
        f"기후 {c['breakdown']['climate_match']:.0%}·토양 {c['breakdown']['soil_match']:.0%}·"
        f"고도 {c['breakdown']['elev_match']:.0%}·지역적응 "
        f"{c['breakdown']['regional_adaptation']:.0%})"
        for c in top
    )
    prompt = (
        "소나무재선충병 피해 극심 후보 격자(500m)의 수종전환 조림 계획 서술을 작성한다. "
        "대체 수종은 정량 적합도 점수로 이미 아래와 같이 선정됐다. "
        "순위나 수종을 바꾸지 말고 주어진 근거로 서술만 작성하라.\n\n"
        f"[지역] {region}\n"
        f"[현재 수종구성] {comp_txt}\n"
        f"[기후대] {site.get('climate_zone') or '정보 없음'} / "
        f"[산림토양형] {site.get('forest_soil_type') or '정보 없음'} / "
        f"[토심] {site.get('soil_depth_class') or '정보 없음'}\n"
        f"[선정된 대체 수종(고정)] {picks}\n\n"
        "요구사항: (1) 선정 근거를 종합한 rationale 2~3문장, "
        "(2) 조림 예산은 개략 추정 범위로만 제시하고 실제 비용은 산림사업 설계가 "
        "필요함을 명시, (3) 과장·감염 확정 표현 금지, '피해 극심 후보·현장 확인 필요' "
        "관점 유지.\n"
        'JSON으로만 답하라: {"rationale": str, "budget_estimate": str, "notes": str}'
    )
    try:
        from openai import OpenAI

        response = OpenAI().chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "너는 산림청 조림 사업계획 초안을 돕는 도우미다. "
                        "제공된 근거만 사용하고 한국어 행정 문체로 간결하게 쓴다."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception:
        return None


@router.post("/recommendation", response_model=RecommendResponse)
def recommend_species(req: RecommendRequest) -> RecommendResponse:
    client = _supabase()
    resp = (
        client.table("prediction_grid_static")
        .select(
            "grid_id,sido_name,sigungu_name,center_pine_ratio,"
            "block_elevation_mean,block_slope_mean,"
            "species_composition,site_conditions"
        )
        .eq("grid_id", req.grid_id)
        .limit(2)
        .execute()
    )
    row = _single(list(resp.data or []), req.grid_id)

    region = " ".join(
        part for part in (row.get("sido_name"), row.get("sigungu_name")) if part
    )
    site = row.get("site_conditions") or {}
    sc_payload = row.get("species_composition") or {}
    composition = (
        sc_payload.get("composition", {}) if isinstance(sc_payload, dict) else {}
    )

    group = _species_group()
    regional = (
        _regional_broadleaf(row.get("sigungu_name"), group)
        if row.get("sigungu_name")
        else []
    )

    # 정량 적합도 점수로 순위 결정(선택·점수는 결정론적·재현 가능)
    scored = _score_candidates(regional, site, row.get("block_elevation_mean"))
    top = scored[:3]

    def _reason(c: dict[str, Any]) -> str:
        b = c["breakdown"]
        return (
            f"종합 적합도 {round(c['suit_score'] * 100)}점 — "
            f"기후 일치 {b['climate_match']:.0%}·토양 일치 {b['soil_match']:.0%}·"
            f"고도 일치 {b['elev_match']:.0%}·지역 적응 {b['regional_adaptation']:.0%}"
        )

    recommended = [
        {
            "species": c["species"],
            "suit_score": c["suit_score"],
            "breakdown": c["breakdown"],
            "reason": _reason(c),
        }
        for c in top
    ]

    # 서술만 OpenAI로 보강(선택·점수 불변), 실패 시 결정론적 폴백
    ai = _ai_narrative(region, site, composition, top)
    if ai:
        rationale = str(ai.get("rationale", "")).strip()
        budget = str(ai.get("budget_estimate", "")).strip()
        notes = str(ai.get("notes", "")).strip()
        is_ai = True
    else:
        top_names = ", ".join(c["species"] for c in top) or "적합 후보 없음"
        rationale = (
            f"{region}의 기후대({site.get('climate_zone') or '정보 없음'})·"
            f"산림토양형({site.get('forest_soil_type') or '정보 없음'})·고도 조건과 "
            f"지역 실제 분포를 종합한 정량 적합도 상위: {top_names}."
        )
        budget = "개략 추정: ha당 약 800만~1,000만원 수준(실제 비용은 산림사업 설계 필요)."
        notes = "이 격자는 피해 극심 후보이며 현장 확인이 필요합니다."
        is_ai = False

    return RecommendResponse(
        grid_id=req.grid_id,
        region=region,
        site_summary=site,
        current_composition=composition,
        regional_broadleaf=regional,
        scored_candidates=scored,
        weights=SUIT_WEIGHTS,
        recommended_species=recommended,
        rationale=rationale,
        budget_estimate=budget,
        notes=notes,
        is_ai_generated=is_ai,
    )
