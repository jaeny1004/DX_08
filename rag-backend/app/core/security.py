import os
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv

# python-jose 대신 PyJWT 를 쓴다.
# jose[cryptography] 는 HS256 하나만 쓰는데도 cryptography 패키지 전체를 끌고 와
# 배포 번들이 Vercel 함수 225MB 한도를 넘겼다. HS256 은 대칭키라 hmac/hashlib 로
# 충분하고 PyJWT 는 그 경우 cryptography 를 요구하지 않는다.
# encode/decode 시그니처가 같아 호출부는 그대로 둘 수 있었다.
import jwt
from jwt import PyJWTError
from pwdlib import PasswordHash

load_dotenv()

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "").strip()
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256").strip()
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
)

if not JWT_SECRET_KEY:
    raise RuntimeError("필수 환경변수 JWT_SECRET_KEY가 설정되지 않았습니다.")

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return password_hash.verify(plain_password, hashed_password)
    except Exception:
        # MySQL 시절 bcrypt 해시를 그대로 이전한 계정과의 호환 처리
        if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            try:
                import bcrypt

                return bcrypt.checkpw(
                    plain_password.encode("utf-8"),
                    hashed_password.encode("utf-8"),
                )
            except Exception:
                return False
        return False


def create_access_token(
    subject: str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": expire,
    }

    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
    except PyJWTError as exc:
        raise ValueError("유효하지 않거나 만료된 인증 토큰입니다.") from exc
