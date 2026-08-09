-- rag-backend Supabase 초기 스키마
-- 근거: app/core/embedder.py (임베딩 모델/차원), app/core/supabase_store.py
-- (SupabaseStore가 읽고 쓰는 컬럼·RPC 시그니처), app/core/store.py의 ChromaStore +
-- app/core/chunker.py (현재 Chroma에 저장 중인 메타데이터 필드)와 1:1로 맞춘 스키마.

-- pgvector 확장 활성화
create extension if not exists vector;

-- 문서 청크 저장 테이블
-- 컬럼은 SupabaseStore.add()가 upsert하는 5개 필드와 정확히 일치:
--   id, doc_name, page, text, embedding
-- (chunk 순번은 별도 컬럼 없이 id 문자열에 "{doc_name}::p{page}::c{idx}" 형태로 포함됨 — chunker.py 참고)
create table if not exists document_chunks (
  id text primary key,
  doc_name text not null,
  page integer not null,
  text text not null,
  -- text-embedding-3-small 기본 출력 차원 (embedder.py에서 dimensions 파라미터를
  -- 넘기지 않으므로 OpenAI 기본값 1536을 그대로 사용)
  embedding vector(1536) not null
);

-- delete_doc()의 `.eq("doc_name", doc_name)` 조회/삭제를 위한 인덱스
create index if not exists document_chunks_doc_name_idx
  on document_chunks (doc_name);

-- 코사인 유사도 검색용 벡터 인덱스.
-- ivfflat 대신 hnsw를 사용: ivfflat은 인덱스 생성 시점에 데이터가 어느 정도
-- 있어야 클러스터링 품질이 나오는데, 이 마이그레이션은 데이터가 비어 있는
-- 상태에서 실행되므로 hnsw가 더 안전함.
create index if not exists document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);

-- 코사인 유사도 기반 검색 RPC.
-- 파라미터명(query_embedding, match_count)과 반환 컬럼(id, doc_name, page, text,
-- similarity)은 SupabaseStore.search()가 그대로 넘기고 읽는 이름과 정확히 일치해야 함.
create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_count int
)
returns table (
  id text,
  doc_name text,
  page integer,
  text text,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.doc_name,
    document_chunks.page,
    document_chunks.text,
    -- pgvector의 <=> 는 코사인 거리(0=완전 동일, 2=정반대).
    -- ChromaStore.search()가 1.0 - distance로 유사도를 계산하는 것과 동일한 관례를 맞춤
    -- (score가 클수록 유사 — diversify()가 내림차순 정렬을 전제하므로 일치시켜야 함).
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;

alter table document_chunks enable row level security;

-- 이 테이블은 서버(FastAPI, service_role 키)만 접근한다.
-- anon/authenticated 대상 정책은 의도적으로 만들지 않음 —
-- RLS를 켜고 정책을 비워두면 service_role만 우회 접근 가능해지고
-- 나머지 키는 자동으로 차단됨.
