import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    const history: ChatHistoryItem[] =
      Array.isArray(body.history)
        ? body.history
            .filter(
              (item: unknown): item is ChatHistoryItem =>
                typeof item === "object" &&
                item !== null &&
                "role" in item &&
                "content" in item &&
                (
                  (item as ChatHistoryItem).role === "user" ||
                  (item as ChatHistoryItem).role === "assistant"
                ) &&
                typeof (item as ChatHistoryItem).content === "string",
            )
            .slice(-6)
        : [];

    if (!message) {
      return jsonResponse(
        {
          success: false,
          error: "질문 내용이 없습니다.",
        },
        400,
      );
    }

    const openAiApiKey =
      Deno.env.get("OPENAI_API_KEY");

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!openAiApiKey) {
      throw new Error(
        "OPENAI_API_KEY가 설정되지 않았습니다.",
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Supabase 환경변수가 설정되지 않았습니다.",
      );
    }

    /*
     * 1. 사용자 질문을 임베딩으로 변환
     */
    const embeddingResponse = await fetch(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: message,
          dimensions: 768,
        }),
      },
    );

    const embeddingResult =
      await embeddingResponse.json();

    if (!embeddingResponse.ok) {
      throw new Error(
        embeddingResult?.error?.message ??
          "질문 임베딩 생성에 실패했습니다.",
      );
    }

    const queryEmbedding =
      embeddingResult.data?.[0]?.embedding;

    if (!Array.isArray(queryEmbedding)) {
      throw new Error(
        "임베딩 결과를 확인할 수 없습니다.",
      );
    }

    /*
     * 2. Supabase 벡터 검색
     */
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: matchedDocuments,
      error: matchError,
    } = await supabase.rpc(
      "match_rag_documents",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.2,
        match_count: 5,
      },
    );

    if (matchError) {
      throw new Error(
        `문서 검색 실패: ${matchError.message}`,
      );
    }

    const documents =
      Array.isArray(matchedDocuments)
        ? matchedDocuments
        : [];

    const context =
      documents.length > 0
        ? documents
            .map((document, index) => {
              const page =
                document.page_number
                  ? `${document.page_number}쪽`
                  : "페이지 정보 없음";

              return [
                `[참고자료 ${index + 1}]`,
                `문서: ${document.document_title ?? "제목 없음"}`,
                `절: ${document.section_title ?? "절 정보 없음"}`,
                `페이지: ${page}`,
                `내용: ${document.content ?? ""}`,
              ].join("\n");
            })
            .join("\n\n")
        : "검색된 참고 문서가 없습니다.";

    /*
     * 3. 검색 결과를 이용해 최종 답변 생성
     */
    const chatResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: [
                "당신은 소나무재선충병 전문 AI 산림 컨설턴트입니다.",
                "제공된 참고 문서를 가장 우선적인 근거로 사용하세요.",
                "문서에서 확인할 수 없는 내용을 사실처럼 만들어내지 마세요.",
                "근거가 부족하면 문서에서 확인하기 어렵다고 안내하세요.",
                "사용자가 이해하기 쉬운 한국어 존댓말로 답변하세요.",
                "답변이 지나치게 길어지지 않도록 핵심부터 설명하세요.",
              ].join("\n"),
            },

            ...history.map((item) => ({
              role: item.role,
              content: item.content,
            })),

            {
              role: "user",
              content: [
                `사용자 질문: ${message}`,
                "",
                "다음은 검색된 참고 문서입니다.",
                context,
              ].join("\n"),
            },
          ],
        }),
      },
    );

    const chatResult =
      await chatResponse.json();

    if (!chatResponse.ok) {
      throw new Error(
        chatResult?.error?.message ??
          "GPT 답변 생성에 실패했습니다.",
      );
    }

    const answer =
      chatResult.choices?.[0]?.message?.content
        ?.trim();

    if (!answer) {
      throw new Error(
        "GPT 답변 내용이 비어 있습니다.",
      );
    }

    return jsonResponse({
      success: true,
      answer,
      sources: documents.map((document) => ({
        document_title:
          document.document_title ?? null,
        section_title:
          document.section_title ?? null,
        page_number:
          document.page_number ?? null,
        similarity:
          document.similarity ?? null,
      })),
    });
  } catch (error) {
    console.error("chat-rag error:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "알 수 없는 오류가 발생했습니다.",
      },
      500,
    );
  }
});

function jsonResponse(
  data: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json; charset=utf-8",
      },
    },
  );
}