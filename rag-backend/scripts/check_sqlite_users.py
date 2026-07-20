from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import engine
from app.models.user import User


with Session(engine) as session:
    count = session.scalar(select(func.count()).select_from(User)) or 0
    print(f"SQLite 사용자 수: {count:,}명")
    for user in session.scalars(select(User).order_by(User.id).limit(20)):
        print(
            user.id,
            user.email,
            user.name,
            user.sigungu_code or "-",
            user.sigungu_name or "-",
        )
