"""supabase-py 대체 — PostgREST / Storage 를 httpx 로 직접 부른다.

왜 만들었나
    Vercel 함수 225MB 한도에 8MB 차이로 막혀 백엔드를 배포할 수 없었다.
    설치 내역을 Linux 휠 기준으로 재보니 cryptography 가 14.2MB 로 가장 컸다.
    끌고 오는 경로는 이랬다.

        supabase -> supabase-auth -> pyjwt[crypto] -> cryptography (14.2MB)

    그런데 이 프로젝트는 supabase SDK 를 인증에 전혀 쓰지 않는다. 쓰는 것은
    PostgREST 질의와 Storage 파일 접근 두 가지뿐이고, 둘 다 그냥 HTTP 다.
    이미 의존성에 있는 httpx 로 같은 일을 하면 supabase 스택 전체와
    cryptography 가 함께 빠진다.

    (인증 JWT 는 app/core/security.py 가 PyJWT 로 따로 처리한다. 그쪽은
     HS256 이라 cryptography 가 필요 없다.)

무엇을 흉내 냈나
    호출부를 고치지 않으려고 supabase-py 의 체이닝 형태를 그대로 맞췄다.

        client.table("t").select("a,b").eq("k", v).limit(2).execute().data
        client.table("t").select("id", count="exact").execute().count
        client.table("t").upsert(rows).execute()
        client.table("t").update({...}).eq("id", v).execute()
        client.table("t").delete().eq("k", v).execute()
        client.rpc("fn", {...}).execute().data
        client.storage.from_("bucket").download(path)          -> bytes
        client.storage.from_("bucket").upload(path, file, opts)
        client.storage.from_("bucket").remove([paths])
        client.storage.from_("bucket").create_signed_url(path, expires)
                                                    -> {"signedURL": ...}
        client.storage.from_("bucket").get_public_url(path)    -> str

    지원하지 않는 조합을 부르면 조용히 넘어가지 않고 예외를 던진다.
    SDK 를 되살릴 일이 생기면 create_client 임포트만 되돌리면 된다.
"""

from __future__ import annotations

from typing import Any, Iterable
from urllib.parse import quote

import httpx

DEFAULT_TIMEOUT = 60.0


class SupabaseRestError(RuntimeError):
    """PostgREST / Storage 가 2xx 가 아닌 응답을 준 경우."""

    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"HTTP {status_code}: {body[:400]}")
        self.status_code = status_code
        self.body = body


class Response:
    """supabase-py 의 APIResponse 중 이 프로젝트가 쓰는 부분만."""

    def __init__(self, data: Any, count: int | None = None) -> None:
        self.data = data
        self.count = count


class _Query:
    """PostgREST 질의 빌더. execute() 를 부를 때 한 번만 요청한다."""

    def __init__(self, client: "Client", table: str) -> None:
        self._client = client
        self._table = table

        self._method = "GET"
        self._select = "*"
        self._filters: list[tuple[str, str]] = []
        self._params: dict[str, str] = {}
        self._body: Any = None
        self._count: str | None = None
        self._prefer: list[str] = []

    # --- 질의 종류 ---
    def select(self, columns: str = "*", count: str | None = None) -> "_Query":
        self._method = "GET"
        self._select = columns
        if count:
            self._count = count
        return self

    def insert(self, rows: Any) -> "_Query":
        self._method = "POST"
        self._body = rows
        self._prefer.append("return=representation")
        return self

    def upsert(self, rows: Any, on_conflict: str | None = None) -> "_Query":
        self._method = "POST"
        self._body = rows
        self._prefer.append("resolution=merge-duplicates")
        self._prefer.append("return=representation")
        if on_conflict:
            self._params["on_conflict"] = on_conflict
        return self

    def update(self, patch: dict[str, Any]) -> "_Query":
        self._method = "PATCH"
        self._body = patch
        self._prefer.append("return=representation")
        return self

    def delete(self) -> "_Query":
        self._method = "DELETE"
        self._prefer.append("return=representation")
        return self

    # --- 조건 ---
    def eq(self, column: str, value: Any) -> "_Query":
        self._filters.append((column, f"eq.{value}"))
        return self

    def in_(self, column: str, values: Iterable[Any]) -> "_Query":
        joined = ",".join(str(value) for value in values)
        self._filters.append((column, f"in.({joined})"))
        return self

    def order(self, column: str, desc: bool = False) -> "_Query":
        self._params["order"] = f"{column}.{'desc' if desc else 'asc'}"
        return self

    def limit(self, count: int) -> "_Query":
        self._params["limit"] = str(count)
        return self

    # --- 실행 ---
    def execute(self) -> Response:
        params: dict[str, str] = dict(self._params)
        if self._method == "GET":
            params["select"] = self._select
        for column, expression in self._filters:
            params[column] = expression

        headers = dict(self._client._headers)
        if self._prefer:
            headers["Prefer"] = ",".join(self._prefer)
        if self._count:
            # count 만 필요한 경우가 대부분이라 본문은 한 행만 받는다.
            headers["Prefer"] = ",".join(
                [*self._prefer, f"count={self._count}"]
            ).strip(",")
            headers["Range"] = "0-0"

        response = self._client._http.request(
            self._method,
            f"/rest/v1/{self._table}",
            params=params,
            headers=headers,
            json=self._body if self._body is not None else None,
        )

        if response.status_code >= 300:
            raise SupabaseRestError(response.status_code, response.text)

        total: int | None = None
        if self._count:
            content_range = response.headers.get("content-range", "")
            tail = content_range.split("/")[-1]
            total = int(tail) if tail.isdigit() else None

        data: Any = []
        if response.content:
            try:
                data = response.json()
            except ValueError:
                data = []

        return Response(data=data, count=total)


