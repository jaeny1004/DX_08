"""현장 음성 작업일지 STT.

현장 모바일 앱(pine-app-main)이 녹음 파일을 Supabase Storage 에 올린 뒤
이 엔드포인트로 전사를 요청한다.

원래 앱은 Supabase Edge Function `field-audio-stt` 를 불렀는데 그 함수는
조원 프로젝트에만 배포돼 있었다. 챗봇을 웹 백엔드로 합친 것과 같은 이유로
여기로 옮긴다. OPENAI_API_KEY 가 이미 백엔드에 있어 키를 한 곳에서만 관리하면 된다.

앱과의 계약은 Edge Function 때와 동일하게 유지했다.
  요청  { "bucket": "field-audio", "path": "control/2026-08-09/UUID.webm" }
  응답  { "success": true, "transcript": "..." }
        { "success": false, "error": "..." }

앱은 실패해도 녹음 파일을 지우지 않고 stt_status='error' 로 남긴다.
나중에 재처리할 수 있도록 하기 위함이다.
"""

from __future__ import annotations

import os

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["현장 음성"])

# 앱이 올릴 수 있는 버킷만 허용한다. 임의 버킷을 읽어오지 못하게 한다.
ALLOWED_BUCKETS = {"field-audio"}

# Whisper 업로드 상한은 25MB다. 그보다 큰 파일은 받기 전에 거른다.
MAX_AUDIO_BYTES = 25 * 1024 * 1024

STT_MODEL = os.environ.get("OPENAI_STT_MODEL", "whisper-1")

_storage_client = None


def _storage():
    global _storage_client
    if _storage_client is None:
        from supabase import create_client

        _storage_client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_KEY"],
        )
    return _storage_client


class FieldAudioSttRequest(BaseModel):
    bucket: str = Field(default="field-audio")
    path: str


class FieldAudioSttResponse(BaseModel):
    success: bool
    transcript: str | None = None
    error: str | None = None


@router.post("/field-audio-stt", response_model=FieldAudioSttResponse)
def field_audio_stt(
    request: FieldAudioSttRequest,
) -> FieldAudioSttResponse:
    """Storage 의 녹음 파일을 내려받아 한국어로 전사한다.

    앱이 오류 문구를 그대로 화면에 띄우므로, 예외를 던지지 않고
    success=false 와 사람이 읽을 수 있는 사유를 돌려준다.
    """
    if request.bucket not in ALLOWED_BUCKETS:
        return FieldAudioSttResponse(
            success=False,
            error=f"허용되지 않은 버킷입니다: {request.bucket}",
        )

    # 경로 탈출 차단. Storage key 라 절대경로나 상위 참조가 올 이유가 없다.
    path = request.path.strip().lstrip("/")
    if not path or ".." in path:
        return FieldAudioSttResponse(
            success=False,
            error="잘못된 파일 경로입니다.",
        )

    try:
        audio = _storage().storage.from_(request.bucket).download(path)
    except Exception as exc:
        return FieldAudioSttResponse(
            success=False,
            error=f"녹음 파일을 내려받지 못했습니다: {exc}",
        )

    if not audio:
        return FieldAudioSttResponse(
            success=False,
            error="녹음 파일이 비어 있습니다.",
        )

    if len(audio) > MAX_AUDIO_BYTES:
        return FieldAudioSttResponse(
            success=False,
            error=(
                f"녹음 파일이 너무 큽니다({len(audio) / 1024 / 1024:.1f}MB). "
                "25MB 이하만 변환할 수 있습니다."
            ),
        )

    try:
        from openai import OpenAI

        # 파일명 확장자로 형식을 판단하므로 원래 이름을 그대로 넘긴다.
        filename = os.path.basename(path) or "audio.webm"

        result = OpenAI().audio.transcriptions.create(
            model=STT_MODEL,
            file=(filename, audio),
            language="ko",
        )
    except Exception as exc:
        return FieldAudioSttResponse(
            success=False,
            error=f"음성 변환에 실패했습니다: {exc}",
        )

    transcript = (getattr(result, "text", "") or "").strip()

    if not transcript:
        return FieldAudioSttResponse(
            success=False,
            error="변환된 작업일지 내용이 비어 있습니다.",
        )

    return FieldAudioSttResponse(
        success=True,
        transcript=transcript,
    )
