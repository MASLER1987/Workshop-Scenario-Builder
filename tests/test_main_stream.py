import asyncio
import json
import uuid
import unittest

from app import main


class MainStreamingTests(unittest.TestCase):
    def test_stream_emits_score_before_done_and_persists_score(self):
        async def fake_events(instruction_text, scenario, transcript=None):
            transcript.append({"role": "client", "text": "Help"})
            transcript.append({"role": "bot", "text": "What happened?"})
            yield {"type": "message_start", "role": "client"}
            yield {"type": "delta", "text": "Help"}
            yield {"type": "message_end"}
            yield {"type": "_result", "transcript": transcript, "ended_reason": "max_turns"}

        async def fake_evaluate(*, transcript, scenario_id):
            return {
                "captured": 1,
                "total": 5,
                "results": [{"id": "facts", "label": "Key facts", "captured": True, "evidence": "asked"}],
                "rubric": {"tone": 4, "questions": 5, "clarity": 4, "honesty": 3},
                "overall": 16,
                "tip": "Tell your bot to explain the next step clearly.",
            }

        persisted = []

        async def fake_persist(prepared, transcript, ended_reason, score=None):
            persisted.append({"transcript": list(transcript), "ended_reason": ended_reason, "score": score})

        async def collect():
            old_events = main.stream_simulation_events
            old_evaluate = main.evaluate_transcript
            old_persist = main._persist_run
            try:
                main.stream_simulation_events = fake_events
                main.evaluate_transcript = fake_evaluate
                main._persist_run = fake_persist
                prepared = {
                    "run_id": uuid.uuid4(),
                    "session_id": uuid.uuid4(),
                    "instruction": {"id": uuid.uuid4(), "text": "Ask what happened", "version_number": 2},
                    "scenario": {"id": uuid.uuid4(), "opening_message": "Help", "hidden_brief": "Facts"},
                }
                events = []
                async for line in main._stream_prepared_run(prepared):
                    events.append(json.loads(line))
                return events
            finally:
                main.stream_simulation_events = old_events
                main.evaluate_transcript = old_evaluate
                main._persist_run = old_persist

        events = asyncio.run(collect())

        self.assertEqual([event["type"] for event in events], [
            "run_start",
            "message_start",
            "delta",
            "message_end",
            "score",
            "done",
        ])
        self.assertEqual(events[-2]["overall"], 16)
        self.assertEqual(events[-1]["ended_reason"], "max_turns")
        self.assertEqual(persisted[0]["score"]["tip"], "Tell your bot to explain the next step clearly.")


if __name__ == "__main__":
    unittest.main()
