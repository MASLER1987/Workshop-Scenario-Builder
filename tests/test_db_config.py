import pytest

from app import db


def test_database_urls_uses_available_candidates_in_order(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://primary.example/db")
    monkeypatch.setenv("DATABASE_PUBLIC_URL", "postgresql://public.example/db")
    monkeypatch.setenv("POSTGRES_URL", "postgresql://secondary.example/db")

    assert db.database_urls() == [
        "postgresql://primary.example/db",
        "postgresql://public.example/db",
        "postgresql://secondary.example/db",
    ]


def test_database_urls_removes_duplicates(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://same.example/db")
    monkeypatch.setenv("DATABASE_PUBLIC_URL", "postgresql://same.example/db")

    assert db.database_urls() == ["postgresql://same.example/db"]


def test_database_urls_requires_a_configured_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_PUBLIC_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        db.database_urls()


def test_describe_database_url_hides_credentials():
    described = db.describe_database_url("postgresql://user:secret@example.com:5433/workshop")

    assert described == "postgresql://example.com:5433/workshop"


def test_connection_variants_try_ssl_modes_for_railway_internal_host():
    variants = db.connection_variants("postgresql://user:secret@postgres.railway.internal:5432/railway")

    assert variants == [
        ("SSL disabled", {"ssl": False}),
        ("default SSL negotiation", {}),
        ("SSL required", {"ssl": True}),
    ]


def test_connection_variants_try_ssl_modes_for_public_host():
    variants = db.connection_variants("postgresql://user:secret@hayabusa.proxy.rlwy.net:21530/railway")

    assert variants == [
        ("SSL disabled", {"ssl": False}),
        ("default SSL negotiation", {}),
        ("SSL required", {"ssl": True}),
    ]
