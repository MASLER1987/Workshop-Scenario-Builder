import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from io import BytesIO

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db
from .evaluation import evaluate_transcript
from .seed import GENERIC_PARTICIPANT_BRIEF
from .simulation import ndjson, stream_simulation_events

locks: set[str] = set()
WAITING_FOR_SLOT = "Waiting for a slot..."


def _max_active_runs() -> int:
    try:
        return max(1, int(os.environ.get("MAX_ACTIVE_RUNS", "10")))
    except ValueError:
        return 10


_llm_slots = asyncio.Semaphore(_max_active_runs())

class SessionIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)

class RunIn(BaseModel):
    instruction_text: str = Field(max_length=4000)

class QuestionIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)

class ResponseIn(BaseModel):
    slide_id: str = Field(min_length=1, max_length=80)
    response_type: str = Field(min_length=1, max_length=40)
    payload: dict = Field(default_factory=dict)

class PresentationActivateIn(BaseModel):
    slide_id: str = Field(min_length=1, max_length=80)
    mode: str = Field(min_length=1, max_length=40)

class PresentationFreezeIn(BaseModel):
    is_frozen: bool

class ArtifactIn(BaseModel):
    slide_id: str = Field(min_length=1, max_length=80)
    artifact_type: str = Field(min_length=1, max_length=60)
    payload: dict = Field(default_factory=dict)

class SlideOverrideIn(BaseModel):
    payload: dict = Field(default_factory=dict)

class SlideIn(BaseModel):
    payload: dict = Field(default_factory=dict)

class SlideDeckIn(BaseModel):
    slides: list[dict] = Field(default_factory=list)

class SlideOrderIn(BaseModel):
    slide_ids: list[str] = Field(default_factory=list)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect(); await db.init_db()
    yield
    await db.close()

