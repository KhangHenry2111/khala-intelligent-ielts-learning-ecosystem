import configparser
import hmac
import json
import logging
import random
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


logger = logging.getLogger("password_reset_mailer")
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
config = configparser.ConfigParser(interpolation=None)
config.read(Path(__file__).resolve().parents[1] / "config.cfg", encoding="utf-8")


class SendCodeRequest(BaseModel):
    method: Literal["email", "phone"]
    destination: str = Field(min_length=1, max_length=255)
    code: str = Field(pattern=r"^\d{8}$")


def require_internal_key(api_key: str | None) -> None:
    expected = config.get("password_reset", "service_api_key", fallback="").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Password-reset service API key is not configured.")
    if not api_key or not hmac.compare_digest(api_key, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")


@app.post("/generate-code")
def generate_code(x_internal_api_key: str | None = Header(default=None)) -> dict[str, str]:
    require_internal_key(x_internal_api_key)
    return {"code": str(random.randint(10_000_000, 99_999_999))}


def send_email(destination: str, code: str) -> None:
    settings = config["smtp"] if config.has_section("smtp") else {}
    host = settings.get("host", "").strip()
    sender = settings.get("sender", "").strip()
    if not host or not sender:
        raise HTTPException(status_code=503, detail="SMTP settings are not configured.")

    message = EmailMessage()
    message["Subject"] = "Your IELTS account password reset code"
    message["From"] = sender
    message["To"] = destination
    message.set_content(
        f"Your password reset code is {code}. It expires in 10 minutes. "
        "If you did not request this code, you can ignore this message."
    )

    port = settings.getint("port", fallback=587)
    username = settings.get("username", "").strip()
    password = settings.get("password", "")
    timeout = settings.getint("timeout_seconds", fallback=15)
    use_ssl = settings.getboolean("use_ssl", fallback=False)
    use_starttls = settings.getboolean("use_starttls", fallback=True)

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as server:
            if username:
                server.login(username, password)
            server.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=timeout) as server:
        if use_starttls:
            server.starttls(context=ssl.create_default_context())
        if username:
            server.login(username, password)
        server.send_message(message)


def send_sms(destination: str, code: str) -> None:
    settings = config["sms"] if config.has_section("sms") else {}
    endpoint = settings.get("endpoint", "").strip()
    token = settings.get("bearer_token", "").strip()
    if not endpoint or not token:
        raise HTTPException(status_code=503, detail="SMS API settings are not configured.")

    sender = settings.get("sender", "").strip()
    payload = json.dumps({
        "to": destination,
        "from": sender,
        "message": f"Your IELTS password reset code is {code}. It expires in 10 minutes.",
    }).encode("utf-8")
    request = Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            if not 200 <= response.status < 300:
                raise HTTPException(status_code=502, detail="The SMS provider rejected the request.")
    except HTTPError as exc:
        logger.error("SMS provider returned HTTP %s.", exc.code)
        raise HTTPException(status_code=502, detail="The SMS provider rejected the request.") from exc
    except URLError as exc:
        logger.error("Could not reach SMS provider: %s", exc.reason)
        raise HTTPException(status_code=502, detail="The SMS provider could not be reached.") from exc


@app.post("/send-code")
def send_code(
    request: SendCodeRequest,
    x_internal_api_key: str | None = Header(default=None),
) -> dict[str, bool]:
    require_internal_key(x_internal_api_key)
    try:
        if request.method == "email":
            send_email(request.destination, request.code)
        else:
            send_sms(request.destination, request.code)
    except HTTPException:
        raise
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Could not deliver password-reset code.")
        raise HTTPException(status_code=502, detail="The verification code could not be delivered.") from exc
    return {"success": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
