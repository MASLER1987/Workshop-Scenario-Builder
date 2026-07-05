import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class PodiumProgressionTests(unittest.TestCase):
    def test_main_exposes_podium_summary_and_progression_fields(self):
        source = (ROOT / "app" / "main.py").read_text()

        self.assertIn('/api/podium/summary', source)
        self.assertIn("latest_captured", source)
        self.assertIn("objectives_total", source)
        self.assertIn("best_rubric", source)
        self.assertIn("trend", source)
        self.assertIn("most_improved", source)

    def test_podium_ui_has_summary_and_sort_controls(self):
        source = (ROOT / "static" / "podium.js").read_text()

        self.assertIn("summary", source)
        self.assertIn("sortMode", source)
        self.assertIn("Leaderboard", source)
        self.assertIn("Most improved", source)
        self.assertIn("progressionStrip", source)
        self.assertIn("progressionHeader", source)

    def test_score_color_mapping_exists_for_projection(self):
        source = (ROOT / "static" / "podium.js").read_text()

        self.assertIn("scoreClass", source)
        self.assertIn("score-low", source)
        self.assertIn("score-mid", source)
        self.assertIn("score-high", source)
