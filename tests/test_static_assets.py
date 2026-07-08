import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class StaticAssetTests(unittest.TestCase):
    def test_index_cache_busts_participant_assets(self):
        html = (ROOT / "static" / "index.html").read_text()

        self.assertIn('/static/style.css?v=presentation-17', html)
        self.assertIn('/static/presentation.js?v=presentation-17', html)
        self.assertIn('/static/app.js?v=presentation-17', html)

    def test_podium_cache_busts_assets(self):
        html = (ROOT / "static" / "podium.html").read_text()

        self.assertIn('/static/style.css?v=presentation-17', html)
        self.assertIn('/static/presentation.js?v=presentation-17', html)
        self.assertIn('/static/podium.js?v=presentation-17', html)

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

    def test_participant_renders_streamed_status_events(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn('event.type === "status"', script)
        self.assertIn("state.notice = event.text", script)

    def test_profile_screen_introduces_workshop_outcomes(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("Learn about legal technology careers", script)
        self.assertIn("Learn how we build", script)
        self.assertIn("Get hands on with AI", script)
        self.assertIn("brand-mark", script)

    def test_podium_renders_score_panel_and_best_scores(self):
        script = (ROOT / "static" / "podium.js").read_text()

        self.assertIn("best_captured", script)
        self.assertIn("best_rubric", script)
        self.assertIn("scorePanel(run?.score)", script)
        self.assertIn("brand-mark", script)

    def test_static_styles_use_vwv_brand_palette(self):
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("--brand-navy:#192543", style)
        self.assertIn("--brand-teal:#00a6c5", style)
        self.assertIn("--brand-mint:#89c8a2", style)
        self.assertIn(".brand-mark", style)
        self.assertIn(".join-box{position:absolute;top:0;right:0", style)


if __name__ == "__main__":
    unittest.main()
