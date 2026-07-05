import asyncio
import json
import uuid
from collections.abc import Callable
from typing import Any

from .simulation import _call_with_retry

OBJECTIVES: dict[str, list[dict[str, str]]] = {
    "11111111-1111-1111-1111-111111111111": [
        {"id": "people", "label": "Who is involved"},
        {"id": "will", "label": "Whether there is a will or estate document"},
        {"id": "urgency", "label": "Whether the house sale is urgent"},
        {"id": "capacity_pressure", "label": "Capacity, dementia, or pressure concerns"},
        {"id": "next_steps", "label": "Clear next step for human follow-up"},
    ],
    "22222222-2222-2222-2222-222222222222": [
        {"id": "timeline", "label": "What happened and when"},
        {"id": "written_notice", "label": "Whether anything is in writing"},
        {"id": "service_length", "label": "Length of service"},
        {"id": "retaliation", "label": "Possible retaliation or protected complaint"},
        {"id": "next_steps", "label": "Clear next step and urgency"},
    ],
}

DEFAULT_OBJECTIVES = [
    {"id": "facts", "label": "Key facts"},
    {"id": "people", "label": "People involved"},
    {"id": "documents", "label": "Relevant documents"},
    {"id": "urgency", "label": "Urgency"},
    {"id": "next_steps", "label": "Clear next step"},
]

RUBRIC_KEYS = ("tone", "questions", "clarity", "honesty")

JUDGE_SYSTEM = """You are evaluating a chatbot transcript for a school workshop where students write the bot's instructions. You will receive a conversation between a CLIENT and a BOT, plus a list of information objectives.

PART 1 - OBJECTIVES. For each objective, decide if the bot genuinely achieved it: the information must appear because the bot asked for it or the client volunteered it in response to the bot, OR (for next-steps objectives) the bot clearly told the client what happens next. Information only present in the client's first message counts solely if the bot acknowledged or built on it.

PART 2 - RUBRIC. Score the BOT 1-5 on each dimension (1 = poor, 3 = okay, 5 = excellent):
- tone: warm, human, and appropriate vs cold, robotic, or over-the-top
- questions: one clear, relevant question at a time vs no questions, vague questions, or several stacked at once
- clarity: short, plain messages vs walls of text or jargon
- honesty: manages expectations well - clear about what happens next, does not pretend to give legal advice or make promises it can't keep

PART 3 - COACHING TIP. One specific, actionable sentence telling the student the single best change to make to their INSTRUCTIONS next (not to the bot's individual messages). Encouraging in tone; suitable for a 14-15 year old.

Judge only the BOT. A frustrated client is evidence about the bot, not a fault of the client.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{
  "results": [{"id": "<objective id>", "captured": true|false, "evidence": "<max 12 words>"}],
  "rubric": {"tone": n, "questions": n, "clarity": n, "honesty": n},
  "tip": "<one sentence>"
}
"""

CallText = Callable[..., Any]


def build_judge_system() -> str:
    return JUDGE_SYSTEM


def objectives_for_scenario(scenario_id: str | uuid.UUID | None) -> list[dict[str, str]]:
    key = str(scenario_id) if scenario_id else ""
    return OBJECTIVES.get(key, DEFAULT_OBJECTIVES)


def _clamp_score(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 1
    return min(5, max(1, number))


def _one_sentence(text: Any) -> str:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return "Add one clear instruction telling your bot what to ask next."
    parts = cleaned.split(".")
    if len(parts) > 1 and parts[0]:
        return parts[0].strip() + "."
    return cleaned if cleaned.endswith((".", "!", "?")) else cleaned + "."


def normalize_score(raw: dict[str, Any], objectives: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {
        str(item.get("id", "")): item
        for item in raw.get("results", [])
        if isinstance(item, dict)
    }
    results = []
    for objective in objectives:
        item = by_id.get(str(objective["id"]), {})
        evidence = " ".join(str(item.get("evidence", "")).split()[:12])
        results.append({
            "id": objective["id"],
            "label": objective.get("label", objective["id"]),
            "captured": bool(item.get("captured", False)),
            "evidence": evidence,
        })
    rubric_raw = raw.get("rubric", {}) if isinstance(raw.get("rubric"), dict) else {}
    rubric = {key: _clamp_score(rubric_raw.get(key)) for key in RUBRIC_KEYS}
    captured = sum(1 for item in results if item["captured"])
    return {
        "captured": captured,
        "total": len(results),
        "results": results,
        "rubric": rubric,
        "overall": sum(rubric.values()),
        "tip": _one_sentence(raw.get("tip")),
    }


def parse_judge_response(text: str) -> dict[str, Any]:
    stripped = text.strip()
    try:
        raw = json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        raw = json.loads(stripped[start:end + 1])
    if not isinstance(raw, dict):
        raise ValueError("Judge response was not an object")
    return raw


def _transcript_payload(transcript: list[dict[str, str]], objectives: list[dict[str, str]]) -> str:
    conversation = "\n".join(
        f"{'CLIENT' if item['role'] == 'client' else 'BOT'}: {item['text']}"
        for item in transcript
    )
    objective_lines = "\n".join(f"- {item['id']}: {item['label']}" for item in objectives)
    return f"OBJECTIVES:\n{objective_lines}\n\nTRANSCRIPT:\n{conversation}"


async def evaluate_transcript(
    *,
    transcript: list[dict[str, str]],
    scenario_id: str | uuid.UUID | None,
    call_text: CallText = _call_with_retry,
) -> dict[str, Any]:
    objectives = objectives_for_scenario(scenario_id)
    payload = _transcript_payload(transcript, objectives)
    last_error: Exception | None = None
    for _ in range(2):
        try:
            text = await call_text(
                system=build_judge_system(),
                messages=[{"role": "user", "content": payload}],
                max_tokens=700,
                temperature=0,
            )
            raw = parse_judge_response(text)
            return normalize_score(raw, objectives)
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(0.2)
    raise last_error or RuntimeError("Judge evaluation failed")
