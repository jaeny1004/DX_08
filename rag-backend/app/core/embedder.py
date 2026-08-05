import time

from openai import OpenAI, RateLimitError


class Embedder:
    def __init__(
        self,
        client: OpenAI | None = None,
        model: str = "text-embedding-3-small",
        batch_size: int = 64,
        max_retries: int = 8,
    ):
        self._client = client or OpenAI()
        self._model = model
        self._batch_size = batch_size
        self._max_retries = max_retries

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            out.extend(self._embed_batch(texts[i : i + self._batch_size]))
        return out

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]

    def _embed_batch(self, batch: list[str]) -> list[list[float]]:
        delay = 2.0
        for attempt in range(self._max_retries):
            try:
                resp = self._client.embeddings.create(model=self._model, input=batch)
                return [d.embedding for d in resp.data]
            except RateLimitError:
                if attempt == self._max_retries - 1:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 60.0)
        return []  # 도달 불가 (마지막 시도는 raise)
