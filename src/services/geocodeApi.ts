import { buildApiUrl } from "../config/api";
import { getAccessToken } from "./authApi";

/**
 * 주소 -> 위경도 변환.
 *
 * VWorld 주소검색 API가 CORS 헤더를 주지 않아 브라우저에서 직접 못 부른다.
 * 백엔드(/api/geocode)가 대신 호출한 결과를 받는다.
 *
 * 지오코딩은 위치 정확도를 높이기 위한 보조 기능이다.
 * 실패해도 화면이 막히면 안 되므로 오류를 던지지 않고 null을 돌려준다.
 */
export async function geocodeAddress(
  address: string,
  signal?: AbortSignal,
): Promise<{ latitude: number; longitude: number } | null> {
  const trimmed = address.trim();
  if (trimmed.length < 2) return null;

  const token = getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(
      `${buildApiUrl("/api/geocode")}?address=${encodeURIComponent(trimmed)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
    );
    if (!response.ok) return null;

    const payload = await response.json();
    const latitude = Number(payload?.latitude);
    const longitude = Number(payload?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}
