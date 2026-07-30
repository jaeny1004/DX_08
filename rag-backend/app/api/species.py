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


class RecommendRequest(BaseModel):
    grid_id: int


class RecommendResponse(BaseModel):
    grid_id: int
    region: str
    site_summary: dict[str, Any]
    current_composition: dict[str, float]
    regional_broadleaf: list[dict[str, Any]]
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
        for name, score in ranked[:6]
    ]


def _build_prompt(
    region: str,
    site: dict[str, Any],
    composition: dict[str, float],
    elevation: float | None,
    slope: float | None,
    pine_ratio: float | None,
    regional: list[dict[str, Any]],
) -> str:
    comp_txt = ", ".join(f"{k} {v:.0%}" for k, v in composition.items()) or "정보 없음"
    reg_txt = ", ".join(d["species"] for d in regional) or "정보 없음"
    return (
        "다음은 소나무재선충병 피해 극심 후보 격자(500m)의 입지·임상 근거다. "
        "이 격자를 활엽수 등 대체 수림대로 전환하는 조림 계획을 세운다고 가정하고, "
        "제공된 근거만 사용해 대체 수종을 추천하라.\n\n"
        f"[지역] {region}\n"
        f"[현재 수종구성] {comp_txt}\n"
        f"[기후대] {site.get('climate_zone') or '정보 없음'}\n"
        f"[산림토양형] {site.get('forest_soil_type') or '정보 없음'}\n"
        f"[토심] {site.get('soil_depth_class') or '정보 없음'}\n"
        f"[평균 향(도)] {site.get('aspect_deg') if site.get('aspect_deg') is not None else '정보 없음'}\n"
        f"[평균 고도(m)] {round(elevation, 1) if elevation is not None else '정보 없음'}\n"
        f"[평균 경사(도)] {round(slope, 1) if slope is not None else '정보 없음'}\n"
        f"[소나무 비율] {f'{pine_ratio:.0%}' if pine_ratio is not None else '정보 없음'}\n"
        f"[같은 시군구에서 실제 우점하는 활엽수(검증된 적합 후보)] {reg_txt}\n\n"
        "요구사항:\n"
        "1. 위 '지역 실제 우점 활엽수' 중에서 이 입지(기후대·산림토양형·토심)에 "
        "적합한 대체 수종 2~3종을 고른다. 목록에 없는 수종을 새로 만들지 말 것.\n"
        "2. 각 수종마다 기후대·토양을 근거로 한 적합 사유를 1~2문장으로 쓴다.\n"
        "3. 조림 예산은 정확한 값이 아니라 개략 추정 범위로만 제시하고 "
        "실제 비용은 산림사업 설계가 필요함을 명시한다.\n"
        "4. 과장 표현이나 감염 확정 표현을 쓰지 않는다. 이 격자는 '피해 극심 후보'이며 "
        "현장 확인이 필요하다는 관점을 유지한다.\n"
        "JSON으로만 답하라. 형식: "
        '{"recommended_species": [{"species": str, "reason": str}], '
        '"rationale": str, "budget_estimate": str, "notes": str}'
    )


def _ai_recommend(prompt: str) -> dict[str, Any] | None:
    if not os.getenv("OPENAI_API_KEY"):
        return None
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
        content = response.choices[0].message.content or "{}"
        return json.loads(content)
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

    prompt = _build_prompt(
        region=region,
        site=site,
        composition=composition,
        elevation=row.get("block_elevation_mean"),
        slope=row.get("block_slope_mean"),
        pine_ratio=row.get("center_pine_ratio"),
        regional=regional,
    )

    ai = _ai_recommend(prompt)
    if ai and ai.get("recommended_species"):
        recommended = ai.get("recommended_species", [])
        rationale = str(ai.get("rationale", "")).strip()
        budget = str(ai.get("budget_estimate", "")).strip()
        notes = str(ai.get("notes", "")).strip()
        is_ai = True
    else:
        # OpenAI 미사용/실패 시: 지역 실제 우점 활엽수 상위를 근거 기반으로 그대로 제시
        recommended = [
            {
                "species": d["species"],
                "reason": (
                    f"같은 시군구에서 실제로 우점하는 활엽수로, 해당 입지에서 "
                    f"활착·생장이 확인된 수종입니다."
                ),
            }
            for d in regional[:3]
        ]
        rationale = (
            f"{region}의 기후대({site.get('climate_zone') or '정보 없음'})·"
            f"산림토양형({site.get('forest_soil_type') or '정보 없음'}) 조건에서 "
            "실제 우점 활엽수를 대체 수종 후보로 제시합니다."
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
        recommended_species=recommended,
        rationale=rationale,
        budget_estimate=budget,
        notes=notes,
        is_ai_generated=is_ai,
    )
