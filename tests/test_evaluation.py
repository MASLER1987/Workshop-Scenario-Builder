import asyncio
import json
import unittest

from app import evaluation


class EvaluationTests(unittest.TestCase):
    def test_family_objectives_have_five_workshop_targets(self):
        objectives = evaluation.objectives_for_scenario("11111111-1111-1111-1111-111111111111")

        self.assertEqual(len(objectives), 5)
        self.assertEqual([item["id"] for item in objectives], [
            "people",
            "dispute",
            "documents",
            "urgency",
            "next_steps",
        ])
        labels = " ".join(item["label"] for item in objectives).lower()
        self.assertNotIn("dementia", labels)
        self.assertNotIn("pressure", labels)

    def test_employment_objectives_follow_public_brief_not_hidden_facts(self):
        objectives = evaluation.objectives_for_scenario("22222222-2222-2222-2222-222222222222")

        self.assertEqual([item["id"] for item in objectives], [
            "timeline",
            "written_notice",
            "service_length",
            "urgency",
            "next_steps",
        ])
        labels = " ".join(item["label"] for item in objectives).lower()
        self.assertNotIn("retaliation", labels)
        self.assertNotIn("protected", labels)

    def test_custom_scenario_objectives_are_used_for_unknown_scenarios(self):
        objectives = evaluation.objectives_for_scenario({
            "id": "99999999-9999-9999-9999-999999999999",
            "objectives": [
                {"id": "custom_fact", "label": "Custom public fact"},
                {"id": "next_steps", "label": "Custom next step"},
            ],
        })

        self.assertEqual(objectives, [
            {"id": "custom_fact", "label": "Custom public fact"},
            {"id": "next_steps", "label": "Custom next step"},
        ])

    def test_judge_prompt_contains_objectives_rubric_and_tip_instruction(self):
        prompt = evaluation.build_judge_system()

        self.assertIn("PART 1", prompt)
        self.assertIn("PART 2", prompt)
        self.assertIn("PART 3", prompt)
        self.assertIn('"rubric"', prompt)
        self.assertIn('"tip"', prompt)

    def test_normalize_score_computes_overall_server_side(self):
        raw = {
            "results": [
                {"id": "people", "captured": True, "evidence": "David is executor"},
                {"id": "will", "captured": False, "evidence": "not asked"},
            ],
            "rubric": {"tone": 4, "questions": 2, "clarity": 5, "honesty": 3},
            "overall": 999,
            "tip": "Tell your bot to ask one question at a time.",
        }
        objectives = [{"id": "people"}, {"id": "will"}, {"id": "urgency"}]

        score = evaluation.normalize_score(raw, objectives)

        self.assertEqual(score["captured"], 1)
        self.assertEqual(score["total"], 3)
        self.assertEqual(score["overall"], 14)
        self.assertEqual(score["rubric"], {"tone": 4, "questions": 2, "clarity": 5, "honesty": 3})
        self.assertEqual(score["results"][2], {"id": "urgency", "label": "urgency", "captured": False, "evidence": ""})

    def test_evaluate_transcript_retries_once_on_parse_failure(self):
        calls = []

        async def fake_call(*, system, messages, max_tokens, temperature):
            calls.append((system, messages, max_tokens, temperature))
            if len(calls) == 1:
                return "not json"
            return json.dumps({
                "results": [{"id": "timeline", "captured": True, "evidence": "asked reason"}],
                "rubric": {"tone": 3, "questions": 1, "clarity": 4, "honesty": 5},
                "tip": "Tell your bot to ask only one question at a time.",
            })

        async def run():
            return await evaluation.evaluate_transcript(
                transcript=[{"role": "client", "text": "Help"}, {"role": "bot", "text": "Why?"}],
                scenario_id="22222222-2222-2222-2222-222222222222",
                call_text=fake_call,
            )

        score = asyncio.run(run())

        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][3], 0)
        self.assertEqual(score["captured"], 1)
        self.assertEqual(score["overall"], 13)
        self.assertIn("one question", score["tip"])

    def test_evaluate_transcript_includes_public_brief_but_not_hidden_brief(self):
        calls = []

        async def fake_call(*, system, messages, max_tokens, temperature):
            calls.append(messages[0]["content"])
            return json.dumps({
                "results": [{"id": "custom_fact", "captured": True, "evidence": "asked"}],
                "rubric": {"tone": 3, "questions": 3, "clarity": 3, "honesty": 3},
                "tip": "Tell your bot to ask about the public scenario target.",
            })

        scenario = {
            "id": "99999999-9999-9999-9999-999999999999",
            "public_brief": "Public brief target: ask about the contract date.",
            "hidden_brief": "Hidden-only fact: the client secretly lost the original.",
            "objectives": [{"id": "custom_fact", "label": "Contract date"}],
        }

        async def run():
            return await evaluation.evaluate_transcript(
                transcript=[{"role": "client", "text": "Help"}, {"role": "bot", "text": "What date?"}],
                scenario=scenario,
                call_text=fake_call,
            )

        score = asyncio.run(run())

        self.assertEqual(score["captured"], 1)
        self.assertIn("Public brief target", calls[0])
        self.assertNotIn("Hidden-only fact", calls[0])

    def test_evaluate_transcript_accepts_fenced_json_response(self):
        async def fake_call(**kwargs):
            return """```json
{"results":[{"id":"people","captured":true,"evidence":"brother named"}],"rubric":{"tone":5,"questions":4,"clarity":3,"honesty":2},"tip":"Tell your bot to ask one clear follow-up question."}
```"""

        async def run():
            return await evaluation.evaluate_transcript(
                transcript=[{"role": "client", "text": "Help"}, {"role": "bot", "text": "Who is involved?"}],
                scenario_id="11111111-1111-1111-1111-111111111111",
                call_text=fake_call,
            )

        score = asyncio.run(run())

        self.assertEqual(score["captured"], 1)
        self.assertEqual(score["overall"], 14)


if __name__ == "__main__":
    unittest.main()