app = FastAPI(title="Prompt Playground", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")

def rowdict(r):
    return dict(r) if r else None


def participant_scenario_payload() -> dict[str, str]:
    return {"title": "Family team enquiry", "public_brief": GENERIC_PARTICIPANT_BRIEF}

SLIDE_MODES = {
    "welcome": "passive",
    "legal-tech": "passive",
    "legal-engineering": "passive",
    "skills-careers": "passive",
    "careers-map": "passive",
    "challenge-bridge": "passive",
    "baseline-build": "bot",
    "baseline-results": "results",
    "requirements-gathering": "requirements",
    "requirements-build": "bot",
    "process-map": "process",
    "process-inspection": "passive",
    "debrief": "passive",
    "qna-review": "qna",
    "careers-wrap": "qna",
}

def slide_interaction_config(slide_id: str) -> dict:
    if slide_id == "requirements-gathering":
        return {"maxLength": 160, "placeholder": "What should the intake bot collect, avoid, or explain?"}
    if slide_id == "process-map":
        return {"maxLength": 100, "placeholder": "Suggest a stage in matter intake."}
    return {}

async def captured_requirements() -> dict | None:
    row = await db.fetchrow(
        "SELECT payload FROM presentation_artifacts WHERE slide_id='requirements-gathering' AND artifact_type='captured_requirements'"
    )
    return row["payload"] if row else None

async def slide_interaction_payload(slide_id: str) -> dict:
    interaction = slide_interaction_config(slide_id)
    row = await db.fetchrow("SELECT payload FROM presentation_slide_overrides WHERE slide_id=$1", slide_id)
    override = row["payload"] if row else {}
    if isinstance(override, dict) and isinstance(override.get("interaction"), dict):
        interaction = {**interaction, **override["interaction"]}
    return interaction

async def require_session(sid: uuid.UUID):
    s = await db.fetchrow("SELECT * FROM sessions WHERE id=$1", sid)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


def select_run_scenario_sql() -> str:
    return "SELECT * FROM scenarios ORDER BY random() LIMIT 1"

def podium_auth(key: str | None):
    if not key or key != os.environ.get("PODIUM_KEY"):
        raise HTTPException(403, "Invalid podium key")

async def active_scenario():
    sid = os.environ.get("ACTIVE_SCENARIO_ID")
    if sid:
        row = await db.fetchrow("SELECT * FROM scenarios WHERE id=$1", uuid.UUID(sid))
    else:
        row = await db.fetchrow("SELECT * FROM scenarios WHERE is_active=true LIMIT 1")
    if not row:
        raise HTTPException(500, "No active scenario")
    return row

async def run_scenario():
    sid = os.environ.get("ACTIVE_SCENARIO_ID")
    if sid:
        row = await db.fetchrow("SELECT * FROM scenarios WHERE id=$1", uuid.UUID(sid))
    else:
        row = await db.fetchrow(select_run_scenario_sql())
    if not row:
        raise HTTPException(500, "No scenario available")
    return row

@app.get("/")
async def index():
    return FileResponse("static/index.html", headers={"Cache-Control": "no-store"})

@app.get("/podium")
async def podium(key: str | None = None):
    podium_auth(key)
    return FileResponse("static/podium.html", headers={"Cache-Control": "no-store"})

@app.get("/health")
async def health(): return {"ok": True}

@app.get("/api/qr")
async def qr_code(text: str = Query(..., min_length=1, max_length=500)):
    import qrcode
    import qrcode.image.svg

    image = qrcode.make(
        text,
        image_factory=qrcode.image.svg.SvgPathImage,
        border=2,
        box_size=12,
    )
    buffer = BytesIO()
    image.save(buffer)
    return Response(
        content=buffer.getvalue(),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )

@app.get("/api/presentation/state")
async def presentation_state():
    row = await db.fetchrow("SELECT * FROM presentation_state WHERE id=1")
    if not row:
        await db.execute("INSERT INTO presentation_state (id, active_slide_id, active_mode) VALUES (1,'welcome','passive')")
        row = await db.fetchrow("SELECT * FROM presentation_state WHERE id=1")
    slide_id = row["active_slide_id"]
    mode = row["active_mode"] or SLIDE_MODES.get(slide_id, "passive")
    requirements = await captured_requirements()
    return {
        "active_slide_id": slide_id,
        "participant_mode": mode,
        "is_frozen": row["is_frozen"],
        "interaction": await slide_interaction_payload(slide_id),
        "captured_requirements": requirements,
        "updated_at": row["updated_at"],
    }

@app.get("/api/presentation/responses")
async def presentation_responses(slide_id: str):
    rows = await db.fetch(
        """SELECT r.id, r.slide_id, r.response_type, r.payload, r.created_at,
                  coalesce((SELECT count(*) FROM participant_response_votes v WHERE v.response_id=r.id),0) votes
           FROM participant_responses r
           WHERE r.slide_id=$1
           ORDER BY votes DESC, r.created_at DESC
           LIMIT 80""",
        slide_id,
    )
    return [dict(r) for r in rows]

@app.post("/api/sessions")
async def create_session(body: SessionIn):
    sid = uuid.uuid4()
    await db.execute("INSERT INTO sessions (id, display_name) VALUES ($1,$2)", sid, body.display_name.strip())
    return {"session_id": str(sid)}

@app.get("/api/sessions/{sid}/state")
async def session_state(sid: uuid.UUID):
    s = await db.fetchrow("SELECT * FROM sessions WHERE id=$1", sid)
    if not s: raise HTTPException(404, "Session not found")
    inst = await db.fetchrow("SELECT * FROM instructions WHERE session_id=$1 ORDER BY version_number DESC LIMIT 1", sid)
    run = await db.fetchrow("SELECT * FROM runs WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1", sid)
    return {"display_name": s["display_name"], "latest_instruction": rowdict(inst), "latest_run": rowdict(run), "active_scenario": participant_scenario_payload(), "captured_requirements": await captured_requirements()}

@app.post("/api/sessions/{sid}/questions")
async def submit_question(sid: uuid.UUID, body: QuestionIn):
    await require_session(sid)
    row = await db.fetchrow(
        "INSERT INTO participant_questions (id, session_id, text) VALUES ($1,$2,$3) RETURNING *",
        uuid.uuid4(),
        sid,
        body.text.strip(),
    )
    return {"question": rowdict(row)}

@app.post("/api/sessions/{sid}/responses")
async def submit_response(sid: uuid.UUID, body: ResponseIn):
    await require_session(sid)
    row = await db.fetchrow(
        "INSERT INTO participant_responses (id, session_id, slide_id, response_type, payload) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *",
        uuid.uuid4(),
        sid,
        body.slide_id,
        body.response_type,
        body.payload,
    )
    return {"response": rowdict(row)}

@app.post("/api/sessions/{sid}/responses/{response_id}/vote")
async def vote_response(sid: uuid.UUID, response_id: uuid.UUID):
    await require_session(sid)
    exists = await db.fetchrow("SELECT id FROM participant_responses WHERE id=$1", response_id)
    if not exists:
        raise HTTPException(404, "Response not found")
    await db.execute(
        "INSERT INTO participant_response_votes (response_id, session_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        response_id,
        sid,
    )
    return {"ok": True}

async def _prepare_run(sid: uuid.UUID, instruction_text: str | None):
    key = str(sid)
    if key in locks: raise HTTPException(409, "A run is already in flight for this session")
    locks.add(key)
    try:
        async with (await db.pool()).acquire() as con:
            s = await con.fetchrow("SELECT * FROM sessions WHERE id=$1", sid)
            if not s: raise HTTPException(404, "Session not found")
            latest = await con.fetchrow("SELECT * FROM instructions WHERE session_id=$1 ORDER BY version_number DESC LIMIT 1", sid)
            if instruction_text is None:
                if not latest: raise HTTPException(422, "No instruction to rerun")
                inst = latest
            elif latest and latest["text"] == instruction_text:
                inst = latest
            else:
                ver = (latest["version_number"] if latest else 0) + 1
                inst = await con.fetchrow("INSERT INTO instructions (id,session_id,version_number,text) VALUES ($1,$2,$3,$4) RETURNING *", uuid.uuid4(), sid, ver, instruction_text)
            scen = await run_scenario()
        return {"run_id": uuid.uuid4(), "session_id": sid, "instruction": inst, "scenario": dict(scen)}
    except Exception:
        locks.discard(key)
        raise

async def _persist_run(prepared: dict, transcript: list[dict[str, str]], ended_reason: str, score: dict | None = None):
    await db.execute(
        "INSERT INTO runs (id,session_id,instruction_id,scenario_id,transcript,ended_reason,score) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)",
        prepared["run_id"],
        prepared["session_id"],
        prepared["instruction"]["id"],
        prepared["scenario"]["id"],
        transcript,
        ended_reason,
        score,
    )
    await db.execute("UPDATE sessions SET last_active_at=now() WHERE id=$1", prepared["session_id"])

async def _stream_prepared_run(prepared: dict):
    transcript: list[dict[str, str]] = []
    ended_reason = "error"
    score = None
    persisted = False
    acquired_slot = False
    try:
        yield ndjson({"type": "run_start", "version_number": prepared["instruction"]["version_number"]})
        if _llm_slots.locked():
            yield ndjson({"type": "status", "text": WAITING_FOR_SLOT})
        await _llm_slots.acquire()
        acquired_slot = True
        async with asyncio.timeout(90):
            async for event in stream_simulation_events(
                prepared["instruction"]["text"],
                prepared["scenario"],
                transcript=transcript,
            ):
                if event["type"] == "_result":
                    ended_reason = event["ended_reason"]
                    if transcript and ended_reason != "error":
                        score = await evaluate_transcript(transcript=transcript, scenario=prepared["scenario"])
                        yield ndjson({"type": "score", **score})
                    await _persist_run(prepared, transcript, ended_reason, score)
                    persisted = True
                    yield ndjson({"type": "done", "run_id": str(prepared["run_id"]), "ended_reason": ended_reason})
                else:
                    yield ndjson(event)
    except asyncio.CancelledError:
        if not persisted and (acquired_slot or transcript):
            await asyncio.shield(_persist_run(prepared, transcript, ended_reason, score))
        raise
    except Exception as exc:
        if not persisted:
            ended_reason = "error"
            yield ndjson({"type": "error", "detail": str(exc) or "Simulation failed"})
            await _persist_run(prepared, transcript, ended_reason, score)
            persisted = True
            yield ndjson({"type": "done", "run_id": str(prepared["run_id"]), "ended_reason": ended_reason})
    finally:
        if acquired_slot:
            _llm_slots.release()
        locks.discard(str(prepared["session_id"]))

def _streaming_response(prepared: dict):
    return StreamingResponse(
        _stream_prepared_run(prepared),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )

@app.post("/api/sessions/{sid}/run")
async def run(sid: uuid.UUID, body: RunIn):
    return _streaming_response(await _prepare_run(sid, body.instruction_text))

@app.post("/api/sessions/{sid}/rerun")
async def rerun(sid: uuid.UUID):
    return _streaming_response(await _prepare_run(sid, None))

async def _podium_session_rows():
    return await db.fetch("""SELECT s.id,s.display_name,s.last_active_at,
        coalesce((SELECT max(i.version_number) FROM instructions i WHERE i.session_id=s.id),0) latest_version_number,
        (SELECT count(*) FROM runs r WHERE r.session_id=s.id) run_count,
        coalesce((SELECT max((r.score->>'captured')::int) FROM runs r WHERE r.session_id=s.id AND r.score IS NOT NULL),0) best_captured,
        coalesce((SELECT max((r.score->>'total')::int) FROM runs r WHERE r.session_id=s.id AND r.score IS NOT NULL),0) objectives_total,
        coalesce((SELECT max((r.score->>'overall')::int) FROM runs r WHERE r.session_id=s.id AND r.score IS NOT NULL),0) best_rubric,
        coalesce((SELECT (r.score->>'captured')::int FROM runs r WHERE r.session_id=s.id AND r.score IS NOT NULL ORDER BY r.created_at DESC LIMIT 1),0) latest_captured,
        coalesce((SELECT json_agg((r.score->>'captured')::int ORDER BY r.created_at) FROM runs r WHERE r.session_id=s.id AND r.score IS NOT NULL),'[]'::json) trend
        FROM sessions s
        ORDER BY best_captured DESC, best_rubric DESC, s.last_active_at DESC""")

@app.get("/api/podium/sessions")
async def podium_sessions(key: str = Query(...)):
    podium_auth(key)
    rows = await _podium_session_rows()
    return [dict(r) for r in rows]

@app.get("/api/podium/summary")
async def podium_summary(key: str = Query(...)):
    podium_auth(key)
    rows = [dict(r) for r in await _podium_session_rows()]
    session_count = len(rows)
    total_runs = sum(int(r["run_count"]) for r in rows)
    latest_scores = [int(r["latest_captured"]) for r in rows]
    class_average = round(sum(latest_scores) / session_count, 1) if session_count else 0
    max_total = max([int(r["objectives_total"]) for r in rows] + [5])
    distribution = {str(i): 0 for i in range(max_total + 1)}
    for score in latest_scores:
        distribution[str(score)] = distribution.get(str(score), 0) + 1
    improved = []
    for row in rows:
        trend = row.get("trend") or []
        if trend:
            first = int(trend[0])
            peak = max(int(v) for v in trend)
            improved.append({
                "id": str(row["id"]),
                "display_name": row["display_name"],
                "improvement": peak - first,
                "first_captured": first,
                "max_captured": peak,
            })
    improved.sort(key=lambda item: (item["improvement"], item["max_captured"]), reverse=True)
    return {
        "session_count": session_count,
        "total_runs": total_runs,
        "class_average_latest_captured": class_average,
        "distribution": distribution,
        "most_improved": improved[:3],
    }

@app.get("/api/podium/sessions/{sid}")
async def podium_session(sid: uuid.UUID, key: str = Query(...)):
    podium_auth(key)
    latest = await db.fetchrow("SELECT * FROM instructions WHERE session_id=$1 ORDER BY version_number DESC LIMIT 1", sid)
    run = await db.fetchrow("SELECT r.*, i.text instruction_text, i.version_number FROM runs r LEFT JOIN instructions i ON i.id=r.instruction_id WHERE r.session_id=$1 ORDER BY r.created_at DESC LIMIT 1", sid)
    hist = await db.fetch("SELECT r.id, r.created_at, i.version_number, i.text instruction_text, r.transcript, r.ended_reason, r.score FROM runs r LEFT JOIN instructions i ON i.id=r.instruction_id WHERE r.session_id=$1 ORDER BY r.created_at", sid)
    history = []
    for row in hist:
        item = dict(row)
        score = item.get("score") or {}
        item["captured"] = score.get("captured")
        item["overall"] = score.get("overall")
        item["tip"] = score.get("tip")
        history.append(item)
    return {"latest_instruction": rowdict(latest), "latest_run": rowdict(run), "run_history": history}

@app.get("/api/podium/presentation")
async def podium_presentation(key: str = Query(...)):
    podium_auth(key)
    state = await presentation_state()
    return state

@app.post("/api/podium/presentation/activate")
async def podium_activate_presentation(body: PresentationActivateIn, key: str = Query(...)):
    podium_auth(key)
    await db.execute(
        """UPDATE presentation_state
           SET active_slide_id=$1, active_mode=$2, updated_at=now()
           WHERE id=1""",
        body.slide_id,
        body.mode,
    )
    return {"ok": True}

@app.post("/api/podium/presentation/freeze")
async def podium_freeze_presentation(body: PresentationFreezeIn, key: str = Query(...)):
    podium_auth(key)
    await db.execute("UPDATE presentation_state SET is_frozen=$1, updated_at=now() WHERE id=1", body.is_frozen)
    return {"ok": True}

@app.get("/api/podium/questions")
async def podium_questions(key: str = Query(...)):
    podium_auth(key)
    rows = await db.fetch(
        """SELECT q.*, s.display_name
           FROM participant_questions q
           JOIN sessions s ON s.id=q.session_id
           ORDER BY q.created_at DESC"""
    )
    return [dict(r) for r in rows]

@app.post("/api/podium/questions/{question_id}/answered")
async def podium_mark_question_answered(question_id: uuid.UUID, key: str = Query(...)):
    podium_auth(key)
    await db.execute("UPDATE participant_questions SET is_answered=true WHERE id=$1", question_id)
    return {"ok": True}

@app.get("/api/podium/responses")
async def podium_responses(slide_id: str, key: str = Query(...)):
    podium_auth(key)
    rows = await db.fetch(
        """SELECT r.*, s.display_name,
                  coalesce((SELECT count(*) FROM participant_response_votes v WHERE v.response_id=r.id),0) votes
           FROM participant_responses r
           JOIN sessions s ON s.id=r.session_id
           WHERE r.slide_id=$1
           ORDER BY votes DESC, r.created_at DESC""",
        slide_id,
    )
    return [dict(r) for r in rows]

@app.get("/api/podium/artifacts")
async def podium_get_artifacts(slide_id: str, key: str = Query(...)):
    podium_auth(key)
    rows = await db.fetch("SELECT * FROM presentation_artifacts WHERE slide_id=$1 ORDER BY updated_at DESC", slide_id)
    return [dict(r) for r in rows]

@app.post("/api/podium/artifacts")
async def podium_save_artifact(body: ArtifactIn, key: str = Query(...)):
    podium_auth(key)
    row = await db.fetchrow(
        """INSERT INTO presentation_artifacts (id, slide_id, artifact_type, payload)
           VALUES ($1,$2,$3,$4::jsonb)
           ON CONFLICT (slide_id, artifact_type)
           DO UPDATE SET payload=excluded.payload, updated_at=now()
           RETURNING *""",
        uuid.uuid4(),
        body.slide_id,
        body.artifact_type,
        body.payload,
    )
    return {"artifact": rowdict(row)}

@app.get("/api/podium/slide-overrides")
async def podium_slide_overrides(key: str = Query(...)):
    podium_auth(key)
    rows = await db.fetch("SELECT * FROM presentation_slide_overrides ORDER BY updated_at DESC")
    return [dict(r) for r in rows]

@app.get("/api/podium/slides")
async def podium_slides(key: str = Query(...)):
    podium_auth(key)
    rows = await db.fetch(
        "SELECT slide_id, position, payload, updated_at FROM presentation_slides WHERE is_deleted=false ORDER BY position, created_at"
    )
    return [dict(r) for r in rows]

@app.put("/api/podium/slides")
async def podium_save_slide_deck(body: SlideDeckIn, key: str = Query(...)):
    podium_auth(key)
    slide_ids: list[str] = []
    async with (await db.pool()).acquire() as con:
        async with con.transaction():
            for index, slide in enumerate(body.slides):
                payload = dict(slide)
                slide_id = str(payload.get("id") or f"custom-{uuid.uuid4().hex[:10]}")
                payload["id"] = slide_id
                slide_ids.append(slide_id)
                await con.execute(
                    """INSERT INTO presentation_slides (slide_id, position, payload, is_deleted)
                       VALUES ($1,$2,$3::jsonb,false)
                       ON CONFLICT (slide_id)
                       DO UPDATE SET position=excluded.position,
                                     payload=excluded.payload,
                                     is_deleted=false,
                                     updated_at=now()""",
                    slide_id,
                    index,
                    payload,
                )
            if slide_ids:
                await con.execute("UPDATE presentation_slides SET is_deleted=true, updated_at=now() WHERE NOT (slide_id = ANY($1::text[]))", slide_ids)
    return {"ok": True, "slide_count": len(slide_ids)}

@app.post("/api/podium/slides")
async def podium_create_slide(body: SlideIn, key: str = Query(...)):
    podium_auth(key)
    slide_id = str(body.payload.get("id") or f"custom-{uuid.uuid4().hex[:10]}")
    payload = {
        "id": slide_id,
        "title": body.payload.get("title") or "Untitled slide",
        "section": body.payload.get("section") or "custom",
        "template": body.payload.get("template") or "standard",
        "podiumType": body.payload.get("podiumType") or "slide",
        "participantMode": body.payload.get("participantMode") or "passive",
        "body": body.payload.get("body") or "",
        "bullets": body.payload.get("bullets") or [],
        "durationSeconds": body.payload.get("durationSeconds") or 180,
    }
    if isinstance(body.payload.get("interaction"), dict):
        payload["interaction"] = body.payload["interaction"]
    row = await db.fetchrow(
        """INSERT INTO presentation_slides (slide_id, position, payload)
           VALUES ($1, coalesce((SELECT max(position)+1 FROM presentation_slides WHERE is_deleted=false), 0), $2::jsonb)
           ON CONFLICT (slide_id)
           DO UPDATE SET payload=excluded.payload, is_deleted=false, updated_at=now()
           RETURNING slide_id, position, payload, updated_at""",
        slide_id,
        payload,
    )
    return {"slide": rowdict(row)}

@app.put("/api/podium/slides/order")
async def podium_reorder_slides(body: SlideOrderIn, key: str = Query(...)):
    podium_auth(key)
    async with (await db.pool()).acquire() as con:
        async with con.transaction():
            for index, slide_id in enumerate(body.slide_ids):
                await con.execute(
                    "UPDATE presentation_slides SET position=$2, updated_at=now() WHERE slide_id=$1 AND is_deleted=false",
                    slide_id,
                    index,
                )
    return {"ok": True}

@app.patch("/api/podium/slides/{slide_id}")
async def podium_save_slide_override(slide_id: str, body: SlideOverrideIn, key: str = Query(...)):
    podium_auth(key)
    row = await db.fetchrow(
        """INSERT INTO presentation_slide_overrides (slide_id, payload)
           VALUES ($1,$2::jsonb)
           ON CONFLICT (slide_id)
           DO UPDATE SET payload=excluded.payload, updated_at=now()
           RETURNING *""",
        slide_id,
        body.payload,
    )
    await db.execute(
        "UPDATE presentation_slides SET payload=payload || $2::jsonb, updated_at=now() WHERE slide_id=$1 AND is_deleted=false",
        slide_id,
        body.payload,
    )
    return {"override": rowdict(row)}

@app.delete("/api/podium/slides/{slide_id}")
async def podium_delete_slide_override(slide_id: str, key: str = Query(...)):
    podium_auth(key)
    await db.execute("DELETE FROM presentation_slide_overrides WHERE slide_id=$1", slide_id)
    return {"ok": True}

@app.get("/api/podium/scenarios")
async def scenarios(key: str = Query(...)):
    podium_auth(key); return [dict(r) for r in await db.fetch("SELECT id,title,public_brief,is_active FROM scenarios ORDER BY title")]

@app.post("/api/podium/scenarios/{sid}/activate")
async def activate(sid: uuid.UUID, key: str = Query(...)):
    podium_auth(key)
    async with (await db.pool()).acquire() as con:
        async with con.transaction():
            await con.execute("UPDATE scenarios SET is_active=false")
            result = await con.execute("UPDATE scenarios SET is_active=true WHERE id=$1", sid)
            if result.endswith("0"):
                raise HTTPException(404, "Scenario not found")
    return {"ok": True}

@app.post("/api/podium/reset")
async def reset(key: str = Query(...)):
    podium_auth(key)
    await db.execute("TRUNCATE runs, instructions, sessions, participant_questions, participant_response_votes, participant_responses, presentation_artifacts CASCADE")
    await db.execute("UPDATE presentation_state SET active_slide_id='welcome', active_mode='passive', is_frozen=false, updated_at=now() WHERE id=1")
    return {"ok": True}
