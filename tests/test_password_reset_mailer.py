import importlib.util
from pathlib import Path

from fastapi import HTTPException


MODULE_PATH = Path(__file__).resolve().parents[1] / "auth-portal" / "password_reset_mailer.py"
SPEC = importlib.util.spec_from_file_location("password_reset_mailer", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
mailer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mailer)


def set_test_api_key():
    if not mailer.config.has_section("password_reset"):
        mailer.config.add_section("password_reset")
    mailer.config.set("password_reset", "service_api_key", "test-key")


def test_generate_code_returns_eight_digits():
    set_test_api_key()
    code = mailer.generate_code("test-key")["code"]

    assert len(code) == 8
    assert code.isdigit()


def test_generate_code_rejects_missing_internal_key():
    set_test_api_key()

    try:
        mailer.generate_code(None)
    except HTTPException as error:
        assert error.status_code == 401
    else:
        raise AssertionError("A missing internal key must be rejected.")
