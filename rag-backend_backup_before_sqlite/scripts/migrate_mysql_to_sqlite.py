import os
from pathlib import Path
import sys

from dotenv import load_dotenv
from sqlalchemy import MetaData, Table, create_engine, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")

from app.core.database import engine as sqlite_engine, init_db
from app.models.user import User


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"필수 환경변수 {name}가 없습니다.")
    return value


def mysql_url() -> URL:
    return URL.create(
        drivername="mysql+pymysql",
        username=required("MYSQL_SOURCE_USER"),
        password=required("MYSQL_SOURCE_PASSWORD"),
        host=required("MYSQL_SOURCE_HOST"),
        port=int(os.environ.get("MYSQL_SOURCE_PORT", "3306")),
        database=required("MYSQL_SOURCE_DB"),
        query={"charset": "utf8mb4"},
    )


def clean(value):
    return value if value not in ("", "nan") else None


def main() -> None:
    if not str(sqlite_engine.url).startswith("sqlite"):
        raise RuntimeError("대상 DATABASE_URL이 SQLite가 아닙니다.")

    init_db()
    source_engine = create_engine(mysql_url(), pool_pre_ping=True)
    metadata = MetaData()
    source_users = Table("users", metadata, autoload_with=source_engine)

    with source_engine.connect() as source_connection:
        rows = source_connection.execute(select(source_users)).mappings().all()

    inserted = 0
    updated = 0

    with Session(sqlite_engine) as target:
        for row in rows:
            email = str(row["email"]).strip().lower()
            user = target.scalar(select(User).where(User.email == email))
            values = {
                "password_hash": row["password_hash"],
                "name": row["name"],
                "organization": row["organization"],
                "role": row.get("role") or "manager",
                "is_active": bool(row.get("is_active", True)),
                "sido_code": clean(row.get("sido_code")),
                "sido_name": clean(row.get("sido_name")),
                "sigungu_code": clean(row.get("sigungu_code")),
                "sigungu_name": clean(row.get("sigungu_name")),
                "created_at": row.get("created_at"),
                "last_login_at": row.get("last_login_at"),
            }

            if user is None:
                target.add(User(email=email, **values))
                inserted += 1
            else:
                for key, value in values.items():
                    setattr(user, key, value)
                updated += 1

        target.commit()

    print("MySQL → SQLite 사용자 이전 완료")
    print(f"- 원본 사용자: {len(rows)}명")
    print(f"- 신규 입력: {inserted}명")
    print(f"- 기존 갱신: {updated}명")


if __name__ == "__main__":
    main()
