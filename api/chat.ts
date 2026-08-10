/*
 * RAG 챗봇 — 백엔드 없이 이 함수 안에서 끝낸다.
 *
 * 원래는 웹 백엔드(rag-backend-rho)의 POST /chat 을 프록시했다. 그런데
 *   - 브라우저에서 직접 부르면 CORS 에 막히고
 *   - 백엔드 재배포가 Vercel 함수 225MB 한도에 걸려 안 되며(실측 233MB)
 *   - 배포된 백엔드의 SUPABASE_KEY 가 폐기된 옛 키라 검색이 401 로 죽는다
 * 세 가지가 겹쳐 프록시로는 살릴 수 없었다.
 *
 * 그래서 백엔드가 하던 일을 그대로 옮겼다. 하는 일은 세 단계뿐이다.
 *   1. 질문을 임베딩          (text-embedding-3-small)
 *   2. pgvector 유사도 검색   (RPC match_document_chunks, k=8)
 *   3. 근거를 붙여 답변 생성  (gpt-4o-mini, temperature 0.1)
 *
 * 프롬프트와 응답 형식은 백엔드 app/core/generator.py 를 그대로 따랐다.
 * 두 곳의 답이 갈리면 안 되므로, 한쪽을 고치면 다른 쪽도 함께 고쳐야 한다.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL;

/* document_chunks 는 anon 에 열려 있지 않아 service_role 이 필요하다. 브라우저에 나가지 않는다. */
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const EMBED_MODEL =
  process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

const MATCH_COUNT = 8;

/* 백엔드 app/core/generator.py 의 SYSTEM_PROMPT 와 동일해야 한다 */
const SYSTEM_PROMPT = `당신은 소나무재선충병 예찰·방제 업무를 지원하는 근거 기반 AI입니다.

제공될 수 있는 정보는 두 종류입니다.
1. 지도 또는 GeoJSON에서 조회한 500m 격자 분석값
2. 백서·방제지침·연구자료에서 검색한 문서 근거

반드시 다음 원칙을 지키세요.
1. 특정 격자 질문은 [격자 분석정보]를 우선 설명합니다.
2. 격자 ID를 문서에서 찾으려 하지 않습니다.
3. 위험도는 감염 확정값이 아니라 신규 발생 가능성 예측값입니다.
4. 위험도와 예찰 우선순위는 별도 지표로 구분합니다.
5. 수치형 정보는 제공된 격자 값만 사용하고 임의로 만들지 않습니다.
6. 조치와 행정 기준은 문서 근거가 있을 때만 연결합니다.
7. 감염 확정, 방제 확정 대신 후보지역·우선 검토·현장 확인 필요라고 표현합니다.
8. 답변은 한국어로 간결하고 실무적으로 작성합니다.
9. 문서명과 페이지는 시스템이 별도로 표시하므로 임의 출처를 만들지 않습니다.`;

/* 격자를 함께 물어본 경우 */
const ANSWER_GUIDE_WITH_GRID = `답변 순서:
1. 격자 ID와 위험도부터 설명합니다.
2. 위험도와 예찰 우선순위를 구분합니다.
3. 제공된 소나무 비율, 감염압력, 접근성 등을 해석합니다.
4. 문서 근거가 있으면 현장 확인 또는 조치 방향을 연결합니다.
5. AI 예측은 감염 확정이 아니며 현장 확인이 필요하다고 안내합니다.`;

/*
 * 격자 없이 물어본 경우.
 *
 * 현장 앱에는 지도가 없어 격자를 보낼 일이 거의 없다. 그런데 프롬프트에
 * "선택된 격자가 없습니다"를 넣어 두면 모델이 격자 이야기부터 꺼내며
 * "격자를 선택해 주세요"로 회피한다. 실제로 그렇게 나왔다.
 * 격자가 없을 때는 격자 항목을 아예 빼고 문서 근거로 답하게 한다.
 */
