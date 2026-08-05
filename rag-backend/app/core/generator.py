import os
from typing import Any

from openai import OpenAI

from app.core.models import Answer, SearchResult, Source

DEFAULT_MODEL = os.environ.get(
    "OPENAI_CHAT_MODEL",
    "gpt-4o-mini",
)

NO_ANSWER_MESSAGE = (
    "등록된 문서에서 질문에 직접 답할 수 있는 충분한 근거를 확인하지 못했습니다. "
    "질문의 대상, 업무, 지역 또는 기간을 조금 더 구체적으로 입력해 주세요."
)

SYSTEM_PROMPT = """
당신은 소나무재선충병 예찰·방제 업무를 지원하는 근거 기반 AI입니다.

제공될 수 있는 정보는 두 종류입니다.
1. 지도 또는 GeoJSON에서 조회한 500m 격자 분석값
2. 백서·방제지침·연구자료에서 검색한 문서 근거

반드시 다음 원칙을 지키세요.
1. 특정 격자 질문은 [격자 분석정보]를 우선 설명합니다.
2. 격자 ID를 문서에서 찾으려 하지 않습니다.
3. 위험도는 감염 확정값이 아니라 신규 발생 가능성 예측값입니다.
4. 위험도와 예찰 우선순위는 별도 지표로 구분합니다.
5. 수치형 정보는 제공된 격자 값만 사용하고 임의로 만들지 않습니다.
6. 조치와 행정 기준은 문서 근거가 있을 때만 연결합니다.
7. 감염 확정, 방제 확정 대신 후보지역·우선 검토·현장 확인 필요라고 표현합니다.
8. 답변은 한국어로 간결하고 실무적으로 작성합니다.
9. 문서명과 페이지는 시스템이 별도로 표시하므로 임의 출처를 만들지 않습니다.
""".strip()


def _unique_sources(
    search_results: list[SearchResult],
) -> list[Source]:
    seen: set[tuple[str, int]] = set()
    sources: list[Source] = []

    for item in search_results:
        key = (
            item.chunk.doc_name,
            int(item.chunk.page),
        )

        if key in seen:
            continue

        seen.add(key)
        sources.append(
            Source(
                doc_name=key[0],
                page=key[1],
            )
        )

    return sources


def _first_value(
    data: dict[str, Any],
    *keys: str,
) -> Any:
    for key in keys:
        value = data.get(key)
        if value is not None and value != "":
            return value
    return None


def _format_number(
    value: Any,
    digits: int = 1,
) -> str:
    if value is None or value == "":
        return "확인되지 않음"

    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)

    if number.is_integer():
        return str(int(number))

    return f"{number:.{digits}f}"


def _format_percent(value: Any) -> str:
    if value is None or value == "":
        return "확인되지 않음"

    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)

    if 0 <= number <= 1:
        number *= 100

    return f"{number:.1f}%"


def build_grid_context_text(
    grid_context: dict[str, Any] | None,
) -> str:
    if not grid_context:
        return "현재 선택되거나 질문에서 조회된 격자가 없습니다."

    grid_id = _first_value(
        grid_context,
        "grid_id",
        "id",
    )

    risk_grade = _first_value(
        grid_context,
        "risk_stage_label",
        "risk_grade",
    )

    priority_grade = _first_value(
        grid_context,
        "priority_stage_label",
        "field_priority_grade_v3",
        "priority_grade_v3",
    )

    infection_pressure = _first_value(
        grid_context,
        "infection_pressure",
        "recent_pressure_score",
    )

    road_type = _first_value(
        grid_context,
        "road_class_near",
        "nearest_road_type",
    )

    road_distance = _first_value(
        grid_context,
        "road_dist_m",
        "distance_to_nearest_road_m_v3",
    )

    env_flag = _first_value(
        grid_context,
        "env_flag",
        "environment_caution_flag_v3",
    )

    if env_flag is None:
        env_text = "확인되지 않음"
    else:
        try:
            env_text = (
                "주의 필요"
                if int(float(env_flag)) == 1
                else "별도 주의 표시 없음"
            )
        except (TypeError, ValueError):
            env_text = str(env_flag)

    lines = [
        f"- 격자 ID: {_format_number(grid_id, 0)}",
        (
            "- AI 위험도: "
            f"{_format_number(grid_context.get('risk_score'))}점"
            f" / 등급: {risk_grade or '확인되지 않음'}"
        ),
        (
            "- 예찰 우선순위: "
            f"{_format_number(grid_context.get('field_priority_score_v3'))}점"
            f" / 등급: {priority_grade or '확인되지 않음'}"
        ),
        (
            "- 소나무류 비율: "
            f"{_format_percent(grid_context.get('pine_ratio'))}"
        ),
        (
            "- 최근 감염압력: "
            f"{_format_number(infection_pressure)}"
        ),
        (
            "- 접근성 점수: "
            f"{_format_number(grid_context.get('access_score_v3'))}"
        ),
        f"- 인접 도로 유형: {road_type or '확인되지 않음'}",
        f"- 도로까지 거리: {_format_number(road_distance)}m",
        (
            "- 하천까지 거리: "
            f"{_format_number(grid_context.get('river_dist_m'))}m"
        ),
        f"- 환경주의 여부: {env_text}",
    ]

    recommended_action = grid_context.get(
        "field_recommended_action_v3"
    )
    if recommended_action:
        lines.append(
            f"- 기존 권장 조치: {recommended_action}"
        )

    return "\n".join(lines)


