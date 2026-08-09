"""주소 -> 위경도 지오코딩.

확진목 등록 화면에서 "경북 포항시 북구 죽장면 산42"처럼 지번까지 입력하면
그 지점이 실제로 속한 500m 격자를 찾아 주기 위한 것이다.
행정동 이름만으로 대표 격자를 쓰던 방식보다 정확하다.

VWorld 주소검색 API는 CORS 헤더를 주지 않아 브라우저에서 직접 부를 수 없다.
그래서 백엔드가 대신 호출한다.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/geocode", tags=["지오코딩"])

VWORLD_ENDPOINT = "https://api.vworld.kr/req/address"


def _referer_url(domain: str | None) -> str | None:
    """스킴 없는 도메인을 그대로 Referer로 보내면 VWorld가 500을 돌려준다."""
    value = (domain or "").strip()
    if not value:
        return None
    if value.startswith(("http://", "https://")):
        return value
    return f"https://{value}"


def _lookup(client: httpx.Client, address: str, api_key: str, address_type: str):
    response = client.get(
        VWORLD_ENDPOINT,
        params={
            "service": "address",
            "request": "getcoord",
            "version": "2.0",
            "crs": "EPSG:4326",
            "type": address_type,
            "address": address,
            "format": "json",
            "key": api_key,
        },
    )
    response.raise_for_status()
    payload = response.json().get("response") or {}
    if payload.get("status") != "OK":
        return None
    point = (payload.get("result") or {}).get("point") or {}
    try:
        return float(point["y"]), float(point["x"])
    except (KeyError, TypeError, ValueError):
        return None


@router.get("")
def geocode_address(
    address: str = Query(min_length=2, max_length=200),
    current_user: User = Depends(get_current_user),
) -> dict:
    api_key = os.getenv("VWORLD_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="지오코딩에 필요한 VWORLD_API_KEY가 설정되지 않았습니다.",
        )

    headers = {"User-Agent": "PineWiltGeocode/1.0"}
    referer = _referer_url(os.getenv("VWORLD_API_DOMAIN"))
    if referer:
        headers["Referer"] = referer

    try:
        with httpx.Client(
            timeout=httpx.Timeout(8.0, connect=4.0),
            headers=headers,
        ) as client:
            # 지번(산42 등)이 우선. 못 찾으면 도로명으로 한 번 더 시도한다.
            found = _lookup(client, address, api_key, "PARCEL") or _lookup(
                client, address, api_key, "ROAD"
            )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"주소 검색 서비스를 호출하지 못했습니다: {type(exc).__name__}",
        ) from exc

    if not found:
        raise HTTPException(
            status_code=404,
            detail="입력한 주소로 좌표를 찾지 못했습니다.",
        )

    latitude, longitude = found
    return {"latitude": latitude, "longitude": longitude}
