import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.embedder import Embedder
from app.core.store import make_store

# .env를 앱 초기화 전에 읽어 OPENAI_API_KEY, CHROMA_DIR, DB 설정 등을 사용한다.
load_dotenv()

DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _allowed_origins() -> list[str]:
    configured = os.environ.get("FRONTEND_ORIGINS", "")
    if not configured.strip():
        return DEFAULT_ORIGINS
    return [
        origin.strip()
        for origin in configured.split(",")
        if origin.strip()
    ]


def create_app() -> FastAPI:
    app = FastAPI(
        title="소나무재선충병 통합 예찰·방제지원 API",
        version="1.1.0",
        description=(
            "백서 RAG 질의응답과 서버 SQLite 기반 "
            "로그인·회원가입 기능을 제공하는 API"
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    initialization_error: str | None = None

    try:
        app.state.store = make_store()
        app.state.embedder = Embedder()
    except Exception as exc:
        initialization_error = (
            f"{type(exc).__name__}: {exc}"
        )
        print(
            f"[RAG 초기화 오류] {initialization_error}"
        )
        app.state.store = None
        app.state.embedder = None

    app.state.initialization_error = (
        initialization_error
    )

    auth_initialization_error: str | None = None

    try:
        from app.core.database import init_db

        init_db()
    except Exception as exc:
        auth_initialization_error = (
            f"{type(exc).__name__}: {exc}"
        )
        print(
            "[인증 DB 초기화 오류] "
            f"{auth_initialization_error}"
        )

    app.state.auth_initialization_error = (
        auth_initialization_error
    )

    @app.get("/health")
    def health() -> dict:
        store = getattr(
            app.state,
            "store",
            None,
        )

        count = (
            store.count()
            if store is not None
            else 0
        )

        rag_ready = bool(
            store is not None
            and app.state.embedder is not None
            and count > 0
        )

        auth_ready = (
            app.state.auth_initialization_error
            is None
        )

        return {
            "status": (
                "ok"
                if rag_ready and auth_ready
                else "degraded"
            ),
            "rag_ready": rag_ready,
            "auth_ready": auth_ready,
            "vector_chunks": count,
            "initialization_error": (
                app.state.initialization_error
            ),
            "auth_initialization_error": (
                app.state.auth_initialization_error
            ),
        }

    from app.api.auth import router as auth_router
    from app.api.chat import router as chat_router
    from app.api.docs import router as docs_router

    app.include_router(chat_router)
    app.include_router(docs_router)
    app.include_router(auth_router)

    return app


app = create_app()
