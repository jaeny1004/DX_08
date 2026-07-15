import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.generator import answer
from app.core.store import diversify


router = APIRouter()

GRID_FILE = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "final_ui_candidate_v4.geojson"
)


class ChatRequest(BaseModel):
    question: str
    history: list[dict[str, Any]] = Field(default_factory=list)
    grid_context: dict[str, Any] | None = None


class ChatSourceResponse(BaseModel):
    doc_name: str
    page: int


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSourceResponse] = Field(default_factory=list)


@lru_cache(maxsize=1)
def load_grid_index() -> dict[str, dict[str, Any]]:
    if not GRID_FILE.exists():
        raise FileNotFoundError(
            f"격자 데이터 파일을 찾지 못했습니다: {GRID_FILE}"
        )

    with GRID_FILE.open("r", encoding="utf-8") as file:
        geojson = json.load(file)

    features = geojson.get("features", [])
    if not isinstance(features, list):
        raise ValueError("GeoJSON features 형식이 올바르지 않습니다.")

    index: dict[str, dict[str, Any]] = {}

    for feature in features:
        properties = feature.get("properties", {}) or {}
        grid_id = properties.get("grid_id") or properties.get("id")

        if grid_id is not None:
            index[str(grid_id).strip()] = properties

    return index


def extract_grid_id(question: str) -> str | None:
    patterns = [
        r"격자\s*(?:ID|아이디)?\s*[:#-]?\s*(\d{4,})",
        r"GRID[-\s:]?(\d{4,})",
    ]

    for pattern in patterns:
        match = re.search(pattern, question, flags=re.IGNORECASE)
        if match:
            return match.group(1)

    return None


def find_grid_from_question(question: str) -> dict[str, Any] | None:
    grid_id = extract_grid_id(question)
    if not grid_id:
        return None
    return load_grid_index().get(grid_id)


def normalize_grid_context(
    grid_context: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not grid_context:
        return None

    return {
        "grid_id": grid_context.get("grid_id") or grid_context.get("id"),
        "risk_score": grid_context.get("risk_score"),
        "risk_grade": grid_context.get("risk_grade"),
        "risk_stage_label": grid_context.get("risk_stage_label"),
        "field_priority_score_v3": grid_context.get(
            "field_priority_score_v3"
        ),
        "field_priority_grade_v3": grid_context.get(
            "field_priority_grade_v3"
        ),
        "priority_grade_v3": grid_context.get("priority_grade_v3"),
        "priority_stage_label": grid_context.get("priority_stage_label"),
        "pine_ratio": grid_context.get("pine_ratio"),
        "infection_pressure": (
            grid_context.get("infection_pressure")
            if grid_context.get("infection_pressure") is not None
            else grid_context.get("recent_pressure_score")
        ),
        "recent_pressure_score": (
            grid_context.get("recent_pressure_score")
            if grid_context.get("recent_pressure_score") is not None
            else grid_context.get("infection_pressure")
        ),
        "access_score_v3": grid_context.get("access_score_v3"),
        "road_class_near": (
            grid_context.get("road_class_near")
            or grid_context.get("nearest_road_type")
        ),
        "road_dist_m": (
            grid_context.get("road_dist_m")
            if grid_context.get("road_dist_m") is not None
            else grid_context.get("distance_to_nearest_road_m_v3")
        ),
        "river_dist_m": grid_context.get("river_dist_m"),
        "env_flag": (
            grid_context.get("env_flag")
            if grid_context.get("env_flag") is not None
            else grid_context.get("environment_caution_flag_v3")
        ),
        "field_recommended_action_v3": grid_context.get(
            "field_recommended_action_v3"
        ),
    }


def embed_question(embedder: Any, question: str) -> list[float]:
    """
    기존 Embedder 구현의 메서드명이 달라도 동작하도록 지원한다.
    """
    method_names = (
        "embed_query",
        "embed",
        "encode",
        "create_embedding",
        "get_embedding",
    )

    for method_name in method_names:
        method = getattr(embedder, method_name, None)
        if not callable(method):
            continue

        try:
            result = method(question)
        except TypeError:
            try:
                result = method([question])
            except TypeError:
                continue

        if isinstance(result, list):
            if result and isinstance(result[0], list):
                return [float(value) for value in result[0]]
            return [float(value) for value in result]

    raise RuntimeError(
        "Embedder에서 사용할 수 있는 임베딩 메서드를 찾지 못했습니다. "
        "embed_query, embed, encode, create_embedding, get_embedding 중 하나가 필요합니다."
    )


def search_documents(
    request: Request,
    question: str,
    k: int = 8,
) -> list[Any]:
    store = getattr(request.app.state, "store", None)
    embedder = getattr(request.app.state, "embedder", None)

    if store is None or embedder is None:
        initialization_error = getattr(
            request.app.state,
            "initialization_error",
            None,
        )
        raise RuntimeError(
            "RAG 저장소 또는 임베더가 초기화되지 않았습니다."
            + (
                f" 초기화 오류: {initialization_error}"
                if initialization_error
                else ""
            )
        )

    query_embedding = embed_question(embedder, question)

    candidates = store.search(
        query_embedding=query_embedding,
        k=max(k * 3, k),
    )

    return diversify(
        results=candidates,
        k=k,
        per_doc=3,
    )


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    request: Request,
) -> ChatResponse:
    question = payload.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="질문을 입력해 주세요.",
        )

    requested_grid_id = extract_grid_id(question)
    grid_context = normalize_grid_context(payload.grid_context)

    # 질문에 격자 ID가 직접 포함되면 그 격자를 우선 조회한다.
    if requested_grid_id:
        try:
            found_grid = find_grid_from_question(question)
        except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
            raise HTTPException(
                status_code=500,
                detail=str(error),
            ) from error

        if found_grid is None:
            return ChatResponse(
                answer=(
                    f"격자 ID {requested_grid_id}에 해당하는 위험도 분석 결과를 "
                    "찾지 못했습니다. 현재 등록된 분석 대상 격자인지 확인해 주세요."
                ),
                sources=[],
            )

        grid_context = normalize_grid_context(found_grid)

    try:
        search_results = search_documents(
            request=request,
            question=question,
            k=8,
        )
    except Exception as error:
        if grid_context:
            print(
                "[문서 검색 경고] 격자 정보만으로 답변을 생성합니다:",
                repr(error),
            )
            search_results = []
        else:
            raise HTTPException(
                status_code=500,
                detail=f"백서 검색 중 오류가 발생했습니다: {error}",
            ) from error

    try:
        generated = answer(
            question=question,
            history=payload.history,
            search_results=search_results,
            grid_context=grid_context,
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"답변 생성 중 오류가 발생했습니다: {error}",
        ) from error

    return ChatResponse(
        answer=generated.text,
        sources=[
            ChatSourceResponse(
                doc_name=source.doc_name,
                page=int(source.page),
            )
            for source in generated.sources
        ],
    )
