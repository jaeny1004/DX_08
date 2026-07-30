"""Vercel Python 런타임 진입점.

Vercel은 api/ 아래 파일에서 ASGI 앱 변수(app)를 찾아 그대로 서버리스
함수로 감싼다. 실제 애플리케이션 정의는 app/main.py에 그대로 두고,
여기서는 import만 한다 — uvicorn으로 로컬 실행할 때 쓰는
`app.main:app` 경로와 동일한 FastAPI 인스턴스를 공유하기 위함이다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402