const ANSWER_GUIDE_DOCS_ONLY = `답변 순서:
1. 질문에 대해 문서 근거를 바탕으로 바로 답합니다.
   격자가 선택되지 않았다는 안내는 하지 않습니다.
2. 예찰과 방제 기준을 구분해 설명합니다.
3. 근거가 부족한 부분은 단정하지 않고 확인이 필요하다고 적습니다.
4. 감염 확정 대신 후보지역·우선 검토·현장 확인 필요로 표현합니다.`;

type Chunk = {
  doc_name: string;
  page: number;
  text: string;
  similarity: number;
};

async function embed(question: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: question }),
  });

  if (!res.ok) {
    throw new Error(
      `임베딩 실패 HTTP ${res.status} ${(await res.text()).slice(0, 160)}`,
    );
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

async function search(embedding: number[]): Promise<Chunk[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/match_document_chunks`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY as string,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: MATCH_COUNT,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `문서 검색 실패 HTTP ${res.status} ${(await res.text()).slice(0, 160)}`,
    );
  }

  return (await res.json()) as Chunk[];
}

function buildDocumentContext(chunks: Chunk[]): string {
  if (chunks.length === 0) {
    return '관련 문서 근거가 검색되지 않았습니다.';
  }

  return chunks
    .map(
      (chunk, index) =>
        `[근거 ${index + 1} | ${chunk.doc_name} | p.${chunk.page}]\n` +
        chunk.text.trim(),
    )
    .join('\n\n');
}

/** 같은 문서·페이지는 한 번만 출처로 남긴다 */
function uniqueSources(chunks: Chunk[]) {
  const seen = new Set<string>();
  const sources: { doc_name: string; page: number }[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.doc_name}::${chunk.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ doc_name: chunk.doc_name, page: chunk.page });
  }
  return sources;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ detail: 'POST 만 지원합니다.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    return response
      .status(500)
      .json({ detail: '서버 환경변수가 설정되지 않았습니다.' });
  }

  const body = (request.body ?? {}) as {
    question?: string;
    history?: { role?: string; content?: string }[];
    grid_context?: Record<string, unknown> | null;
  };

  const question = (body.question || '').trim();
  if (!question) {
    return response.status(400).json({ detail: '질문이 비어 있습니다.' });
  }

  try {
    /* 검색이 실패해도 답변은 시도한다. 백엔드도 같은 방식으로 견딘다. */
    let chunks: Chunk[] = [];
    try {
      chunks = (await search(await embed(question))).filter(
        (chunk) => chunk.text && chunk.text.trim(),
      );
    } catch (searchError) {
      console.error('문서 검색 경고:', searchError);
    }

    const gridContext = body.grid_context;
    const hasGrid =
      !!gridContext && Object.keys(gridContext).length > 0;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    for (const message of (body.history ?? []).slice(-6)) {
      const role = message?.role;
      const content = String(message?.content ?? '').trim();
      if ((role === 'user' || role === 'assistant') && content) {
        messages.push({ role, content });
      }
    }

    messages.push({
      role: 'user',
      content:
        `[사용자 질문]\n${question}\n\n` +
        (hasGrid
          ? `[격자 분석정보]\n${JSON.stringify(gridContext, null, 2)}\n\n`
          : '') +
        `[문서 근거]\n${buildDocumentContext(chunks)}\n\n` +
        (hasGrid ? ANSWER_GUIDE_WITH_GRID : ANSWER_GUIDE_DOCS_ONLY),
    });

    const completion = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          temperature: 0.1,
        }),
      },
    );

    if (!completion.ok) {
      const detail = await completion.text();
      throw new Error(
        `답변 생성 실패 HTTP ${completion.status} ${detail.slice(0, 160)}`,
      );
    }

    const json = (await completion.json()) as {
      choices: { message: { content: string } }[];
    };

    const answer =
      json.choices?.[0]?.message?.content?.trim() ||
      '문서 근거를 확인했지만 답변을 생성하지 못했습니다.';

    return response
      .status(200)
      .json({ answer, sources: uniqueSources(chunks) });
  } catch (error) {
    console.error('chat 실패:', error);
    return response.status(500).json({
      detail:
        error instanceof Error
          ? error.message
          : '답변 생성 중 알 수 없는 오류가 발생했습니다.',
    });
  }
}
