from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import inspect, text

from app.core.database import DATABASE_URL, engine, init_db


def main() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        raise RuntimeError(f"SQLite URL이 아닙니다: {DATABASE_URL}")

    init_db()

    with engine.begin() as connection:
        mode = connection.execute(text("PRAGMA journal_mode")).scalar_one()
        timeout = connection.execute(text("PRAGMA busy_timeout")).scalar_one()

    tables = inspect(engine).get_table_names()
    print("SQLite 초기화 완료")
    print(f"- DATABASE_URL: {DATABASE_URL}")
    print(f"- 테이블: {', '.join(tables)}")
    print(f"- journal_mode: {mode}")
    print(f"- busy_timeout: {timeout}ms")


if __name__ == "__main__":
    main()
