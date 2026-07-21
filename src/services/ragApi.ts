/**
 * RAG API 통신 서비스
 *
 * 주요 기능
 * 1. 공용 FastAPI 서버의 POST /chat 호출
 * 2. 근거 문서 열람 URL 생성
 * 3. 기존 Chatbot.tsx와의 타입·함수 호환 유지
 * 4. 로컬 127.0.0.1 주소로 자동 복귀하지 않음
 */

/* =========================================================
 * API 서버 설정
 * ======================================================= */

/**
 * 프론트 .env 우선순위
 *
 * 1. VITE_RAG_API_BASE
 * 2. VITE_API_BASE_URL
 * 3. 네이버클라우드 공용 FastAPI 서버
 */
const DEFAULT_RAG_API_BASE = "http://101.79.24.212:8788";

/**
 * RAG 요청 제한 시간
 * 문서 검색과 OpenAI 답변 생성을 고려해 90초로 설정한다.
 */
const REQUEST_TIMEOUT_MS = 90_000;

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_RAG_API_BASE;
  }

  const normalized = value.trim().replace(/\/+$/, "");

  if (!normalized) {
    return DEFAULT_RAG_API_BASE;
  }

  if (
    !normalized.startsWith("http://") &&
    !normalized.startsWith("https://")
  ) {
    throw new Error(
      `RAG API 주소는 http:// 또는 https://로 시작해야 합니다: ${normalized}`
    );
  }

  return normalized;
}

const envRagApiBase = import.meta.env.VITE_RAG_API_BASE;
const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

/**
 * 최종적으로 사용하는 RAG API 주소
 */
export const RAG_API_BASE = normalizeBaseUrl(
  envRagApiBase || envApiBaseUrl || DEFAULT_RAG_API_BASE
);

/**
 * API 기본 주소와 경로를 안전하게 결합한다.
 *
 * 예:
 * buildRagApiUrl("/chat")
 * → http://101.79.24.212:8788/chat
 */
