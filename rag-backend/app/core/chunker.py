from app.core.models import Chunk, PageText


def chunk_pages(
    pages: list[PageText],
    doc_name: str,
    chunk_size: int = 1000,
    overlap: int = 200,
    min_chars: int = 80,
) -> list[Chunk]:
    chunks: list[Chunk] = []
    seen: set[str] = set()  # 동일 텍스트 청크 중복 제거 (반복 보일러플레이트 방지)
    for page in pages:
        text = page.text.strip()
        if not text:
            continue
        start = 0
        while start < len(text):
            piece = text[start : start + chunk_size]
            key = piece.strip()
            # 너무 짧은 청크(제목·구획머리말·서식라벨 등 구조 조각)는 버린다.
            # 이런 조각은 주제어가 밀집해 검색 상위를 독점하면서 실제 답을 못 준다.
            if len(key) >= min_chars and key not in seen:
                seen.add(key)
                idx = len(chunks)
                chunks.append(
                    Chunk(
                        id=f"{doc_name}::p{page.page}::c{idx}",
                        text=piece,
                        doc_name=doc_name,
                        page=page.page,
                    )
                )
            if start + chunk_size >= len(text):
                break
            start += chunk_size - overlap
    return chunks
