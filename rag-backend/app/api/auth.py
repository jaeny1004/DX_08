import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.mailer import send_verification_email
from app.core.security import (
    JWT_SECRET_KEY,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.email_verification import EmailVerification
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    EmailAvailabilityResponse,
    EmailCheckRequest,
    LoginRequest,
    SendVerificationRequest,
    SendVerificationResponse,
    SignupRequest,
    UserResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)

router = APIRouter(prefix="/api/auth", tags=["인증"])
bearer_scheme = HTTPBearer(auto_error=False)

VERIFICATION_EXPIRE_SECONDS = int(
    os.environ.get("EMAIL_VERIFICATION_EXPIRE_SECONDS", "300")
)
VERIFICATION_RESEND_SECONDS = int(
    os.environ.get("EMAIL_VERIFICATION_RESEND_SECONDS", "60")
)
VERIFICATION_TOKEN_EXPIRE_SECONDS = int(
    os.environ.get("EMAIL_VERIFICATION_TOKEN_EXPIRE_SECONDS", "900")
)
VERIFICATION_MAX_ATTEMPTS = int(
    os.environ.get("EMAIL_VERIFICATION_MAX_ATTEMPTS", "5")
)
EMAIL_VERIFICATION_PREVIEW_MODE = (
    os.environ.get("EMAIL_VERIFICATION_PREVIEW_MODE", "false").strip().lower()
    == "true"
)
EMAIL_VERIFICATION_PREVIEW_CODE = os.environ.get(
    "EMAIL_VERIFICATION_PREVIEW_CODE",
    "123456",
).strip()


def _utcnow() -> datetime:
    # SQLAlchemy DateTime 기본 설정과 호환되는 naive UTC
    return datetime.utcnow()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_value(value: str) -> str:
    return hashlib.sha256(
        f"{JWT_SECRET_KEY}:{value}".encode("utf-8")
    ).hexdigest()


def _auth_response(user: User) -> AuthResponse:
    token = create_access_token(
        subject=str(user.id),
        extra_claims={
            "email": user.email,
            "role": user.role,
        },
    )
    return AuthResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


def _latest_verification(db: Session, email: str) -> EmailVerification | None:
    return db.scalar(
        select(EmailVerification)
        .where(EmailVerification.email == email)
        .order_by(EmailVerification.id.desc())
        .limit(1)
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload.get("sub", ""))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 인증 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용할 수 없는 계정입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


@router.post("/check-email", response_model=EmailAvailabilityResponse)
def check_email(
    request: EmailCheckRequest,
    db: Session = Depends(get_db),
) -> EmailAvailabilityResponse:
    email = _normalize_email(str(request.email))
    exists = db.scalar(select(User.id).where(User.email == email)) is not None
    return EmailAvailabilityResponse(
        available=not exists,
        message=(
            "이미 가입된 이메일입니다."
            if exists
            else "사용 가능한 이메일입니다."
        ),
    )


@router.post("/send-verification", response_model=SendVerificationResponse)
def send_verification(
    request: SendVerificationRequest,
    db: Session = Depends(get_db),
) -> SendVerificationResponse:
    email = _normalize_email(str(request.email))

    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 이메일입니다.",
        )

    now = _utcnow()
    latest = _latest_verification(db, email)
    if latest is not None:
        elapsed = (now - latest.last_sent_at).total_seconds()
        if elapsed < VERIFICATION_RESEND_SECONDS:
            remaining = max(1, int(VERIFICATION_RESEND_SECONDS - elapsed))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"인증번호는 {remaining}초 후 다시 요청할 수 있습니다.",
            )

    code = (
        EMAIL_VERIFICATION_PREVIEW_CODE
        if EMAIL_VERIFICATION_PREVIEW_MODE
        else f"{secrets.randbelow(1_000_000):06d}"
    )

    verification = EmailVerification(
        email=email,
        code_hash=_hash_value(code),
        verification_token=None,
        expires_at=now + timedelta(seconds=VERIFICATION_EXPIRE_SECONDS),
        verified_at=None,
        attempt_count=0,
        last_sent_at=now,
    )
    db.add(verification)
    db.commit()

    try:
        if not EMAIL_VERIFICATION_PREVIEW_MODE:
            send_verification_email(email, code)
    except Exception as exc:
        db.delete(verification)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="인증 메일 발송에 실패했습니다. SMTP 설정을 확인해 주세요.",
        ) from exc

    message = "인증번호를 이메일로 발송했습니다."
    if EMAIL_VERIFICATION_PREVIEW_MODE:
        message = f"개발용 인증번호는 {code}입니다."

    return SendVerificationResponse(
        message=message,
        expires_in_seconds=VERIFICATION_EXPIRE_SECONDS,
        resend_after_seconds=VERIFICATION_RESEND_SECONDS,
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(
    request: VerifyEmailRequest,
    db: Session = Depends(get_db),
) -> VerifyEmailResponse:
    email = _normalize_email(str(request.email))
    verification = _latest_verification(db, email)
    now = _utcnow()

    if verification is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="먼저 인증번호를 발송해 주세요.",
        )
    if verification.verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 사용된 인증 요청입니다. 인증번호를 다시 발송해 주세요.",
        )
    if verification.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증번호가 만료되었습니다. 다시 발송해 주세요.",
        )
    if verification.attempt_count >= VERIFICATION_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요.",
        )

    verification.attempt_count += 1
    is_valid = hmac.compare_digest(
        verification.code_hash,
        _hash_value(request.code.strip()),
    )
    if not is_valid:
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증번호가 올바르지 않습니다.",
        )

    raw_token = secrets.token_urlsafe(48)
    verification.verification_token = _hash_value(raw_token)
    verification.verified_at = now
    db.commit()

    return VerifyEmailResponse(
        verified=True,
        verification_token=raw_token,
        message="이메일 인증이 완료되었습니다.",
    )


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(
    request: SignupRequest,
    db: Session = Depends(get_db),
) -> AuthResponse:
    email = _normalize_email(str(request.email))

    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 이메일입니다.",
        )

    verification = _latest_verification(db, email)
    now = _utcnow()
    token_hash = _hash_value(request.email_verification_token)

    if (
        verification is None
        or verification.verified_at is None
        or verification.verification_token is None
        or not hmac.compare_digest(verification.verification_token, token_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효한 이메일 인증 정보가 없습니다.",
        )

    if (
        now - verification.verified_at
    ).total_seconds() > VERIFICATION_TOKEN_EXPIRE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 인증 유효시간이 지났습니다. 다시 인증해 주세요.",
        )

    user = User(
        email=email,
        password_hash=hash_password(request.password),
        name=request.name.strip(),
        organization=request.organization.strip(),
        sido_code=request.sido_code.strip() if request.sido_code else None,
        sido_name=request.sido_name.strip() if request.sido_name else None,
        sigungu_code=request.sigungu_code.strip() if request.sigungu_code else None,
        sigungu_name=request.sigungu_name.strip() if request.sigungu_name else None,
        role="manager",
        is_active=True,
    )
    db.add(user)

    try:
        db.flush()
        db.execute(
            delete(EmailVerification).where(EmailVerification.email == email)
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 이메일입니다.",
        )

    db.refresh(user)
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
) -> AuthResponse:
    email = _normalize_email(str(request.email))
    user = db.scalar(select(User).where(User.email == email))

    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다.",
        )

    user.last_login_at = _utcnow()
    db.commit()
    db.refresh(user)
    return _auth_response(user)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
