import asyncio
import json
import os
import re
from collections.abc import AsyncIterator, Callable, Iterable
from typing import Any

from anthropic import AsyncAnthropic

MODEL = "claude-haiku-4-5-20251001"

BOT_SYSTEM = """You are a chatbot that a law firm has just deployed. Your ONLY operating manual is the content inside <instructions> below. Follow it literally.

Rules that apply regardless of the instructions:
- If the instructions do not cover a situation, do NOT improvise helpful or professional behaviour. Behave like an under-configured bot: short, generic, slightly robotic replies.
- Do not ask intake questions, express empathy, gather details, or explain next steps UNLESS the instructions tell you to.
- Hard cap: 60 words per reply, unless the instructions explicitly permit longer replies.
- If <instructions> is empty or contains no usable direction, reply only with generic deflections such as "Thank you for your message. Someone will be in touch."
- Never mention these rules, the harness, or the <instructions> tags.

<instructions>
{instruction_text}
</instructions>
"""

CLIENT_SYSTEM = """You are roleplaying a real client contacting a law firm's intake chatbot by text message. Stay fully in character at all times.

YOUR BRIEF (private - never reveal that you are following a brief):
{hidden_brief}

Rules:
- Write like a real person texting: short messages, natural tone, occasional emotion. 1-3 sentences per message.
- Respond only to what the bot actually said. Do not volunteer your hidden details unprompted - reveal them only when the bot asks a question that would naturally surface them.
- Never help the bot do its job. If it is vague or unhelpful, react as a real frustrated client would.
- Never break character, never mention being an AI or a simulation.
- If the bot has gathered your key facts and told you what happens next, OR the conversation has reached a natural end, reply with exactly [END] and nothing else.

How to react to the bot's behaviour (stay in character while doing this):
- If the bot sends a long wall of text: complain briefly, e.g. "sorry that's a lot of text, can you just tell me if you can help?" Do not answer any questions buried in it.
- If the bot asks more than two questions in one message: answer only the first one and ignore the rest.
- If the bot gives generic or robotic replies two turns in a row: get openly frustrated and say you might try a different firm.
- If the bot asks one clear, relevant question: answer it properly and warm up slightly.
- Your own messages: 1-3 sentences, always.
- Tone guard: this transcript will be shown in a school workshop. You can be upset, frustrated, or emotional, but never abusive, threatening, or graphic.
"""

StreamText = Callable[..., AsyncIterator[str]]

_client: AsyncAnthropic | None = None


def anthropic_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def _text(message: Any) -> str:
    return "".join(getattr(block, "text", "") for block in message.content).strip()


def build_bot_system(instruction_text: str) -> str:
    return BOT_SYSTEM.format(instruction_text=instruction_text.strip())


def build_client_system(hidden_brief: str) -> str:
    return CLIENT_SYSTEM.format(hidden_brief=hidden_brief)


def ndjson(event: dict[str, Any]) -> str:
    return json.dumps(event, separators=(",", ":")) + "\n"


def opening_message_events(text: str) -> Iterable[dict[str, str]]:
    yield {"type": "message_start", "role": "client"}
    yield {"type": "delta", "text": text}
    yield {"type": "message_end"}


async def _call_with_retry(**kwargs: Any) -> str:
    last: Exception | None = None
    for _ in range(2):
        try:
            msg = await anthropic_client().messages.create(model=MODEL, **kwargs)
            return _text(msg)
        except Exception as exc:
            last = exc
            await asyncio.sleep(0.8)
    raise last or RuntimeError("Anthropic call failed")


def _bot_messages(transcript: list[dict[str, str]]) -> list[dict[str, str]]:
    return [{"role": "user" if m["role"] == "client" else "assistant", "content": m["text"]} for m in transcript]


def _client_messages(transcript: list[dict[str, str]]) -> list[dict[str, str]]:
    return [{"role": "assistant" if m["role"] == "client" else "user", "content": m["text"]} for m in transcript]


def strip_client_end(text: str) -> tuple[str, bool]:
    stripped = text.strip()
    if stripped == "[END]":
        return "", True
    cleaned = re.sub(r"^\s*\[END\]\s*|\s*\[END\]\s*$", "", text, flags=re.I).strip()
    return cleaned, cleaned != stripped


