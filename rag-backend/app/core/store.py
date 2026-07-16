from typing import Protocol

import chromadb

from app.core.models import Chunk, SearchResult


class VectorStore(Protocol):
    def add(self, chunks: list[Chunk]) -> None: ...
    def search(self, query_embedding: list[float], k: int) -> list[SearchResult]: ...
    def count(self) -> int: ...


def diversify(
    results: list[SearchResult], k: int, per_doc: int
) -> list[SearchResult]:
    """점수순 후보에서 문서당 최대 per_doc개만 취해 상위 k개를 고른다.

    한 문서가 상위를 독점하는 것을 막아 여러 문서의 근거가 답변에 반영되게 한다.
    입력은 점수 내림차순이라고 가정하며, 순서를 보존한다.
    """
    counts: dict[str, int] = {}
    out: list[SearchResult] = []
    for r in results:
        doc = r.chunk.doc_name
        if counts.get(doc, 0) >= per_doc:
            continue
        counts[doc] = counts.get(doc, 0) + 1
        out.append(r)
        if len(out) >= k:
            break
    return out


class ChromaStore:
    def __init__(self, persist_dir: str, collection: str = "documents"):
        self._client = chromadb.PersistentClient(path=persist_dir)
        self._col = self._client.get_or_create_collection(
            name=collection, metadata={"hnsw:space": "cosine"}
        )

    def add(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return
        # upsert로 재인제스트 시 같은 id를 중복 없이 갱신 (idempotent)
        self._col.upsert(
            ids=[c.id for c in chunks],
            embeddings=[c.embedding for c in chunks],
            documents=[c.text for c in chunks],
            metadatas=[{"doc_name": c.doc_name, "page": c.page} for c in chunks],
        )

    def search(self, query_embedding: list[float], k: int) -> list[SearchResult]:
        if self.count() == 0:
            return []
        res = self._col.query(
            query_embeddings=[query_embedding],
            n_results=min(k, self.count()),
        )
        results: list[SearchResult] = []
        for cid, doc, meta, dist in zip(
            res["ids"][0], res["documents"][0], res["metadatas"][0], res["distances"][0]
        ):
            chunk = Chunk(
                id=cid,
                text=doc,
                doc_name=meta["doc_name"],
                page=int(meta["page"]),
            )
            results.append(SearchResult(chunk=chunk, score=1.0 - float(dist)))
        return results

    def count(self) -> int:
        return self._col.count()

    def delete_doc(self, doc_name: str) -> None:
        """특정 문서의 모든 청크를 삭제한다 (재인제스트 전 정리용)."""
        self._col.delete(where={"doc_name": doc_name})

    def all_chunks(self) -> list[Chunk]:
        """저장된 모든 청크를 임베딩 포함해 반환한다 (Supabase 이전용)."""
        data = self._col.get(include=["embeddings", "documents", "metadatas"])
        out: list[Chunk] = []
        for cid, doc, meta, emb in zip(
            data["ids"], data["documents"], data["metadatas"], data["embeddings"]
        ):
            out.append(
                Chunk(
                    id=cid,
                    text=doc,
                    doc_name=meta["doc_name"],
                    page=int(meta["page"]),
                    # chromadb는 numpy 배열로 돌려주므로 순수 float로 변환한다.
                    # (Supabase 이전 시 JSON 직렬화 가능하도록)
                    embedding=[float(x) for x in emb],
                )
            )
        return out


def make_store():
    """VECTOR_BACKEND 환경변수로 저장소 구현체를 선택한다 (기본: chroma)."""
    import os

    backend = os.environ.get("VECTOR_BACKEND", "chroma").lower()
    if backend == "supabase":
        from app.core.supabase_store import SupabaseStore

        return SupabaseStore(
            url=os.environ["SUPABASE_URL"], key=os.environ["SUPABASE_KEY"]
        )
    return ChromaStore(persist_dir=os.environ.get("CHROMA_DIR", "./data/chroma"))
