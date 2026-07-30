import time
from typing import Any


class Embedder:
    def __init__(
        self,
        client: Any = None,
        model: str = "text-embedding-3-small",
        batch_size: int = 64,
        max_retries: int = 8,
    ):
        # openai import/클라이언트 생성은 서버 콜드스타트를 무겁게 하므로
        # 실제 임베딩이 처음 필요할 때까지 지연한다(lazy).
        self._client = client
        self._model = model
        self._batch_size = batch_size
        self._max_retries = max_retries

    def _get_client(self) -> Any:
        if self._client is None:
            from openai import OpenAI

            self._client = OpenAI()
        return self._client

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            out.extend(self._embed_batch(texts[i : i + self._batch_size]))
        return out

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]

    def _embed_batch(self, batch: list[str]) -> list[list[float]]:
        from openai import RateLimitError

        client = self._get_client()
        delay = 2.0
        for attempt in range(self._max_retries):
            try:
                resp = client.embeddings.create(model=self._model, input=batch)
                return [d.embedding for d in resp.data]
            except RateLimitError:
                if attempt == self._max_retries - 1:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 60.0)
        return []  # 도달 불가 (마지막 시도는 raise)