def _build_document_context(
    top_results: list[SearchResult],
) -> str:
    if not top_results:
        return "관련 문서 근거가 검색되지 않았습니다."

    blocks: list[str] = []

    for index, item in enumerate(
        top_results,
        start=1,
    ):
        blocks.append(
            "\n".join(
                [
                    (
                        f"[근거 {index} | "
                        f"{item.chunk.doc_name} | "
                        f"p.{item.chunk.page}]"
                    ),
                    item.chunk.text.strip(),
                ]
            )
        )

    return "\n\n".join(blocks)


def answer(
    question: str,
    history: list[dict],
    search_results: list[SearchResult],
    grid_context: dict[str, Any] | None = None,
    client: OpenAI | None = None,
    k_context: int = 8,
) -> Answer:
    top_results = [
        item
        for item in search_results[:k_context]
        if item.chunk.text and item.chunk.text.strip()
    ]

    if not top_results and not grid_context:
        return Answer(
            text=NO_ANSWER_MESSAGE,
            sources=[],
        )

    grid_text = build_grid_context_text(grid_context)
    document_text = _build_document_context(top_results)

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        }
    ]

    for message in history[-6:]:
        role = message.get("role")
        content = str(
            message.get("content", "")
        ).strip()

        if role in {"user", "assistant"} and content:
            messages.append(
                {
                    "role": role,
                    "content": content,
                }
            )

    messages.append(
        {
            "role": "user",
            "content": (
                f"[사용자 질문]\n{question}\n\n"
                f"[격자 분석정보]\n{grid_text}\n\n"
                f"[문서 근거]\n{document_text}\n\n"
                "답변 순서:\n"
                "1. 특정 격자가 있으면 격자 ID와 위험도부터 설명합니다.\n"
                "2. 위험도와 예찰 우선순위를 구분합니다.\n"
                "3. 제공된 소나무 비율, 감염압력, 접근성 등을 해석합니다.\n"
                "4. 문서 근거가 있으면 현장 확인 또는 조치 방향을 연결합니다.\n"
                "5. AI 예측은 감염 확정이 아니며 현장 확인이 필요하다고 안내합니다."
            ),
        }
    )

    openai_client = client or OpenAI()

    response = openai_client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=messages,
        temperature=0.1,
    )

    answer_text = response.choices[0].message.content

    if not answer_text or not answer_text.strip():
        answer_text = (
            "격자 분석정보와 문서 근거를 확인했지만 "
            "답변을 생성하지 못했습니다."
        )

    return Answer(
        text=answer_text.strip(),
        sources=_unique_sources(top_results),
    )


def generate_answer(
    question: str,
    contexts: list[dict],
    history: list[dict] | None = None,
    grid_context: dict[str, Any] | None = None,
) -> str:
    context_text = "\n\n".join(
        (
            f"[근거 {index}: "
            f"{item.get('doc_name', '문서')}, "
            f"{item.get('page', 0)}쪽]\n"
            f"{str(item.get('text', '')).strip()}"
        )
        for index, item in enumerate(
            contexts,
            start=1,
        )
        if str(item.get("text", "")).strip()
    )

    if not context_text:
        context_text = "관련 문서 근거가 검색되지 않았습니다."

    if not grid_context and context_text.startswith("관련 문서 근거가"):
        return NO_ANSWER_MESSAGE

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        }
    ]

    for message in (history or [])[-6:]:
        role = message.get("role")
        content = str(
            message.get("content", "")
        ).strip()

        if role in {"user", "assistant"} and content:
            messages.append(
                {
                    "role": role,
                    "content": content,
                }
            )

    messages.append(
        {
            "role": "user",
            "content": (
                f"[사용자 질문]\n{question}\n\n"
                f"[격자 분석정보]\n"
                f"{build_grid_context_text(grid_context)}\n\n"
                f"[문서 근거]\n{context_text}\n\n"
                "제공된 격자 분석정보와 문서 근거만 사용해 답하세요."
            ),
        }
    )

    response = OpenAI().chat.completions.create(
        model=DEFAULT_MODEL,
        messages=messages,
        temperature=0.1,
    )

    return (
        response.choices[0].message.content
        or NO_ANSWER_MESSAGE
    )
