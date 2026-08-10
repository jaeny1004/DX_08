import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface IngestRequestBody {
  document_title: string;
  source_name?: string;
  page_number?: number;
  section_title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'POST 요청만 허용됩니다.',
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!openAiApiKey) {
      throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase 서버 환경변수가 없습니다.');
    }

    const body = (await req.json()) as IngestRequestBody;

    const documentTitle = body.document_title?.trim();
    const content = body.content?.trim();

    if (!documentTitle) {
      throw new Error('document_title은 필수입니다.');
    }

    if (!content) {
      throw new Error('content는 필수입니다.');
    }

    const embeddingResponse = await fetch(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: content,
          dimensions: 768,
          encoding_format: 'float',
        }),
      },
    );

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();

      throw new Error(
        `OpenAI 임베딩 생성 실패: ${embeddingResponse.status} ${errorText}`,
      );
    }

    const embeddingResult = await embeddingResponse.json();
    const embedding = embeddingResult.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length !== 768) {
      throw new Error('768차원 임베딩을 생성하지 못했습니다.');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from('rag_documents')
      .insert({
        document_title: documentTitle,
        source_name: body.source_name?.trim() || null,
        page_number: body.page_number ?? null,
        section_title: body.section_title?.trim() || null,
        content,
        embedding,
        metadata: body.metadata ?? {},
      })
      .select(
        `
          id,
          document_title,
          source_name,
          page_number,
          section_title,
          content,
          metadata,
          created_at
        `,
      )
      .single();

    if (error) {
      throw new Error(`Supabase 저장 실패: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'RAG 문단이 저장되었습니다.',
        document: data,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : '알 수 없는 오류가 발생했습니다.';

    console.error('ingest-rag error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});