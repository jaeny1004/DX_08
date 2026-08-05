from pathlib import Path

import pandas as pd


PROJECT_DIR = Path(
    r"C:\Users\User\Desktop\산림 데이터셋\DX_08"
)

WORKFORCE_DIR = (
    PROJECT_DIR
    / "data"
    / "workforce"
)

OUTPUT_PATH = (
    PROJECT_DIR
    / "public"
    / "data"
    / "workforce"
    / "admin_workforce_ui_summary.json"
)


def read_csv(filename: str) -> pd.DataFrame:
    path = WORKFORCE_DIR / filename

    if not path.exists():
        raise FileNotFoundError(
            f"파일이 없습니다: {path}"
        )

    return pd.read_csv(
        path,
        encoding="utf-8-sig",
        dtype={
            "sigungu_code": "string",
            "emd_code": "string",
            "grid_id": "string",
            "worker_id": "string",
        },
    )


def main() -> None:
    admin_df = read_csv(
        "admin_workforce_summary.csv"
    )

    assignment_df = read_csv(
        "worker_assignment.csv"
    )

    unassigned_df = read_csv(
        "unassigned_grids.csv"
    )

    assigned_summary = (
        assignment_df
        .groupby(
            "sigungu_code",
            dropna=False,
        )
        .agg(
            assigned_grid_count=(
                "grid_id",
                "count",
            ),
            assigned_worker_count=(
                "worker_id",
                "nunique",
            ),
            assigned_minutes=(
                "estimated_minutes",
                "sum",
            ),
        )
        .reset_index()
    )

    unassigned_summary = (
        unassigned_df
        .groupby(
            "sigungu_code",
            dropna=False,
        )
        .agg(
            unassigned_grid_count=(
                "grid_id",
                "count",
            ),
            unassigned_minutes=(
                "estimated_minutes",
                "sum",
            ),
        )
        .reset_index()
    )

    result_df = admin_df.merge(
        assigned_summary,
        on="sigungu_code",
        how="left",
    )

    result_df = result_df.merge(
        unassigned_summary,
        on="sigungu_code",
        how="left",
    )

    fill_zero_columns = [
        "assigned_grid_count",
        "assigned_worker_count",
        "assigned_minutes",
        "unassigned_grid_count",
        "unassigned_minutes",
    ]

    for column in fill_zero_columns:
        result_df[column] = (
            result_df[column]
            .fillna(0)
        )

    integer_columns = [
        "assigned_grid_count",
        "assigned_worker_count",
        "unassigned_grid_count",
    ]

    for column in integer_columns:
        result_df[column] = (
            result_df[column]
            .astype(int)
        )

    result_df[
        "assignment_rate"
    ] = result_df.apply(
        lambda row: round(
            (
                row[
                    "assigned_grid_count"
                ]
                / row[
                    "target_grid_count"
                ]
                * 100
            ),
            1,
        )
        if row[
            "target_grid_count"
        ] > 0
        else 0.0,
        axis=1,
    )

    result_df[
        "field_shortage_count"
    ] = result_df[
        "field_worker_gap"
    ].apply(
        lambda value: max(
            0,
            -int(value),
        )
    )

    result_df[
        "drone_shortage_count"
    ] = result_df[
        "drone_worker_gap"
    ].apply(
        lambda value: max(
            0,
            -int(value),
        )
    )

    result_df[
        "control_shortage_count"
    ] = result_df[
        "control_worker_gap"
    ].apply(
        lambda value: max(
            0,
            -int(value),
        )
    )

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    result_df = result_df.where(
        pd.notna(result_df),
        None,
    )

    result_df.to_json(
        OUTPUT_PATH,
        orient="records",
        force_ascii=False,
        indent=2,
    )

    print(
        f"생성 완료: {OUTPUT_PATH}"
    )

    print(
        f"시군구 수: {len(result_df):,}개"
    )

    print(
        "전체 배정 격자:",
        f"{result_df['assigned_grid_count'].sum():,}개",
    )

    print(
        "전체 미배정 격자:",
        f"{result_df['unassigned_grid_count'].sum():,}개",
    )


if __name__ == "__main__":
    main()