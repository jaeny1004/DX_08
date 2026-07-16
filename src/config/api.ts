/**
 * 공용 API 서버 주소 관리
 *
 * 우선순위:
 * 1. VITE_RAG_API_BASE
 * 2. VITE_API_BASE_URL
 * 3. 네이버클라우드 공용 FastAPI 서버
 *
 * 더 이상 127.0.0.1 또는 localhost:8788로 자동 연결하지 않습니다.
 */

const DEFAULT_PUBLIC_API_BASE = "http://101.79.24.212:8788";

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("RAG API 서버 주소가 비어 있습니다.");
  }

  if (
    !normalized.startsWith("http://") &&
    !normalized.startsWith("https://")
  ) {
    throw new Error(
      `RAG API 서버 주소는 http:// 또는 https://로 시작해야 합니다: ${normalized}`
    );
  }

  return normalized;
}

const configuredApiBase =
  import.meta.env.VITE_RAG_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  DEFAULT_PUBLIC_API_BASE;

/**
 * 현재 프론트가 사용하는 공용 FastAPI 주소
 */
export const RAG_API_BASE = normalizeBaseUrl(configuredApiBase);

/**
 * API 경로를 안전하게 결합합니다.
 *
 * 예:
 * buildApiUrl("/chat")
 * → http://101.79.24.212:8788/chat
 */
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${RAG_API_BASE}${normalizedPath}`;
}