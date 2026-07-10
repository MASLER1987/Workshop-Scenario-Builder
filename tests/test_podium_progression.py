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
        self.assertIn("grid-template-columns:minmax(280px,.78fr) minmax(360px,1fr) minmax(300px,.84fr)", source)
        self.assertIn("@media(max-width:1100px)", source)
        self.assertIn("@media(min-width:1500px)", source)

    def test_podium_slide_changes_have_directional_transitions(self):
        script = (ROOT / "static" / "podium.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("lastRenderedSlideId", script)
        self.assertIn("pendingSlideTransition", script)
        self.assertIn("setTransitionFromSlideIds", script)
        self.assertIn("slide-enter", script)
        self.assertIn("slide-forward", script)
        self.assertIn("slide-back", script)
        self.assertIn("@keyframes podium-slide-forward", style)
        self.assertIn("@keyframes podium-slide-back", style)
        self.assertIn("@media(prefers-reduced-motion:reduce)", style)

    def test_podium_polling_preserves_scroll_on_same_view_rerender(self):
        script = (ROOT / "static" / "podium.js").read_text()

        self.assertIn("function captureScrollState", script)
        self.assertIn("function restoreScrollState", script)
        self.assertIn("lastRenderedSlideId === slide.id", script)
        self.assertIn("restoreScrollState(scrollState)", script)
        self.assertIn(".presentation-card", script)
        self.assertIn(".curation-layout>section", script)

    def test_podium_slide_timer_and_number_badge_use_slide_duration(self):
        script = (ROOT / "static" / "podium.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("slideTimerStarts", script)
        self.assertIn("function slideTimerStartMs", script)
        self.assertIn("presentationState?.updated_at", script)
        self.assertIn("const activatedAt = presentationUpdatedAtMs()", script)
        self.assertIn("activatedAt > savedStart", script)
        self.assertIn("durationSeconds", script)
        self.assertIn("data-slide-timer", script)
        self.assertIn("setInterval(updateSlideTimer, 1000)", script)
        self.assertIn("remaining <= 60", script)
        self.assertIn("remaining <= 30", script)
        self.assertIn("digits.textContent = formatRemainingTime(remaining)", script)
        self.assertNotIn('remaining <= 30 ? formatRemainingTime(remaining) : ""', script)
        self.assertIn("slide-number-badge", script)
        self.assertNotIn("--timer-sweep", script)
        self.assertIn(".slide-timer", style)
        self.assertIn("height:clamp(68px,5.4vw,86px)", style)
        self.assertIn("border-radius:50%", style)
        self.assertIn("repeating-conic-gradient", style)
        self.assertIn(".slide-timer-hand", style)
        self.assertIn(".slide-timer-digits{", style)
        self.assertIn("opacity:1", style)
        self.assertIn(".slide-timer.timer-warning", style)
        self.assertIn(".slide-timer.timer-final .slide-timer-digits", style)
        self.assertIn("@media(max-width:1100px)", style)
        self.assertIn(".slide-timer{display:none}", style)
        self.assertIn(".slide-number-badge", style)

    def test_results_detail_opens_as_overlay_without_replacing_slide(self):
        script = (ROOT / "static" / "podium.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("function closeDetail", script)
        self.assertIn("result-detail-overlay", script)
        self.assertIn('document.body.insertAdjacentHTML("beforeend"', script)
        self.assertNotIn('app.innerHTML = `<div class="podium-shell detail-shell"', script)
        self.assertIn(".result-detail-overlay", style)
        self.assertIn("close-result-detail", script)
        self.assertIn('event.key === "Escape" && detail', script)
        self.assertIn("nextPresentation.active_slide_id !== presentationState.active_slide_id", script)

    def test_projected_results_are_paginated_and_detail_has_dedicated_score_pane(self):
        script = (ROOT / "static" / "podium.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("function resultPageSize()", script)
        self.assertIn("if (window.innerWidth >= 1500) return 8;", script)
        self.assertIn("return 4;", script)
        self.assertNotIn("if (window.innerWidth >= 1100) return 6;", script)
        self.assertIn("function pagedResultSessions()", script)
        self.assertIn("function resultsPager(page)", script)
        self.assertIn("page.rows.map(card)", script)
        self.assertIn("resultsPage = 0", script)
        self.assertIn("detail-score-pane", script)
        self.assertIn("Score and coaching", script)
        self.assertIn(".results-grid", style)
        self.assertIn("grid-template-rows:repeat(2,minmax(0,1fr))", style)
        self.assertIn(".bot-results-view{display:flex", style)
