import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class StaticAssetTests(unittest.TestCase):
    def test_index_cache_busts_participant_assets(self):
        html = (ROOT / "static" / "index.html").read_text()

        self.assertIn('viewport-fit=cover', html)
        self.assertIn('/static/style.css?v=presentation-25', html)
        self.assertIn('/static/presentation.js?v=presentation-18', html)
        self.assertIn('/static/app.js?v=presentation-26', html)

    def test_podium_cache_busts_assets(self):
        html = (ROOT / "static" / "podium.html").read_text()

        self.assertIn('/static/style.css?v=presentation-22', html)
        self.assertIn('/static/presentation.js?v=presentation-20', html)
        self.assertIn('/static/podium.js?v=presentation-23', html)

    def test_participant_stream_loop_yields_to_browser_paint(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function nextPaint()", script)
        self.assertIn("await processStreamLine(line)", script)
        self.assertIn("await nextPaint()", script)

    def test_participant_renders_score_panel(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("Info captured:", script)
        self.assertIn("Instruction strength", script)
        self.assertIn("Tip", script)
        self.assertIn("scorePanel(state.run.score)", script)

    def test_participant_renders_streamed_status_events(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn('event.type === "status"', script)
        self.assertIn("state.notice = event.text", script)

    def test_participant_slide_change_can_leave_transcript_view(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function shouldShowTranscript(participantMode)", script)
        self.assertIn('participantMode === "results" || (participantMode === "bot" && state.mode === "transcript")', script)
        self.assertIn("function syncModeToPresentation()", script)
        self.assertIn("if (slideChanged) syncModeToPresentation()", script)
        self.assertNotIn('participantMode === "results" || state.mode === "transcript"', script)

    def test_participant_qna_draft_survives_slide_rerender(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function questionDraftKey()", script)
        self.assertIn('"question-draft:" + state.sid', script)
        self.assertIn("function saveQuestionDraft()", script)
        self.assertIn("function clearQuestionDraft()", script)
        self.assertIn("${esc(questionDraft())}", script)
        self.assertIn('$("#question").oninput = saveQuestionDraft', script)
        self.assertIn("clearQuestionDraft();", script)

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

    def test_participant_mobile_layout_uses_safe_native_viewport(self):
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("min-height:100dvh", style)
        self.assertIn("env(safe-area-inset-bottom)", style)
        self.assertIn(".bar .btn{flex:1", style)
        self.assertIn("@media(max-width:430px)", style)
        self.assertIn("touch-action:manipulation", style)
        self.assertIn(".phone-screen{display:flex", style)
        self.assertIn(".phone-action .btn{width:100%", style)

    def test_bot_builder_and_test_views_have_mobile_layout_hooks(self):
        script = (ROOT / "static" / "app.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("bot-builder-view", script)
        self.assertIn("instruction-input", script)
        self.assertIn("test-view", script)
        self.assertIn("transcript-chat", script)
        self.assertIn(".bot-builder-view,.test-view", style)
        self.assertIn(".instruction-input{flex:1", style)
        self.assertIn(".transcript-chat{flex:1", style)

    def test_all_participant_modes_use_mobile_screen_layout(self):
        script = (ROOT / "static" / "app.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertGreaterEqual(script.count("phone-screen"), 7)
        self.assertGreaterEqual(script.count("phone-action"), 4)
        self.assertIn("companion-view", script)
        self.assertIn("input-companion", script)
        self.assertIn("phone-textarea", script)
        self.assertIn(".companion-view", style)
        self.assertIn(".phone-textarea{flex:1", style)


if __name__ == "__main__":
    unittest.main()
