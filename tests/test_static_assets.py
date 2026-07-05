import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class StaticAssetTests(unittest.TestCase):
    def test_index_cache_busts_participant_assets(self):
        html = (ROOT / "static" / "index.html").read_text()

        self.assertIn('/static/style.css?v=score-03', html)
        self.assertIn('/static/app.js?v=score-03', html)

    def test_podium_cache_busts_assets(self):
        html = (ROOT / "static" / "podium.html").read_text()

        self.assertIn('/static/style.css?v=score-03', html)
        self.assertIn('/static/podium.js?v=score-03', html)

    def test_participant_stream_loop_yields_to_browser_paint(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function nextPaint()", script)
        self.assertIn("await processStreamLine(line)", script)
        self.assertIn("await nextPaint()", script)

    def test_participant_renders_score_panel(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("Info captured:", script)
        self.assertIn("Bot skills", script)
        self.assertIn("Tip", script)
        self.assertIn("scorePanel(state.run.score)", script)

    def test_podium_renders_score_panel_and_best_scores(self):
        script = (ROOT / "static" / "podium.js").read_text()

        self.assertIn("best_captured", script)
        self.assertIn("best_overall", script)
        self.assertIn("scorePanel(run?.score)", script)


if __name__ == "__main__":
    unittest.main()
