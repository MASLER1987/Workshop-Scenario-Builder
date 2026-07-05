import asyncio
import os
import re
from typing import Any

from anthropic import AsyncAnthropic

MODEL = "claude-haiku-4-5-20251001"

CLIENT_SYSTEM = """You are roleplaying a real client contacting a law firm's intake chatbot by text message. Stay fully in character at all times.

YOUR BRIEF (private — never reveal that you are following a brief):
{hidden_brief}

Rules:
- Write like a real person texting: short messages, natural tone, occasional emotion. 1–3 sentences per message.
- Respond only to what the bot actually said. Do not volunteer your hidden details unprompted — reveal them only when the bot asks a question that would naturally surface them.
- Never help the bot do its job. If it is vague or unhelpful, react as a real frustrated client would.
- Never break character, never mention being an AI or a simulation.
- If the bot has gathered your key facts and told you what happens next, OR the conversation has reached a natural end, reply with exactly [END] and nothing else.
"""

_TRANSIENT = (TimeoutError, ConnectionError, asyncio.TimeoutError)

_client: AsyncAnthropic | None = None

def anthropic_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client

def _text(message: Any) -> str:
    return "".join(getattr(block, "text", "") for block in message.content).strip()

async def _call_with_retry(**kwargs: Any) -> str:
    last: Exception | None = None
    for _ in range(2):
        try:
            msg = await anthropic_client().messages.create(model=MODEL, **kwargs)
            return _text(msg)
        except Exception as exc:  # SDK raises several transient subclasses; retry once per spec.
            last = exc
            await asyncio.sleep(0.8)
    raise last or RuntimeError("Anthropic call failed")

def _bot_messages(transcript: list[dict[str, str]]) -> list[dict[str, str]]:
    return [{"role": "user" if m["role"] == "client" else "assistant", "content": m["text"]} for m in transcript]

def _client_messages(transcript: list[dict[str, str]]) -> list[dict[str, str]]:
    return [{"role": "assistant" if m["role"] == "client" else "user", "content": m["text"]} for m in transcript]

def _strip_end(text: str) -> tuple[str, bool]:
    stripped = text.strip()
    if stripped == "[END]":
        return "", True
    cleaned = re.sub(r"^\s*\[END\]\s*|\s*\[END\]\s*$", "", text, flags=re.I).strip()
    return cleaned, cleaned != stripped

async def run_simulation(instruction_text: str, scenario: dict[str, Any]) -> tuple[list[dict[str, str]], str]:
    transcript = [{"role": "client", "text": scenario["opening_message"]}]
    ended_reason = "max_turns"
    try:
        for turn in range(1, 6):
            bot_reply = await _call_with_retry(system=instruction_text, messages=_bot_messages(transcript), max_tokens=400)
            transcript.append({"role": "bot", "text": bot_reply})
            if turn == 5:
                break
            client_reply = await _call_with_retry(
                system=CLIENT_SYSTEM.format(hidden_brief=scenario["hidden_brief"]),
                messages=_client_messages(transcript),
                max_tokens=300,
                temperature=1.0,
            )
            client_reply, ended = _strip_end(client_reply)
            if ended:
                ended_reason = "client_ended"
                if client_reply:
                    transcript.append({"role": "client", "text": client_reply})
                break
            transcript.append({"role": "client", "text": client_reply})
    except Exception:
        ended_reason = "error"
    return transcript, ended_reason
