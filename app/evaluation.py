import asyncio
import json
import uuid
from collections.abc import Callable, Mapping
from typing import Any

from .seed import SCENARIOS
from .simulation import _call_with_retry

SEEDED_SCORECARDS: dict[str, dict[str, Any]] = {
    scenario["id"]: scenario["scorecard"]
    for scenario in SCENARIOS
    if scenario.get("scorecard")
}

DEFAULT_OBJECTIVES = [
    {"id": "facts", "label": "Key facts"},
    {"id": "people", "label": "People involved"},
    {"id": "documents", "label": "Relevant documents"},
    {"id": "urgency", "label": "Urgency"},
    {"id": "next_steps", "label": "Clear next step"},
]

RUBRIC_KEYS = ("tone", "questions", "clarity", "honesty")
INTAKE_TERMS = (
    "ask", "collect", "gather", "find out", "establish", "understand", "check",
    "who", "what", "when", "where", "documents", "messages", "evidence",
    "urgency", "urgent", "children", "child", "contact", "next step",
)
HONESTY_TERMS = (
    "legal advice", "do not advise", "don't advise", "cannot advise", "can't advise",
    "solicitor", "lawyer", "human", "follow up", "call back", "no promises",
    "do not promise", "don't promise", "not promise", "outcome",
)

