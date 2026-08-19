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
    "https://dx-08.vercel.app",
]

# dx-08 Vercel Preview 배포 주소도 허용한다.
# 예: https://dx-08-git-dev-pine-disease.vercel.app
DEFAULT_ORIGIN_REGEX = (
    r"^https://dx-08(?:-[a-z0-9-]+)?\.vercel\.app$"
)


def _allowed_origins() -> list[str]:
    configured = os.environ.get("FRONTEND_ORIGINS", "")

    if not configured.strip():
        return DEFAULT_ORIGINS

    return [
        origin.strip()
        for origin in configured.split(",")
        if origin.strip()
    ]


def _allowed_origin_regex() -> str:
    configured = os.environ.get(
        "FRONTEND_ORIGIN_REGEX",
        "",
    ).strip()
    return configured or DEFAULT_ORIGIN_REGEX


def create_app() -> FastAPI:
    app = FastAPI(
        title="소나무재선충병 통합 예찰·방제지원 API",
        version="1.3.0",
        description=(
            "백서 RAG 질의응답, SQLite 기반 인증, "
            "예측·현장예찰·방제 보고서 조회·미리보기·다운로드 API"
        ),
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
    from app.api.report_drafts import router as report_drafts_router
    from app.api.species import router as species_router

    routers = {
        "auth": auth_router,
        "chat": chat_router,
        "docs": docs_router,
        "reports": reports_router,
        "report_drafts": report_drafts_router,
        "species": species_router,
    }

    for router_name, router in routers.items():
        route_count = len(router.routes)
        print(f"[라우터 확인] {router_name}: {route_count}개 경로")

        if route_count == 0:
            raise RuntimeError(
                f"{router_name} 라우터에 등록된 API 경로가 없습니다."
            )

        app.include_router(router)

    # 등록된 경로를 시작 로그에 출력한다.
    # FastAPI/Starlette 버전 차이로 route.path 검증이 잘못 실패할 수 있으므로
    # 서버 시작 자체를 막는 강제 검증은 사용하지 않는다.
    registered_paths = sorted(
        {
            getattr(route, "path", "")
            for route in app.routes
            if getattr(route, "path", "")
        }
    )
    print("[등록된 API 경로]")
    for path in registered_paths:
        print(f"  - {path}")

    return app


# CORSMiddleware가 FastAPI 전체를 감싸도록 구성한다.
# 이렇게 해야 라우터 내부에서 처리되지 않은 500 오류가 발생해도
# CORS 헤더가 포함되어 브라우저에서 실제 오류 응답을 확인할 수 있다.
app = CORSMiddleware(
    app=create_app(),
    allow_origins=_allowed_origins(),
    allow_origin_regex=_allowed_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
