"""data/docs/*.pdf ↔ Supabase Storage 'docs' 버킷 키 매핑.

Supabase Storage object key는 ASCII 외 문자(한글, ★, ·, ~ 등)를 허용하지 않으므로,
원본 파일명을 그대로 키로 쓸 수 없다. 대신 원본 파일명의 sha1 해시를 키로 사용한다 —
업로드 스크립트(scripts/upload_docs_to_supabase.py)와 다운로드 라우트(api/docs.py)가
이 함수를 공유하므로 별도 매핑 테이블 없이 항상 같은 파일명이 같은 키로 변환된다.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

BUCKET = "docs"


def storage_key_for(filename: str) -> str:
    ext = Path(filename).suffix.lower() or ".pdf"
    digest = hashlib.sha1(filename.encode("utf-8")).hexdigest()[:16]
    return f"{digest}{ext}"
