# tests/test_auth_new.py
import pytest
from habitlab.auth import hash_password, verify_password, create_token, decode_token


def test_hash_and_verify_correct_password():
    hashed = hash_password("correct-horse-battery")
    assert verify_password("correct-horse-battery", hashed)


def test_verify_wrong_password_returns_false():
    hashed = hash_password("correct-horse-battery")
    assert not verify_password("wrong-password", hashed)


def test_create_token_returns_string():
    token = create_token()
    assert isinstance(token, str)
    assert len(token) > 20


def test_decode_valid_token():
    token = create_token()
    assert decode_token(token) is True


def test_decode_invalid_token():
    assert decode_token("not.a.jwt") is False


def test_decode_garbage_token():
    assert decode_token("") is False
