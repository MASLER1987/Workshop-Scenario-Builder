import json
import logging
import os
import uuid
from asyncio import sleep
from typing import Any
from urllib.parse import urlparse

import asyncpg

from .seed import SCENARIOS

_pool: asyncpg.Pool | None = None
logger = logging.getLogger("prompt_playground.db")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def database_urls() -> list[str]:
    urls = []
    for name in ("DATABASE_URL", "DATABASE_PUBLIC_URL", "POSTGRES_URL"):
        url = os.environ.get(name)
        if url and url not in urls:
            urls.append(url)
    if not urls:
        raise RuntimeError("DATABASE_URL is required")
    return urls


def describe_database_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or "unknown-host"
    port = parsed.port or 5432
    database = parsed.path or ""
    return f"{parsed.scheme}://{host}:{port}{database}"


def connection_variants(url: str) -> list[tuple[str, dict[str, Any]]]:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if "railway" in host or host.endswith(".rlwy.net"):
        return [
            ("SSL disabled", {"ssl": False}),
            ("default SSL negotiation", {}),
            ("SSL required", {"ssl": True}),
        ]
    variants: list[tuple[str, dict[str, Any]]] = [("default SSL negotiation", {})]
    if host.endswith(".railway.internal"):
        return variants
    variants.extend(
        [
            ("SSL disabled", {"ssl": False}),
            ("SSL required", {"ssl": True}),
        ]
    )
    return variants

async def connect() -> None:
    global _pool
    if _pool is not None:
        return
    urls = database_urls()
    attempts = max(1, _env_int("DB_CONNECT_ATTEMPTS", 3))
    timeout = max(1.0, _env_float("DB_CONNECT_TIMEOUT", 8.0))
    min_size = max(0, _env_int("DB_POOL_MIN_SIZE", 1))
    max_size = max(1, _env_int("DB_POOL_MAX_SIZE", 10))
    min_size = min(min_size, max_size)

    async def init(con):
        await con.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await con.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

    for attempt in range(1, attempts + 1):
        for url in urls:
            target = describe_database_url(url)
            for label, options in connection_variants(url):
                try:
                    logger.info(
                        "Connecting to Postgres at %s using %s (attempt %s/%s)",
                        target,
                        label,
                        attempt,
                        attempts,
                    )
                    _pool = await asyncpg.create_pool(
                        url,
                        min_size=min_size,
                        max_size=max_size,
                        init=init,
                        timeout=timeout,
                        command_timeout=30,
                        **options,
                    )
                    return
                except (TimeoutError, OSError, asyncpg.PostgresError):
                    logger.exception(
                        "Could not connect to Postgres at %s using %s within %.1fs. "
                        "Check Railway DATABASE_URL, DATABASE_PUBLIC_URL, the attached Postgres service, and environment.",
                        target,
                        label,
                        timeout,
                    )
        if attempt == attempts:
            raise TimeoutError("Could not connect to any configured Postgres URL")
        await sleep(2)

async def close() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

async def pool() -> asyncpg.Pool:
    if not _pool:
        await connect()
    assert _pool
    return _pool

async def init_db() -> None:
    p = await pool()
    async with p.acquire() as con:
        await con.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
        await con.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY,
          display_name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now(),
          last_active_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS scenarios (
          id UUID PRIMARY KEY,
          title TEXT NOT NULL,
          public_brief TEXT NOT NULL,
          opening_message TEXT NOT NULL,
          hidden_brief TEXT NOT NULL,
          objectives JSONB,
          scorecard JSONB,
          is_active BOOLEAN DEFAULT false
        );
        CREATE TABLE IF NOT EXISTS instructions (
          id UUID PRIMARY KEY,
          session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
          version_number INT NOT NULL,
          text TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE (session_id, version_number)
        );
        CREATE TABLE IF NOT EXISTS runs (
          id UUID PRIMARY KEY,
          session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
          instruction_id UUID REFERENCES instructions(id) ON DELETE SET NULL,
          scenario_id UUID REFERENCES scenarios(id),
          transcript JSONB NOT NULL,
          ended_reason TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS presentation_state (
          id INT PRIMARY KEY DEFAULT 1,
          active_slide_id TEXT NOT NULL,
          active_mode TEXT NOT NULL,
          is_frozen BOOLEAN DEFAULT false,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS participant_questions (
          id UUID PRIMARY KEY,
          session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          slide_id TEXT,
          slide_title TEXT,
          is_answered BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS participant_responses (
          id UUID PRIMARY KEY,
          session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
          slide_id TEXT NOT NULL,
          response_type TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS participant_response_votes (
          response_id UUID REFERENCES participant_responses(id) ON DELETE CASCADE,
          session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT now(),
          PRIMARY KEY (response_id, session_id)
        );
        CREATE TABLE IF NOT EXISTS presentation_artifacts (
          id UUID PRIMARY KEY,
          slide_id TEXT NOT NULL,
          artifact_type TEXT NOT NULL,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE (slide_id, artifact_type)
        );
        CREATE TABLE IF NOT EXISTS presentation_slide_overrides (
          slide_id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS presentation_slides (
          slide_id TEXT PRIMARY KEY,
          position INT NOT NULL,
          payload JSONB NOT NULL,
          is_deleted BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_scenario ON scenarios ((is_active)) WHERE is_active;
        """)
        await con.execute(
            """INSERT INTO presentation_state (id, active_slide_id, active_mode)
               VALUES (1, 'welcome', 'passive')
               ON CONFLICT (id) DO NOTHING"""
        )
        await con.execute("ALTER TABLE runs ADD COLUMN IF NOT EXISTS score JSONB")
        await con.execute("ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS objectives JSONB")
        await con.execute("ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS scorecard JSONB")
        await con.execute("ALTER TABLE participant_questions ADD COLUMN IF NOT EXISTS slide_id TEXT")
        await con.execute("ALTER TABLE participant_questions ADD COLUMN IF NOT EXISTS slide_title TEXT")
        count = await con.fetchval("SELECT count(*) FROM scenarios")
        if count == 0:
            for s in SCENARIOS:
                await con.execute("""INSERT INTO scenarios (id,title,public_brief,opening_message,hidden_brief,objectives,scorecard,is_active)
                    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)""", uuid.UUID(s["id"]), s["title"], s["public_brief"], s["opening_message"], s["hidden_brief"], s["scorecard"]["objectives"], s["scorecard"], s["is_active"])
        for s in SCENARIOS:
            await con.execute(
                """INSERT INTO scenarios (id,title,public_brief,opening_message,hidden_brief,objectives,scorecard,is_active)
                   VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
                   ON CONFLICT (id) DO UPDATE SET
                     title=excluded.title,
                     public_brief=excluded.public_brief,
                     opening_message=excluded.opening_message,
                     hidden_brief=excluded.hidden_brief,
                     objectives=excluded.objectives,
                     scorecard=excluded.scorecard""",
                uuid.UUID(s["id"]),
                s["title"],
                s["public_brief"],
                s["opening_message"],
                s["hidden_brief"],
                s["scorecard"]["objectives"],
                s["scorecard"],
                s["is_active"],
            )

async def fetchrow(q: str, *args: Any):
    return await (await pool()).fetchrow(q, *args)
async def fetch(q: str, *args: Any):
    return await (await pool()).fetch(q, *args)
async def execute(q: str, *args: Any):
    return await (await pool()).execute(q, *args)
