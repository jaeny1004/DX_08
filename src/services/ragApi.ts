const RAG_API_BASE =
  import.meta.env.VITE_RAG_API_BASE ??
  "http://127.0.0.1:8788";

export type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type GridContext = {
  grid_id?: string | number;

  risk_score?: number;
  risk_grade?: string;
  risk_stage_label?: string;

  field_priority_score_v3?: number;
  field_priority_grade_v3?: string;
  priority_stage_label?: string;

  pine_ratio?: number;
  infection_pressure?: number;
  access_score_v3?: number;

  road_class_near?: string;
  road_dist_m?: number;
  river_dist_m?: number;
  env_flag?: number;
};

export type RagSource = {
  doc_name: string;
  page: number;
};

export type RagChatResponse = {
  answer: string;
  sources: RagSource[];
};

async function getErrorMessage(
  response: Response,
): Promise<string> {
  try {
    const body = await response.json();

    if (
      typeof body?.detail === "string"
    ) {
      return body.detail;
    }

    if (
      typeof body?.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // JSON 형식이 아닌 오류 응답은 기본 메시지 사용
  }

  return "백서 RAG 서버 요청에 실패했습니다.";
}

export async function askRagChat(
  question: string,
  history: ChatHistoryItem[] = [],
  gridContext: GridContext | null = null,
): Promise<RagChatResponse> {
  const payload = {
    question,
    history,
    grid_context: gridContext,
  };

  console.log(
    "RAG API 전송 payload:",
    payload,
  );

  const response = await fetch(
    `${RAG_API_BASE}/chat`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response),
    );
  }

  const result =
    (await response.json()) as RagChatResponse;

  return {
    answer:
      result.answer ||
      "답변을 생성하지 못했습니다.",

    sources:
      Array.isArray(result.sources)
        ? result.sources
        : [],
  };
}

export function getRagSourceUrl(
  source: RagSource,
): string {
  const encodedFileName =
    encodeURIComponent(source.doc_name);

  const fileUrl =
    `${RAG_API_BASE}/docs/` +
    encodedFileName;

  if (
    source.doc_name
      .toLowerCase()
      .endsWith(".pdf")
  ) {
    return `${fileUrl}#page=${source.page}`;
  }

  return fileUrl;
}