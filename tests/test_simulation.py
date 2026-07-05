import asyncio
import json
import unittest

from app import simulation


class SimulationPromptTests(unittest.TestCase):
    def test_bot_system_wraps_trimmed_instruction_in_harness(self):
        system = simulation.build_bot_system("  Ask one clear question.  ")

        self.assertIn("Your ONLY operating manual", system)
        self.assertIn("<instructions>\nAsk one clear question.\n</instructions>", system)
        self.assertIn("under-configured bot", system)

    def test_client_system_includes_reactive_behaviour_rules(self):
        system = simulation.build_client_system("Private client facts")

        self.assertIn("Private client facts", system)
        self.assertIn("If the bot sends a long wall of text", system)
        self.assertIn("generic or robotic replies two turns in a row", system)
        self.assertIn("never abusive, threatening, or graphic", system)

    def test_strip_end_suppresses_exact_end_and_truncates_trailing_end(self):
        self.assertEqual(simulation.strip_client_end("[END]"), ("", True))
        self.assertEqual(simulation.strip_client_end("Thanks, that helps. [END]"), ("Thanks, that helps.", True))
        self.assertEqual(simulation.strip_client_end("I can answer that."), ("I can answer that.", False))


class StreamingEventTests(unittest.TestCase):
    def test_ndjson_formats_one_json_object_per_line(self):
        line = simulation.ndjson({"type": "delta", "text": "hello"})

        self.assertTrue(line.endswith("\n"))
        self.assertEqual(json.loads(line), {"type": "delta", "text": "hello"})

    def test_opening_message_events_use_same_message_shape(self):
        events = list(simulation.opening_message_events("Hello"))

        self.assertEqual(events, [
            {"type": "message_start", "role": "client"},
            {"type": "delta", "text": "Hello"},
            {"type": "message_end"},
        ])

    def test_stream_simulation_suppresses_exact_client_end_message(self):
        async def fake_stream(**kwargs):
            system = kwargs["system"]
            if "YOUR BRIEF" in system:
                yield "[END]"
            else:
                yield "Can you tell me what happened?"

        scenario = {"opening_message": "Help", "hidden_brief": "Facts"}

        async def collect():
            events = []
            transcript = None
            ended = None
            async for event in simulation.stream_simulation_events(
                "Ask what happened",
                scenario,
                stream_text=fake_stream,
            ):
                if event["type"] == "_result":
                    transcript = event["transcript"]
                    ended = event["ended_reason"]
                else:
                    events.append(event)
            return events, transcript, ended

        events, transcript, ended = asyncio.run(collect())

        self.assertEqual(ended, "client_ended")
        self.assertEqual(transcript, [
            {"role": "client", "text": "Help"},
            {"role": "bot", "text": "Can you tell me what happened?"},
        ])
        self.assertEqual([e["type"] for e in events], [
            "message_start",
            "delta",
            "message_end",
            "message_start",
            "delta",
            "message_end",
        ])

    def test_stream_simulation_persists_partial_bot_text_on_stream_error(self):
        async def fake_stream(**kwargs):
            yield "Partial bot answer"
            raise RuntimeError("provider broke")

        scenario = {"opening_message": "Help", "hidden_brief": "Facts"}

        async def collect():
            visible = []
            result = None
            async for event in simulation.stream_simulation_events(
                "Ask what happened",
                scenario,
                stream_text=fake_stream,
            ):
                if event["type"] == "_result":
                    result = event
                else:
                    visible.append(event)
            return visible, result

        visible, result = asyncio.run(collect())

        self.assertEqual(result["ended_reason"], "error")
        self.assertEqual(result["transcript"], [
            {"role": "client", "text": "Help"},
            {"role": "bot", "text": "Partial bot answer"},
        ])
        self.assertEqual(visible[-1]["type"], "error")


if __name__ == "__main__":
    unittest.main()
