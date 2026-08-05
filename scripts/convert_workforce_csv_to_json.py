from pathlib import Path

import pandas as pd


PROJECT_DIR = Path(
    r"C:\Users\User\Desktop\산림 데이터셋\DX_08"
)

INPUT_DIR = (
    PROJECT_DIR
    / "data"
    / "workforce"
)

OUTPUT_DIR = (
    PROJECT_DIR
    / "public"
    / "data"
    / "workforce"
)


FILES = {
    "admin_workforce_summary.csv":
        "admin_workforce_summary.json",

    "emd_workforce_summary.csv":
        "emd_workforce_summary.json",

    "worker_assignment.csv":
        "worker_assignment.json",

    "unassigned_grids.csv":
        "unassigned_grids.json",

    "worker_master.csv":
        "worker_master.json",
}


def main() -> None:
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    for csv_name, json_name in FILES.items():
        input_path = INPUT_DIR / csv_name
        output_path = OUTPUT_DIR / json_name

        if not input_path.exists():
            print(
                f"[건너뜀] 파일 없음: {input_path}"
            )
            continue

        dataframe = pd.read_csv(
            input_path,
            encoding="utf-8-sig",
            dtype={
                "sigungu_code": "string",
                "emd_code": "string",
                "grid_id": "string",
                "worker_id": "string",
                "home_sigungu_code": "string",
            },
        )

        dataframe = dataframe.where(
            pd.notna(dataframe),
            None,
        )

        dataframe.to_json(
            output_path,
            orient="records",
            force_ascii=False,
            indent=2,
        )

        print(
            f"생성 완료: {output_path}"
        )

    print()
    print("프론트용 JSON 변환 완료")


if __name__ == "__main__":
    main()