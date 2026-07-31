import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()

    if not value:
        raise RuntimeError(
            f"필수 메일 환경변수 {name}가 설정되지 않았습니다."
        )

    return value


def send_verification_email(
    recipient: str,
    code: str,
) -> None:
    smtp_host = _required_env("SMTP_HOST")
    smtp_port = int(
        os.environ.get("SMTP_PORT", "587")
    )
    smtp_user = _required_env("SMTP_USER")
    smtp_password = _required_env(
        "SMTP_PASSWORD"
    )
    from_email = _required_env(
        "SMTP_FROM_EMAIL"
    )

    message = EmailMessage()
    message["Subject"] = (
        "[소나무재선충병 플랫폼] 이메일 인증번호"
    )
    message["From"] = from_email
    message["To"] = recipient

    message.set_content(
        "소나무재선충병 통합 예찰·방제지원 플랫폼\n\n"
        f"이메일 인증번호는 {code}입니다.\n\n"
        "인증번호는 5분 동안 유효합니다.\n"
        "본인이 요청하지 않았다면 이 메일을 무시해 주세요."
    )

    with smtplib.SMTP(
        smtp_host,
        smtp_port,
        timeout=20,
    ) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()

        smtp.login(
            smtp_user,
            smtp_password,
        )
        smtp.send_message(message)