export function buildRagApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${RAG_API_BASE}${normalizedPath}`;
}

/* =========================================================
 * 채팅 타입
 * ======================================================= */

export type RagChatRole = "user" | "assistant";

/**
 * 프론트가 백엔드에 전달하는 이전 대화 기록
 */
export interface RagChatHistoryItem {
  role: RagChatRole;
  content: string;
}

/**
 * 이전 코드와의 호환을 위한 별칭
 */
export type RagHistoryItem = RagChatHistoryItem;
export type ChatHistoryItem = RagChatHistoryItem;

/**
 * 지도에서 선택한 위험격자 정보
 */
export interface GridContext {
  grid_id: string | number;
  risk_score?: number | null;
  risk_grade?: string | null;
  risk_stage_label?: string | null;
  field_priority_score_v3?: number | null;
  field_priority_grade_v3?: string | null;
  priority_stage_label?: string | null;
  pine_ratio?: number | null;
  infection_pressure?: number | null;
  recent_pressure_score?: number | null;
  access_score_v3?: number | null;
  road_class_near?: string | null;
  road_dist_m?: number | null;
  river_dist_m?: number | null;
  env_flag?: number | boolean | string | null;
  field_recommended_action_v3?: string | null;
}

/**
 * FastAPI POST /chat 요청 구조
 */
export interface RagChatRequest {
  question: string;
  history: RagChatHistoryItem[];
  grid_context: GridContext | null;
}

/**
 * RAG 근거 문서 정보
 *
 * 백엔드 또는 기존 프론트 코드에서 사용하는 여러 속성을
 * 함께 수용할 수 있도록 선택 속성을 포함한다.
 */
export interface RagSource {
  doc_name: string;
  page: number | null;

  filename?: string;
  name?: string;
  score?: number;
  similarity?: number;
  chunk?: string;
  content?: string;
  excerpt?: string;
}

/**
 * 이전 코드와의 호환을 위한 별칭
 */
export type RagChatSource = RagSource;
export type ChatSource = RagSource;

/**
 * FastAPI POST /chat 응답 구조
 */
export interface RagChatResponse {
  answer: string;
  sources: RagSource[];
}

/**
 * 이전 코드와의 호환을 위한 별칭
 */
export type ChatResponse = RagChatResponse;

/* =========================================================
 * 내부 유틸리티 타입
 * ======================================================= */

interface FastApiErrorResponse {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
}

type UnknownRecord = Record<string, unknown>;

/* =========================================================
 * 내부 유틸리티 함수
 * ======================================================= */

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readFirstString(
  record: UnknownRecord,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function readOptionalNumber(
  record: UnknownRecord,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return undefined;
}

function readPage(record: UnknownRecord): number | null {
  const page = readOptionalNumber(record, [
    "page",
    "page_number",
    "pageNumber",
  ]);

  return page ?? null;
}

/**
 * 백엔드가 반환한 다양한 근거자료 속성을
 * 프론트 공통 구조로 정규화한다.
 */
function normalizeSource(value: unknown): RagSource | null {
  if (typeof value === "string") {
    const filename = value.trim();

    if (!filename) {
      return null;
    }

    return {
      doc_name: filename,
      filename,
      page: null,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const docName = readFirstString(value, [
    "doc_name",
    "filename",
    "file_name",
    "document_name",
    "documentName",
    "name",
    "title",
  ]);

  if (!docName) {
    return null;
  }

  const source: RagSource = {
    doc_name: docName,
    filename: docName,
    page: readPage(value),
  };

  const score = readOptionalNumber(value, [
    "score",
    "relevance_score",
    "relevanceScore",
  ]);

  if (score !== undefined) {
    source.score = score;
  }

  const similarity = readOptionalNumber(value, [
    "similarity",
    "similarity_score",
    "similarityScore",
  ]);

  if (similarity !== undefined) {
    source.similarity = similarity;
  }

  const chunk = readFirstString(value, ["chunk"]);

  if (chunk) {
    source.chunk = chunk;
  }

  const content = readFirstString(value, ["content", "text"]);

  if (content) {
    source.content = content;
  }

  const excerpt = readFirstString(value, [
    "excerpt",
    "snippet",
    "preview",
  ]);

  if (excerpt) {
    source.excerpt = excerpt;
  }

  return source;
}

function normalizeSources(value: unknown): RagSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeSource)
    .filter((source): source is RagSource => source !== null);
}

/**
 * 프론트에서 전달받은 대화기록을 안전한 형식으로 정리한다.
 */
function normalizeHistory(value: unknown): RagChatHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): RagChatHistoryItem | null => {
      if (!isRecord(item)) {
        return null;
      }

      const role = item.role;
      const content = item.content;

      if (
        role !== "user" &&
        role !== "assistant"
      ) {
        return null;
      }

      if (typeof content !== "string" || !content.trim()) {
        return null;
      }

      return {
        role,
        content: content.trim(),
      };
    })
    .filter(
      (item): item is RagChatHistoryItem =>
        item !== null
    );
}

function stringifyUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function getFastApiErrorMessage(
  body: FastApiErrorResponse | null,
  status: number
): string {
  if (!body) {
    return `RAG 서버 요청에 실패했습니다. HTTP ${status}`;
  }

  const detailMessage = stringifyUnknown(body.detail);

  if (detailMessage) {
    return detailMessage;
  }

  const message = stringifyUnknown(body.message);

  if (message) {
    return message;
  }

  const error = stringifyUnknown(body.error);

  if (error) {
    return error;
  }

  return `RAG 서버 요청에 실패했습니다. HTTP ${status}`;
}

async function readErrorResponse(
  response: Response
): Promise<FastApiErrorResponse | null> {
  try {
    return (await response.json()) as FastApiErrorResponse;
  } catch {
    try {
      const text = await response.text();

      return text ? { detail: text } : null;
    } catch {
      return null;
    }
  }
}

/* =========================================================
 * 공개 함수: RAG 질문
 * ======================================================= */

/**
 * 공용 FastAPI의 POST /chat 엔드포인트를 호출한다.
 *
 * 기존 호출 방식:
 * askRagChat(question, history)
 */
export async function askRagChat(
  question: string,
  history: RagChatHistoryItem[] = [],
  gridContext: GridContext | null = null
): Promise<RagChatResponse> {
  const normalizedQuestion =
    typeof question === "string" ? question.trim() : "";

  if (!normalizedQuestion) {
    throw new Error("질문을 입력해 주세요.");
  }

  const payload: RagChatRequest = {
    question: normalizedQuestion,
    history: normalizeHistory(history),
    grid_context:
      gridContext &&
      gridContext.grid_id !== null &&
      gridContext.grid_id !== undefined &&
      String(gridContext.grid_id).trim() !== ""
        ? gridContext
        : null,
  };

  const controller = new AbortController();

  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildRagApiUrl("/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await readErrorResponse(response);

      throw new Error(
        getFastApiErrorMessage(errorBody, response.status)
      );
    }

    const rawData: unknown = await response.json();

    if (!isRecord(rawData)) {
      throw new Error(
        "RAG 서버가 올바르지 않은 형식의 응답을 반환했습니다."
      );
    }

    const answer =
      typeof rawData.answer === "string"
        ? rawData.answer.trim()
        : "";

    if (!answer) {
      throw new Error(
        "RAG 서버가 유효한 답변을 반환하지 않았습니다."
      );
    }

    return {
      answer,
      sources: normalizeSources(rawData.sources),
    };
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "RAG 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        `공용 RAG 서버에 연결하지 못했습니다. 연결 주소: ${RAG_API_BASE}`
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "알 수 없는 RAG 서버 연결 오류가 발생했습니다."
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/* =========================================================
 * 공개 함수: 근거 문서 URL
 * ======================================================= */

/**
 * getRagSourceUrl에서 허용하는 입력 형식
 *
 * 기존 Chatbot.tsx가 아래 중 어느 형태를 넘겨도 처리한다.
 * - "문서명.pdf"
 * - { doc_name: "문서명.pdf", page: 10 }
 * - { filename: "문서명.pdf" }
 * - { name: "문서명.pdf" }
 */
export type RagSourceUrlInput =
  | string
  | RagSource
  | {
      doc_name?: unknown;
      filename?: unknown;
      file_name?: unknown;
      document_name?: unknown;
      documentName?: unknown;
      name?: unknown;
      title?: unknown;
      page?: unknown;
    }
  | null
  | undefined;

function extractFilename(
  source: RagSourceUrlInput
): string {
  if (typeof source === "string") {
    return source.trim();
  }

  if (!isRecord(source)) {
    return "";
  }

  return (
    readFirstString(source, [
      "doc_name",
      "filename",
      "file_name",
      "document_name",
      "documentName",
      "name",
      "title",
    ]) ?? ""
  );
}

/**
 * FastAPI GET /docs/{filename} 주소를 생성한다.
 *
 * 예:
 * getRagSourceUrl("소나무재선충병 방제지침.pdf")
 *
 * getRagSourceUrl({
 *   doc_name: "소나무재선충병 방제지침.pdf",
 *   page: 12
 * })
 */
export function getRagSourceUrl(
  source: RagSourceUrlInput
): string {
  const filename = extractFilename(source);

  if (!filename) {
    return "";
  }

  return buildRagApiUrl(
    `/docs/${encodeURIComponent(filename)}`
  );
}

/**
 * 기존 코드에서 다른 함수명을 사용할 가능성을 고려한 별칭
 */
export const getRagDocumentUrl = getRagSourceUrl;
export const getRagDocUrl = getRagSourceUrl;

/* =========================================================
 * 공개 함수: 상태 확인
 * ======================================================= */

/**
 * 현재 프론트가 사용하는 공용 API 주소를 반환한다.
 */
export function getRagApiBaseUrl(): string {
  return RAG_API_BASE;
}

/**
 * 공용 FastAPI의 GET /health를 호출한다.
 */
export async function checkRagHealth(): Promise<boolean> {
  try {
    const response = await fetch(buildRagApiUrl("/health"), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}