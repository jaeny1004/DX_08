from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.embedder import Embedder
from app.core.store import make_store


# 앱 초기화 전에 .env를 읽는다.
load_dotenv()


DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://101.79.24.212",
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
        version="1.3.0",
        description=(
            "백서 RAG 질의응답, SQLite 기반 인증, "
            "예측·현장예찰·방제 보고서 조회·미리보기·다운로드 API"
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -----------------------------
    # RAG 초기화
    # -----------------------------
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

    # -----------------------------
    # 인증 DB 초기화
    # -----------------------------
    auth_initialization_error: str | None = None

    try:
        from app.core.database import init_db

        init_db()
    except Exception as exc:
        auth_initialization_error = f"{type(exc).__name__}: {exc}"
        print(f"[인증 DB 초기화 오류] {auth_initialization_error}")

    app.state.auth_initialization_error = auth_initialization_error

    # -----------------------------
    # 상태 확인
    # -----------------------------
    @app.get("/health", tags=["상태"])
    def health() -> dict:
        store = getattr(app.state, "store", None)

        vector_count = 0
        if store is not None:
            try:
                vector_count = int(store.count())
            except Exception:
                vector_count = 0

        rag_ready = bool(
            store is not None
            and getattr(app.state, "embedder", None) is not None
            and vector_count > 0
        )
        auth_ready = app.state.auth_initialization_error is None

        return {
            "status": "ok" if auth_ready else "degraded",
            "rag_ready": rag_ready,
            "auth_ready": auth_ready,
            "vector_chunks": vector_count,
            "initialization_error": app.state.initialization_error,
            "auth_initialization_error": (
                app.state.auth_initialization_error
            ),
        }

    # -----------------------------
    # API 라우터 등록
    # -----------------------------
    from app.api.auth import router as auth_router
    from app.api.chat import router as chat_router
    from app.api.docs import router as docs_router
    from app.api.reports import router as reports_router

    routers = {
        "auth": auth_router,
        "chat": chat_router,
        "docs": docs_router,
        "reports": reports_router,
    }

    for router_name, router in routers.items():
        route_count = len(router.routes)
        print(f"[라우터 확인] {router_name}: {route_count}개 경로")

        if route_count == 0:
            raise RuntimeError(
                f"{router_name} 라우터에 등록된 API 경로가 없습니다."
            )

        app.include_router(router)

    # 실제 APIRoute가 앱에 등록됐는지 최종 검증
    registered_paths = {
        getattr(route, "path", "")
        for route in app.routes
    }

    required_paths = {
        "/health",
        "/api/auth/login",
        "/api/auth/signup",
        "/api/auth/me",
        "/chat",
        "/api/reports/options",
        "/api/reports",
        "/api/reports/export/linked.xlsx",
    }

    missing_paths = required_paths - registered_paths
    if missing_paths:
        raise RuntimeError(
            "FastAPI 라우터 등록 실패: "
            + ", ".join(sorted(missing_paths))
        )

    return app


app = create_app()
