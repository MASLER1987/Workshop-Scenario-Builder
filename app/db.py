import json
import os
import uuid
from typing import Any

import asyncpg

from .seed import SCENARIOS

_pool: asyncpg.Pool | None = None

async def connect() -> None:
    global _pool
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    async def init(con):
        await con.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await con.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    _pool = await asyncpg.create_pool(url, min_size=1, max_size=10, init=init)

async def close() -> None:
    if _pool:
        await _pool.close()

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