class _Bucket:
    """Storage 한 버킷에 대한 조작."""

    def __init__(self, client: "Client", bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def _path(self, prefix: str, path: str) -> str:
        # Storage key 에는 한글·공백이 들어갈 수 있어 세그먼트 단위로 인코딩한다.
        encoded = "/".join(quote(part, safe="") for part in path.split("/"))
        return f"/storage/v1/{prefix}/{self._bucket}/{encoded}"

    def download(self, path: str) -> bytes:
        response = self._client._http.get(
            self._path("object", path), headers=self._client._headers
        )
        if response.status_code >= 300:
            raise SupabaseRestError(response.status_code, response.text)
        return response.content

    def upload(
        self,
        path: str,
        file: bytes,
        file_options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers = dict(self._client._headers)
        options = file_options or {}
        headers["Content-Type"] = str(
            options.get("content-type")
            or options.get("contentType")
            or "application/octet-stream"
        )
        # 같은 경로에 다시 올릴 수 있어야 하는 곳이 있어 기본을 덮어쓰기로 둔다.
        if str(options.get("upsert", "true")).lower() == "true":
            headers["x-upsert"] = "true"

        response = self._client._http.post(
            self._path("object", path), headers=headers, content=file
        )
        if response.status_code >= 300:
            raise SupabaseRestError(response.status_code, response.text)
        return {"path": path}

    def remove(self, paths: list[str]) -> dict[str, Any]:
        response = self._client._http.request(
            "DELETE",
            f"/storage/v1/object/{self._bucket}",
            headers={**self._client._headers, "Content-Type": "application/json"},
            json={"prefixes": paths},
        )
        if response.status_code >= 300:
            raise SupabaseRestError(response.status_code, response.text)
        return {"data": paths}

    def create_signed_url(
        self,
        path: str,
        expires_in: int,
        options: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        body: dict[str, Any] = {"expiresIn": expires_in}
        if options and options.get("download"):
            body["transform"] = None
            body["download"] = options["download"]

        response = self._client._http.post(
            self._path("object/sign", path),
            headers={**self._client._headers, "Content-Type": "application/json"},
            json=body,
        )
        if response.status_code >= 300:
            raise SupabaseRestError(response.status_code, response.text)

        signed = response.json().get("signedURL") or response.json().get("signedUrl")
        if not signed:
            raise SupabaseRestError(response.status_code, response.text)

        # SDK 는 절대 URL 을 돌려주므로 형태를 맞춘다.
        if signed.startswith("/"):
            signed = f"{self._client._url}/storage/v1{signed}"
        elif not signed.startswith("http"):
            signed = f"{self._client._url}/storage/v1/{signed}"

        return {"signedURL": signed, "signedUrl": signed}

    def get_public_url(self, path: str) -> str:
        encoded = "/".join(quote(part, safe="") for part in path.split("/"))
        return f"{self._client._url}/storage/v1/object/public/{self._bucket}/{encoded}"


class _Storage:
    def __init__(self, client: "Client") -> None:
        self._client = client

    def from_(self, bucket: str) -> _Bucket:
        return _Bucket(self._client, bucket)


class Client:
    def __init__(self, url: str, key: str, timeout: float = DEFAULT_TIMEOUT) -> None:
        self._url = url.rstrip("/")
        self._headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
        }
        self._http = httpx.Client(base_url=self._url, timeout=timeout)
        self.storage = _Storage(self)

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rpc(self, name: str, params: dict[str, Any] | None = None) -> "_Rpc":
        return _Rpc(self, name, params or {})


class _Rpc:
    def __init__(self, client: Client, name: str, params: dict[str, Any]) -> None:
        self._client = client
        self._name = name
        self._params = params

    def execute(self) -> Response:
        response = self._client._http.post(
            f"/rest/v1/rpc/{self._name}",
            headers={**self._client._headers, "Content-Type": "application/json"},
            json=self._params,
        )
        if response.status_code >= 300:
            raise SupabaseRestError(response.status_code, response.text)
        return Response(data=response.json() if response.content else [])


def create_client(url: str, key: str) -> Client:
    """supabase.create_client 와 같은 자리에서 쓰도록 이름을 맞췄다."""
    return Client(url, key)