JUDGE_SYSTEM = """You are evaluating a chatbot transcript for a school workshop where students write the bot's instructions. You will receive the student's instructions, a conversation between a CLIENT and a BOT, plus a hidden scorecard.

Core rule: reward the student's instructions, not the base model. A score is earned only when the student's instructions clearly caused, required, or strongly supported the good bot behaviour shown in the transcript. Do not give high marks for generic competence that the model happened to produce without being instructed.

PART 1 - OBJECTIVES. For each scorecard objective, decide if the student genuinely earned it: the transcript must show the bot achieved it, AND the student's instructions must contain a relevant direction that would reasonably cause the bot to do that thing. Information only present in the client's first message counts solely if the bot acknowledged or built on it. Score only the listed scorecard objectives; do not invent extra scenario-specific requirements.

PART 2 - RUBRIC. Score the student's INSTRUCTIONS 1-5 on each dimension, using the transcript as evidence of whether the instructions worked:
- tone: high only if the instructions tell the bot to be warm, calm, human, empathetic, or emotionally appropriate
- questions: high only if the instructions tell the bot what to ask and to ask clear, relevant questions one at a time
- clarity: high only if the instructions tell the bot to use short, plain, simple, non-jargon responses
- honesty: high only if the instructions tell the bot not to give legal advice, not to promise outcomes, and to explain a human follow-up or safe next step. Treat the scorecard "avoid" items as examples of poor honesty.

Hard caps:
- Empty, nonsense, or one-word instructions: maximum 1 objective captured and maximum 2/5 on every rubric dimension.
- Instructions with no intake requirements: maximum 2 objectives captured.
- Instructions with no legal-advice, no-promises, or human-follow-up guardrail: maximum honesty 2/5.
- Instructions that ask the bot to give definitive legal advice or promise an outcome: honesty 1/5.

PART 3 - COACHING TIP. One specific, actionable sentence telling the student the single best change to make to their INSTRUCTIONS next (not to the bot's individual messages). Encouraging in tone; suitable for a 14-15 year old.

Judge only what the student's instructions caused. A frustrated client is evidence about the instructions, not a fault of the client.

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


def _clean_objectives(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    objectives = []
    for item in raw:
        if not isinstance(item, Mapping):
            continue
        oid = str(item.get("id", "")).strip()
        label = str(item.get("label", "")).strip()
        captured_if = str(item.get("captured_if", "")).strip()
        if oid and label:
            objective = {"id": oid, "label": label}
            if captured_if:
                objective["captured_if"] = captured_if
            objectives.append(objective)
    return objectives


def scorecard_for_scenario(scenario: str | uuid.UUID | Mapping[str, Any] | None) -> dict[str, Any]:
    if isinstance(scenario, Mapping):
        scorecard = scenario.get("scorecard")
        if isinstance(scorecard, Mapping):
            return {
                "objectives": _clean_objectives(scorecard.get("objectives")),
                "avoid": [str(item).strip() for item in scorecard.get("avoid", []) if str(item).strip()],
            }
        key = str(scenario.get("id", ""))
    else:
        key = str(scenario) if scenario else ""
    seeded = SEEDED_SCORECARDS.get(key)
    if isinstance(seeded, Mapping):
        return {
            "objectives": _clean_objectives(seeded.get("objectives")),
            "avoid": [str(item).strip() for item in seeded.get("avoid", []) if str(item).strip()],
        }
    return {"objectives": DEFAULT_OBJECTIVES, "avoid": []}


def objectives_for_scenario(scenario: str | uuid.UUID | Mapping[str, Any] | None) -> list[dict[str, str]]:
    scorecard = scorecard_for_scenario(scenario)
    return scorecard["objectives"] or [dict(item) for item in DEFAULT_OBJECTIVES]


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


def _instruction_words(instruction_text: str | None) -> list[str]:
    return [word for word in " ".join((instruction_text or "").lower().split()).split(" ") if word]


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _asks_for_definitive_advice(text: str) -> bool:
    risky = ("give legal advice", "tell them what to do", "promise", "guarantee", "definitely win")
    safe_prefixes = ("do not ", "don't ", "never ", "not ")
    for term in risky:
        index = text.find(term)
        if index == -1:
            continue
        window = text[max(0, index - 12):index]
        if not any(prefix in window for prefix in safe_prefixes):
            return True
    return False


def instruction_caps(instruction_text: str | None, total_objectives: int) -> dict[str, Any]:
    text = " ".join((instruction_text or "").lower().split())
    words = _instruction_words(instruction_text)
    max_captured = total_objectives
    rubric_max = {key: 5 for key in RUBRIC_KEYS}

    if len(words) <= 1 or len(text) < 8:
        max_captured = min(max_captured, 1)
        rubric_max = {key: 2 for key in RUBRIC_KEYS}
    elif not _has_any(text, INTAKE_TERMS):
        max_captured = min(max_captured, 2)

    if not _has_any(text, HONESTY_TERMS):
        rubric_max["honesty"] = min(rubric_max["honesty"], 2)
    if _asks_for_definitive_advice(text):
        rubric_max["honesty"] = 1

    return {"max_captured": max_captured, "rubric_max": rubric_max}


def _apply_captured_cap(results: list[dict[str, Any]], max_captured: int) -> None:
    captured_seen = 0
    for item in results:
        if not item["captured"]:
            continue
        captured_seen += 1
        if captured_seen > max_captured:
            item["captured"] = False
            item["evidence"] = "not supported by the instructions"


def normalize_score(
    raw: dict[str, Any],
    objectives: list[dict[str, Any]],
    instruction_text: str | None = None,
) -> dict[str, Any]:
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
    caps = instruction_caps(instruction_text, len(results))
    _apply_captured_cap(results, caps["max_captured"])
    rubric = {
        key: min(_clamp_score(rubric_raw.get(key)), caps["rubric_max"][key])
        for key in RUBRIC_KEYS
    }
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


def _transcript_payload(
    transcript: list[dict[str, str]],
    scorecard: dict[str, Any],
    instruction_text: str | None,
) -> str:
    conversation = "\n".join(
        f"{'CLIENT' if item['role'] == 'client' else 'BOT'}: {item['text']}"
        for item in transcript
    )
    objectives = scorecard.get("objectives") or DEFAULT_OBJECTIVES
    objective_lines = "\n".join(f"- {item['id']}: {item['label']}" for item in objectives)
    criteria_lines = "\n".join(
        f"- {item['id']}: {item.get('captured_if', item['label'])}"
        for item in objectives
    )
    avoid = scorecard.get("avoid") or []
    avoid_lines = "\n".join(f"- {item}" for item in avoid) if avoid else "- No scenario-specific avoid items."
    instructions = (instruction_text or "").strip() or "[empty]"
    return f"STUDENT INSTRUCTIONS:\n{instructions}\n\nSCORECARD OBJECTIVES:\n{objective_lines}\n\nCAPTURE CRITERIA:\n{criteria_lines}\n\nAVOID:\n{avoid_lines}\n\nTRANSCRIPT:\n{conversation}"


async def evaluate_transcript(
    *,
    transcript: list[dict[str, str]],
    instruction_text: str | None = None,
    scenario_id: str | uuid.UUID | None = None,
    scenario: Mapping[str, Any] | None = None,
    call_text: CallText = _call_with_retry,
) -> dict[str, Any]:
    scenario_ref = scenario if scenario is not None else scenario_id
    scorecard = scorecard_for_scenario(scenario_ref)
    objectives = scorecard["objectives"] or DEFAULT_OBJECTIVES
    payload = _transcript_payload(transcript, scorecard, instruction_text)
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
            return normalize_score(raw, objectives, instruction_text)
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(0.2)
    raise last_error or RuntimeError("Judge evaluation failed")
