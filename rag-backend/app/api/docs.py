import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()


@router.get("/docs/{filename}")
def get_doc(filename: str) -> FileResponse:
    docs_dir = os.path.abspath(os.environ.get("DOCS_DIR", "./data/docs"))
    # 파일명만 허용 (디렉터리 성분 제거로 traversal 차단)
    safe_name = os.path.basename(filename)
    if safe_name != filename or not safe_name:
        raise HTTPException(status_code=400, detail="잘못된 파일명입니다.")
    full = os.path.abspath(os.path.join(docs_dir, safe_name))
    if not full.startswith(docs_dir + os.sep) or not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    return FileResponse(full)
