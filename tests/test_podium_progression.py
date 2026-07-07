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
        self.assertIn("podium-shell", source)
        self.assertIn("podium-header", source)
        self.assertIn("podium-actions", source)
        self.assertIn("Scenario pool", source)
        self.assertNotIn('id="scen"', source)
        self.assertNotIn("/api/podium/scenarios/", source)
        self.assertIn("/api/podium/presentation/activate", source)
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

    def test_podium_css_has_desktop_and_responsive_layouts(self):
        source = (ROOT / "static" / "style.css").read_text()

        self.assertIn(".podium-shell", source)
        self.assertIn("max-width:1760px", source)
        self.assertIn("grid-template-columns:repeat(auto-fit,minmax(300px,1fr))", source)
        self.assertIn("grid-template-columns:minmax(360px,.9fr) minmax(560px,1.1fr)", source)
        self.assertIn("@media(max-width:1100px)", source)
        self.assertIn("@media(min-width:1500px)", source)
