import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class PresentationCompanionTests(unittest.TestCase):
    def test_schema_and_api_support_synced_presentation_state(self):
        db_source = (ROOT / "app" / "db.py").read_text()
        main_source = (ROOT / "app" / "main.py").read_text()

        self.assertIn("presentation_state", db_source)
        self.assertIn("participant_responses", db_source)
        self.assertIn("participant_response_votes", db_source)
        self.assertIn("presentation_artifacts", db_source)
        self.assertIn("presentation_slide_overrides", db_source)
        self.assertIn("presentation_slides", db_source)
        self.assertIn("/api/presentation/state", main_source)
        self.assertIn("/api/sessions/{sid}/responses", main_source)
        self.assertIn("/api/sessions/{sid}/responses/{response_id}/vote", main_source)
        self.assertIn("/api/podium/artifacts", main_source)
        self.assertIn("/api/podium/slide-overrides", main_source)
        self.assertIn("/api/podium/slides/{slide_id}", main_source)
        self.assertIn("/api/podium/slides", main_source)
        self.assertIn("/api/podium/slides/order", main_source)
        self.assertIn("active_slide_payload", main_source)
        self.assertIn("TRUNCATE runs, instructions, sessions, participant_questions, participant_response_votes, participant_responses, presentation_artifacts", main_source)

    def test_presentation_definitions_include_passive_and_interactive_slices(self):
        source = (ROOT / "static" / "presentation.js").read_text()

        self.assertIn("PRESENTATION_SLIDES", source)
        self.assertIn('template: "standard"', source)
        self.assertIn('template: "interaction"', source)
        self.assertIn('template: "qna-review"', source)
        self.assertIn('template: "requirements-capture"', source)
        self.assertIn('template: "workflow-capture"', source)
        self.assertIn('template: "bot-results"', source)
        self.assertIn('"welcome"', source)
        self.assertIn('"baseline-build"', source)
        self.assertIn('"requirements-gathering"', source)
        self.assertIn('"requirements-build"', source)
        self.assertIn('"process-map"', source)
        self.assertIn('"qna-review"', source)
        self.assertIn('participantMode: "passive"', source)
        self.assertIn('participantMode: "bot"', source)
        self.assertIn('participantMode: "requirements"', source)
        self.assertIn('participantMode: "process"', source)

    def test_participant_app_renders_companion_modes(self):
        source = (ROOT / "static" / "app.js").read_text()

        self.assertIn("loadPresentationState", source)
        self.assertIn("renderCompanion", source)
        self.assertIn("renderQna", source)
        self.assertIn("renderRequirements", source)
        self.assertIn("renderProcess", source)
        self.assertIn("captured_requirements", source)
        self.assertIn("submitResponse", source)
        self.assertIn("voteResponse", source)
        self.assertIn("activeSlide", source)
        self.assertIn("activeSlideBanner", source)
        self.assertIn("active-slide-banner", source)

    def test_podium_app_renders_presentation_controls_and_artifacts(self):
        source = (ROOT / "static" / "podium.js").read_text()

        self.assertIn("presentationState", source)
        self.assertIn("renderPresentation", source)
        self.assertIn("activateSlide", source)
        self.assertIn("saveArtifact", source)
        self.assertIn("renderByTemplate", source)
        self.assertIn("renderInteractionSlide", source)
        self.assertIn("renderQnaReviewSlide", source)
        self.assertIn("renderRequirementsSlide", source)
        self.assertIn("renderProcessSlide", source)
        self.assertIn("renderLiveSlide", source)
        self.assertIn("archiveQuestion", source)
        self.assertIn("captured-requirements", source)
        self.assertIn("process-stage-board", source)
        self.assertIn("slideOverrides", source)
        self.assertIn("effectiveSlide", source)
        self.assertIn("openSlideEditor", source)
        self.assertIn("saveSlideOverride", source)
        self.assertIn("resetSlideOverride", source)
        self.assertIn("edit-slide-panel", source)
        self.assertIn("deckSlides", source)
        self.assertIn("renderSlideList", source)
        self.assertIn("createBlankSlide", source)
        self.assertIn("saveSlideOrder", source)
        self.assertIn("slide-list-panel", source)
        self.assertIn("quick-nav-arrow", source)
        self.assertIn("live-slide-pill", source)

    def test_podium_join_box_uses_app_generated_qr_code(self):
        main_source = (ROOT / "app" / "main.py").read_text()
        podium_source = (ROOT / "static" / "podium.js").read_text()
        requirements = (ROOT / "requirements.txt").read_text()

        self.assertIn('/api/qr', main_source)
        self.assertIn('image/svg+xml', main_source)
        self.assertIn('qrcode', requirements)
        self.assertIn('qrImageUrl', podium_source)
        self.assertIn('class="qr-code"', podium_source)
        self.assertIn('/api/qr?text=', podium_source)


if __name__ == "__main__":
    unittest.main()
