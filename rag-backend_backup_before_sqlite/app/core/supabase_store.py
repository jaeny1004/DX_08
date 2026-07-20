"""Supabase(pgvector) 기반 VectorStore 구현.

ChromaStore와 동일한 인터페이스(add/search/count/delete_doc)를 제공하므로
`VECTOR_BACKEND=supabase` 로 그대로 갈아끼울 수 있다. 유사도 검색은 Supabase의
RPC 함수(match_document_chunks)를 호출한다. (스키마는 supabase_schema.sql 참고)
"""
from app.core.models import Chunk, SearchResult


class SupabaseStore:
    def __init__(
        self,
        client=None,
        url: str | None = None,
        key: str | None = None,
        table: str = "document_chunks",
        rpc: str = "match_document_chunks",
    ):
        if client is None:
            from supabase import create_client

            client = create_client(url, key)
        self._client = client
        self._table = table
        self._rpc = rpc

    def add(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return
        rows = [
            {
                "id": c.id,
                "doc_name": c.doc_name,
                "page": c.page,
                "text": c.text,
                "embedding": c.embedding,
            }
            for c in chunks
        ]
        self._client.table(self._table).upsert(rows).execute()

    def search(self, query_embedding: list[float], k: int) -> list[SearchResult]:
        res = self._client.rpc(
            self._rpc,
            {"query_embedding": query_embedding, "match_count": k},
        ).execute()
        results: list[SearchResult] = []
        for row in res.data or []:
            chunk = Chunk(
                id=row["id"],
                text=row["text"],
                doc_name=row["doc_name"],
                page=int(row["page"]),
            )
            results.append(SearchResult(chunk=chunk, score=float(row["similarity"])))
        return results

    def count(self) -> int:
        res = self._client.table(self._table).select("id", count="exact").execute()
        return res.count or 0

    def delete_doc(self, doc_name: str) -> None:
        self._client.table(self._table).delete().eq("doc_name", doc_name).execute()
