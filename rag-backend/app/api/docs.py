import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.core.doc_storage import BUCKET, storage_key_for

router = APIRouter()

SIGNED_URL_EXPIRES_IN = 300  # 5분

_client = None


def _storage():
    global _client
    if _client is None:
        from supabase import create_client

        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    return _client


@router.get("/docs/{filename}")
def get_doc(filename: str) -> RedirectResponse:
    # 파일명만 허용 (디렉터리 성분 제거로 traversal 차단)
    safe_name = os.path.basename(filename)
    if safe_name != filename or not safe_name:
        raise HTTPException(status_code=400, detail="잘못된 파일명입니다.")

    storage_key = storage_key_for(safe_name)
    try:
        signed = (
            _storage()
            .storage.from_(BUCKET)
            .create_signed_url(storage_key, SIGNED_URL_EXPIRES_IN)
        )
    except Exception as exc:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.") from exc

    return RedirectResponse(signed["signedURL"])