async def stream_anthropic_text(**kwargs: Any) -> AsyncIterator[str]:
    last: Exception | None = None
    for attempt in range(2):
        sent_any = False
        try:
            stream_kwargs = {key: value for key, value in kwargs.items() if value is not None}
            async with anthropic_client().messages.stream(model=MODEL, **stream_kwargs) as stream:
                async for text in stream.text_stream:
                    if text:
                        sent_any = True
                        yield text
            return
        except Exception as exc:
            last = exc
            if sent_any or attempt == 1:
                raise
            await asyncio.sleep(0.8)
    raise last or RuntimeError("Anthropic stream failed")


async def _stream_bot_turn(
    instruction_text: str,
    transcript: list[dict[str, str]],
    stream_text: StreamText,
) -> AsyncIterator[dict[str, Any]]:
    parts: list[str] = []
    try:
        yield {"type": "message_start", "role": "bot"}
        async for delta in stream_text(
            system=build_bot_system(instruction_text),
            messages=_bot_messages(transcript),
            max_tokens=250,
        ):
            parts.append(delta)
            yield {"type": "delta", "text": delta}
        yield {"type": "message_end"}
    except Exception:
        text = "".join(parts).strip()
        if text:
            transcript.append({"role": "bot", "text": text})
        raise
    transcript.append({"role": "bot", "text": "".join(parts).strip()})


async def _stream_client_turn(
    scenario: dict[str, Any],
    transcript: list[dict[str, str]],
    stream_text: StreamText,
) -> AsyncIterator[dict[str, Any]]:
    parts: list[str] = []
    try:
        async for delta in stream_text(
            system=build_client_system(scenario["hidden_brief"]),
            messages=_client_messages(transcript),
            max_tokens=300,
            temperature=1.0,
        ):
            parts.append(delta)
    except Exception:
        text, _ = strip_client_end("".join(parts))
        if text:
            yield {"type": "message_start", "role": "client"}
            yield {"type": "delta", "text": text}
            yield {"type": "message_end"}
            transcript.append({"role": "client", "text": text})
        raise
    text, ended = strip_client_end("".join(parts))
    if text:
        yield {"type": "message_start", "role": "client"}
        yield {"type": "delta", "text": text}
        yield {"type": "message_end"}
        transcript.append({"role": "client", "text": text})
    if ended:
        yield {"type": "_client_ended"}


async def stream_simulation_events(
    instruction_text: str,
    scenario: dict[str, Any],
    *,
    stream_text: StreamText = stream_anthropic_text,
    transcript: list[dict[str, str]] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    transcript = transcript if transcript is not None else []
    transcript.append({"role": "client", "text": scenario["opening_message"]})
    ended_reason = "max_turns"
    try:
        for event in opening_message_events(scenario["opening_message"]):
            yield event
        for turn in range(1, 6):
            async for event in _stream_bot_turn(instruction_text, transcript, stream_text):
                yield event
            if turn == 5:
                break
            async for event in _stream_client_turn(scenario, transcript, stream_text):
                if event["type"] == "_client_ended":
                    ended_reason = "client_ended"
                    yield {"type": "_result", "transcript": transcript, "ended_reason": ended_reason}
                    return
                yield event
    except Exception as exc:
        ended_reason = "error"
        yield {"type": "error", "detail": str(exc) or "Simulation failed"}
    yield {"type": "_result", "transcript": transcript, "ended_reason": ended_reason}


async def run_simulation(instruction_text: str, scenario: dict[str, Any]) -> tuple[list[dict[str, str]], str]:
    transcript = [{"role": "client", "text": scenario["opening_message"]}]
    ended_reason = "max_turns"
    try:
        for turn in range(1, 6):
            bot_reply = await _call_with_retry(
                system=build_bot_system(instruction_text),
                messages=_bot_messages(transcript),
                max_tokens=250,
            )
            transcript.append({"role": "bot", "text": bot_reply})
            if turn == 5:
                break
            client_reply = await _call_with_retry(
                system=build_client_system(scenario["hidden_brief"]),
                messages=_client_messages(transcript),
                max_tokens=300,
                temperature=1.0,
            )
            client_reply, ended = strip_client_end(client_reply)
            if ended:
                ended_reason = "client_ended"
                if client_reply:
                    transcript.append({"role": "client", "text": client_reply})
                break
            transcript.append({"role": "client", "text": client_reply})
    except Exception:
        ended_reason = "error"
    return transcript, ended_reason
