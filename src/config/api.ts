/**
 * 공용 FastAPI 서버 주소 관리
 *
 * 우선순위:
 * 1. VITE_API_BASE_URL
 * 2. VITE_RAG_API_BASE (기존 환경변수 호환)
 * 3. 운영 공용 FastAPI 서버
 * 4. 로컬 개발 기본값 http://127.0.0.1:8788
 */

const DEVELOPMENT_API_BASE = "http://127.0.0.1:8788";
const PRODUCTION_API_BASE = "https://dx-08-backend.vercel.app";

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");

  if (!normalized) {
    return "";
  }

  if (
    !normalized.startsWith("http://") &&
    !normalized.startsWith("https://")
  ) {
    throw new Error(
      `API 서버 주소는 http:// 또는 https://로 시작해야 합니다: ${normalized}`,
    );
  }

  return normalized;
}

const configuredApiBase =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_RAG_API_BASE ||
  "";

export const API_BASE_URL = normalizeBaseUrl(
  configuredApiBase ||
    (import.meta.env.PROD ? PRODUCTION_API_BASE : DEVELOPMENT_API_BASE),
);

/** 기존 코드 호환용 별칭 */
export const RAG_API_BASE = API_BASE_URL;

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
