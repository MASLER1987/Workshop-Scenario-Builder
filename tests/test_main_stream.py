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

        async def fake_evaluate(*, transcript, scenario):
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

    def test_stream_waits_for_global_llm_slot_and_emits_status(self):
        active_runs = 0
        max_active_runs = 0
        first_run_entered = asyncio.Event()
        release_first_run = asyncio.Event()

        async def fake_events(instruction_text, scenario, transcript=None):
            nonlocal active_runs, max_active_runs
            active_runs += 1
            max_active_runs = max(max_active_runs, active_runs)
            try:
                if not first_run_entered.is_set():
                    first_run_entered.set()
                    await release_first_run.wait()
                transcript.append({"role": "client", "text": "Help"})
                yield {"type": "message_start", "role": "client"}
                yield {"type": "delta", "text": "Help"}
                yield {"type": "message_end"}
                yield {"type": "_result", "transcript": transcript, "ended_reason": "max_turns"}
            finally:
                active_runs -= 1

        async def fake_evaluate(*, transcript, scenario):
            return {
                "captured": 0,
                "total": 5,
                "results": [],
                "rubric": {"tone": 3, "questions": 3, "clarity": 3, "honesty": 3},
                "overall": 12,
                "tip": "Tell your bot to ask one clear question.",
            }

        async def fake_persist(prepared, transcript, ended_reason, score=None):
            return None

        def prepared():
            return {
                "run_id": uuid.uuid4(),
                "session_id": uuid.uuid4(),
                "instruction": {"id": uuid.uuid4(), "text": "Ask what happened", "version_number": 1},
                "scenario": {"id": uuid.uuid4(), "opening_message": "Help", "hidden_brief": "Facts"},
            }

        async def collect(prepared_run):
            return [json.loads(line) async for line in main._stream_prepared_run(prepared_run)]

        async def run_two_streams():
            old_events = main.stream_simulation_events
            old_evaluate = main.evaluate_transcript
            old_persist = main._persist_run
            old_slots = getattr(main, "_llm_slots", None)
            try:
                main.stream_simulation_events = fake_events
                main.evaluate_transcript = fake_evaluate
                main._persist_run = fake_persist
                main._llm_slots = asyncio.Semaphore(1)

                first = asyncio.create_task(collect(prepared()))
                await asyncio.wait_for(first_run_entered.wait(), timeout=1)
                second = asyncio.create_task(collect(prepared()))
                await asyncio.sleep(0.05)
                self.assertFalse(second.done())
                release_first_run.set()
                return await asyncio.gather(first, second)
            finally:
                main.stream_simulation_events = old_events
                main.evaluate_transcript = old_evaluate
                main._persist_run = old_persist
                if old_slots is None:
                    delattr(main, "_llm_slots")
                else:
                    main._llm_slots = old_slots

        first_events, second_events = asyncio.run(run_two_streams())

        self.assertEqual(max_active_runs, 1)
        self.assertEqual(first_events[0]["type"], "run_start")
        self.assertEqual(second_events[0]["type"], "run_start")
        self.assertEqual(second_events[1], {"type": "status", "text": "Waiting for a slot..."})
        self.assertEqual(second_events[-1]["type"], "done")


if __name__ == "__main__":
    unittest.main()
