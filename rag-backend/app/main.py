import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.embedder import Embedder
from app.core.store import make_store

# .env를 앱 초기화 전에 읽어 OPENAI_API_KEY, CHROMA_DIR 등을 사용할 수 있게 한다.
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
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(
        title="산림병해충 RAG 챗봇",
        version="1.0.0",
        description="백서·방제지침을 검색해 문서명과 페이지 근거를 제공하는 API",
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
        initialization_error = f"{type(exc).__name__}: {exc}"
        print(f"[RAG 초기화 오류] {initialization_error}")
        app.state.store = None
        app.state.embedder = None

    app.state.initialization_error = initialization_error

    @app.get("/health")
    def health() -> dict:
        store = getattr(app.state, "store", None)
        count = store.count() if store is not None else 0
        return {
            "status": "ok" if store is not None and app.state.embedder is not None else "degraded",
            "rag_ready": bool(store is not None and app.state.embedder is not None and count > 0),
            "vector_chunks": count,
            "initialization_error": app.state.initialization_error,
        }

    from app.api.chat import router as chat_router
    from app.api.docs import router as docs_router

    app.include_router(chat_router)
    app.include_router(docs_router)
    return app


app = create_app()
