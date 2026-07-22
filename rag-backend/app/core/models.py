from dataclasses import dataclass, field


@dataclass
class PageText:
    """파서가 반환하는 한 페이지/구획의 텍스트."""
    page: int
    text: str


@dataclass
class Chunk:
    """검색 단위. 임베딩과 출처 메타데이터를 함께 담는다."""
    id: str
    text: str
    doc_name: str
    page: int
    embedding: list[float] = field(default_factory=list)


@dataclass
class SearchResult:
    chunk: Chunk
    score: float  # 코사인 유사도 0.0~1.0 (높을수록 유사)


@dataclass
class Source:
    doc_name: str
    page: int


@dataclass
class Answer:
    text: str
    sources: list[Source]
