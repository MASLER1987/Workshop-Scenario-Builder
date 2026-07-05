import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class StaticAssetTests(unittest.TestCase):
    def test_index_cache_busts_participant_assets(self):
        html = (ROOT / "static" / "index.html").read_text()

        self.assertIn('/static/style.css?v=', html)
        self.assertIn('/static/app.js?v=', html)

    def test_participant_stream_loop_yields_to_browser_paint(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function nextPaint()", script)
        self.assertIn("await processStreamLine(line)", script)
        self.assertIn("await nextPaint()", script)


if __name__ == "__main__":
    unittest.main()
