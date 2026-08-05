from __future__ import annotations

from typing import Any


def read_single_grid_id(
    draft: dict[str, Any],
) -> int:
    values = [
        str(value).strip()
        for value in draft.get("center_grid_ids", [])
        if str(value).strip()
    ]

    if len(values) != 1:
        raise ValueError(
            "행정양식 적용은 중심 격자 ID 1개만 지원합니다."
        )

    try:
        return int(values[0])
    except ValueError as exc:
        raise ValueError(
            f"중심 격자 ID가 숫자가 아닙니다: {values[0]}"
        ) from exc
