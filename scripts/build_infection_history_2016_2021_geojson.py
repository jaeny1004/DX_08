from pathlib import Path
import pandas as pd
import geopandas as gpd

PROJECT_ROOT = Path(r"C:\Users\User\Desktop\산림 데이터셋\DX_08")

GRID_PATH = (
    PROJECT_ROOT
    / "data"
    / "terrain_pine_site_features_south_500m.csv"
)

INFECTION_PATH = (
    PROJECT_ROOT
    / "data"
    / "infection"
    / "grid_infection_count_by_year_2016_2023.csv"
)

OUTPUT_GEOJSON = (
    PROJECT_ROOT
    / "public"
    / "data"
    / "infection_history_2016_2021.geojson"
)

OUTPUT_CSV = (
    PROJECT_ROOT
    / "data"
    / "infection"
    / "infection_history_2016_2021.csv"
)

YEARS = list(range(2016, 2022))
YEAR_COLUMNS = [f"infection_count_{year}" for year in YEARS]


def first_infection_year(row):
    for year in YEARS:
        if row[f"infection_count_{year}"] > 0:
            return year
    return None


def last_infection_year(row):
    for year in reversed(YEARS):
        if row[f"infection_count_{year}"] > 0:
            return year
    return None


def main():
    OUTPUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)

    grid = pd.read_csv(
        GRID_PATH,
        usecols=["id", "WKT"],
        encoding="utf-8-sig",
    )

    infection = pd.read_csv(
        INFECTION_PATH,
        usecols=["id", *YEAR_COLUMNS],
        encoding="utf-8-sig",
    )

    if len(grid) != 419_075:
        raise ValueError(
            f"전체 격자 행 수가 419,075개가 아닙니다: {len(grid):,}개"
        )

    if grid["id"].duplicated().any():
        raise ValueError("전체 격자 파일에 중복 id가 있습니다.")

    if infection["id"].duplicated().any():
        raise ValueError("감염 이력 파일에 중복 id가 있습니다.")

    if set(grid["id"]) != set(infection["id"]):
        raise ValueError(
            "전체 격자 파일과 감염 이력 파일의 id 집합이 일치하지 않습니다."
        )

    infection["infection_count_2016_2021"] = (
        infection[YEAR_COLUMNS].sum(axis=1)
    )

    history = infection.loc[
        infection["infection_count_2016_2021"] > 0
    ].copy()

    history["infection_history_flag_2021"] = 1
    history["infection_first_year"] = history.apply(
        first_infection_year,
        axis=1,
    )
    history["infection_last_year"] = history.apply(
        last_infection_year,
        axis=1,
    )

    merged = history.merge(
        grid,
        on="id",
        how="left",
        validate="one_to_one",
    )

    if merged["WKT"].isna().any():
        raise ValueError(
            "공간정보가 결합되지 않은 감염 발생 이력 격자가 있습니다."
        )

    geometry = gpd.GeoSeries.from_wkt(
        merged["WKT"],
        crs="EPSG:5186",
    )

    gdf = gpd.GeoDataFrame(
        merged.drop(columns=["WKT"]),
        geometry=geometry,
        crs="EPSG:5186",
    ).to_crs("EPSG:4326")

    integer_columns = [
        "id",
        *YEAR_COLUMNS,
        "infection_count_2016_2021",
        "infection_history_flag_2021",
        "infection_first_year",
        "infection_last_year",
    ]

    for column in integer_columns:
        gdf[column] = gdf[column].astype("int64")

    gdf.to_file(
        OUTPUT_GEOJSON,
        driver="GeoJSON",
        encoding="utf-8",
    )

    history[
        [
            "id",
            *YEAR_COLUMNS,
            "infection_count_2016_2021",
            "infection_history_flag_2021",
            "infection_first_year",
            "infection_last_year",
        ]
    ].to_csv(
        OUTPUT_CSV,
        index=False,
        encoding="utf-8-sig",
    )

    print("생성 완료")
    print(f"- 감염 발생 이력 격자: {len(gdf):,}개")
    print(f"- GeoJSON: {OUTPUT_GEOJSON}")
    print(f"- CSV: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
