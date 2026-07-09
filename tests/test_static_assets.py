import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class StaticAssetTests(unittest.TestCase):
    def test_index_cache_busts_participant_assets(self):
        html = (ROOT / "static" / "index.html").read_text()

        self.assertIn('viewport-fit=cover', html)
        self.assertIn('/static/style.css?v=presentation-31', html)
        self.assertIn('/static/presentation.js?v=presentation-20', html)
        self.assertIn('/static/app.js?v=presentation-33', html)

    def test_podium_cache_busts_assets(self):
        html = (ROOT / "static" / "podium.html").read_text()

        self.assertIn('/static/style.css?v=presentation-31', html)
        self.assertIn('/static/presentation.js?v=presentation-22', html)
        self.assertIn('/static/podium.js?v=presentation-35', html)

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
        self.assertIn("if (slideChanged || modeChanged)", script)
        self.assertNotIn('participantMode === "results" || state.mode === "transcript"', script)

    def test_participant_qna_draft_survives_slide_rerender(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function questionDraftKey()", script)
        self.assertIn('"question-draft:" + state.sid', script)
        self.assertIn("function preserveLiveInputs()", script)
        self.assertIn("preserveLiveInputs();", script)
        self.assertIn("function saveQuestionDraft()", script)
        self.assertIn("function clearQuestionDraft(", script)
        self.assertIn("const draft = questionDraft();", script)
        self.assertIn("${esc(draft)}", script)
        self.assertIn("saveQuestionDraft();", script)
        self.assertIn('updateCharacterCount(event.target, "question-count", 500);', script)
        self.assertIn("const draftKey = questionDraftKey();", script)
        self.assertIn("clearQuestionDraft(draftKey, draftValue);", script)

    def test_participant_interactive_input_survives_polling(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function responseDraftKey(type)", script)
        self.assertIn('"response-draft:" + state.sid', script)
        self.assertIn("function saveResponseDraft(type)", script)
        self.assertIn("function clearResponseDraft(type,", script)
        self.assertIn('const draft = responseDraft("requirements");', script)
        self.assertIn('const draft = responseDraft("suggestion");', script)
        self.assertIn('const draft = responseDraft("process");', script)
        self.assertIn("${esc(draft)}", script)
        self.assertIn('saveResponseDraft("requirements");', script)
        self.assertIn('saveResponseDraft("suggestion");', script)
        self.assertIn('saveResponseDraft("process");', script)
        self.assertIn('updateCharacterCount(event.target, "response-count", limit);', script)
        self.assertIn('mode === "requirements" || mode === "suggestion" || mode === "process"', script)

    def test_participant_inputs_expose_limits_and_accessible_labels(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function characterCounterHtml", script)
        self.assertIn('"instruction-count"', script)
        self.assertIn('"question-count"', script)
        self.assertIn('"response-count"', script)
        self.assertIn('class="sr-only" for="question"', script)
        self.assertIn('class="sr-only" for="response"', script)

    def test_participant_companion_avoids_internal_slide_labels(self):
        script = (ROOT / "static" / "app.js").read_text()
        banner = script.split("function activeSlideBanner", 1)[1].split("function renderPassive", 1)[0]

        self.assertIn("active-slide-banner", banner)
        self.assertNotIn("slide?.section", banner)
        self.assertIn("passive-companion", script)

    def test_client_brief_drawer_is_keyboard_and_screen_reader_accessible(self):
        script = (ROOT / "static" / "app.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("drawer-backdrop", script)
        self.assertIn('role="dialog"', script)
        self.assertIn('aria-modal="true"', script)
        self.assertIn("Close client brief", script)
        self.assertIn('event.key === "Escape"', script)
        self.assertIn("event.clientY - startY > 80", script)
        self.assertIn(".drawer-backdrop", style)
        self.assertIn(".sr-only", style)

    def test_interactive_controls_have_focus_and_reduced_motion_styles(self):
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn(".btn:focus-visible", style)
        self.assertIn(".status-live.paused", style)
        self.assertIn("@media(prefers-reduced-motion:reduce)", style)

    def test_podium_session_cards_support_keyboard_activation(self):
        script = (ROOT / "static" / "podium.js").read_text()

        self.assertIn('role="button" tabindex="0"', script)
        self.assertIn("function bindSessionCards", script)
        self.assertIn('event.key !== "Enter" && event.key !== " "', script)

    def test_submissions_clear_only_the_submitted_draft_context(self):
        script = (ROOT / "static" / "app.js").read_text()
        question = script.split("async function submitQuestion()", 1)[1].split("function renderRequirements", 1)[0]
        response = script.split("async function submitResponse(type)", 1)[1].split("async function voteResponse", 1)[0]

        self.assertIn("const submittedSlideId = state.presentation?.active_slide_id;", question)
        self.assertIn("const draftKey = questionDraftKey();", question)
        self.assertIn("clearQuestionDraft(draftKey, draftValue);", question)
        self.assertIn('$("#question") === input', question)
        self.assertIn("state.presentation?.active_slide_id === submittedSlideId", question)
        self.assertIn("const submittedSlideId = state.presentation?.active_slide_id;", response)
        self.assertIn("const draftKey = responseDraftKey(type);", response)
        self.assertIn("slide_id: submittedSlideId", response)
        self.assertIn("clearResponseDraft(type, draftKey, draftValue);", response)
        self.assertIn('$("#response") === input', response)
        self.assertIn("state.presentation?.participant_mode === type", response)

    def test_process_poll_updates_suggestions_without_remounting_input(self):
        script = (ROOT / "static" / "app.js").read_text()
        refresh = script.split("async function refreshPresentation()", 1)[1].split("async function run()", 1)[0]

        self.assertIn('id="process-responses"', script)
        self.assertIn("function updateProcessResponses()", script)
        self.assertIn("if (slideChanged || modeChanged)", refresh)
        self.assertEqual(refresh.count("render();"), 1)
        self.assertIn('if (state.presentation?.participant_mode === "process") updateProcessResponses();', refresh)
        self.assertIn("bindProcessVotes(list);", script)
        self.assertNotIn('if (slideChanged || state.presentation?.participant_mode === "process") render();', script)

    def test_stream_events_patch_transcript_and_respect_scroll_position(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("function isNearPageBottom()", script)
        self.assertIn("function appendTranscriptMessage(index)", script)
        self.assertIn("function updateTranscriptMessage(index)", script)
        self.assertIn('chat.insertAdjacentHTML("beforeend"', script)
        self.assertIn("messageText.textContent = message.text", script)
        self.assertIn('event.type === "score" || event.type === "done"', script)
        self.assertNotIn('behavior: "smooth"', script)

    def test_participant_submissions_have_in_flight_guards(self):
        script = (ROOT / "static" / "app.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("const pendingActions =", script)
        self.assertIn("if (pendingActions.profile) return;", script)
        self.assertIn("if (pendingActions.question) return;", script)
        self.assertIn("if (pendingActions.response) return;", script)
        self.assertIn("if (pendingActions.votes.has(responseId)) return;", script)
        self.assertIn('button.setAttribute("aria-busy", "true")', script)
        self.assertIn('function setButtonPending(button, isPending, idleLabel, pendingLabel = idleLabel)', script)
        self.assertIn('.phone .btn[aria-busy="true"]', style)
        self.assertIn('.phone .vote:disabled', style)
        self.assertIn('.phone .vote[aria-busy="true"]', style)
        self.assertIn("const attributes = pending ? 'disabled aria-busy=\"true\"' : voted ? \"disabled\" : \"\";", script)

    def test_retry_controls_dispatch_to_the_correct_refresh(self):
        script = (ROOT / "static" / "app.js").read_text()
        wiring = script.split('app.addEventListener("click"', 1)[1].split("function noticeContentHtml", 1)[0]

        self.assertIn('event.target.closest?.("[data-retry-state]")', wiring)
        self.assertIn('if (retry.dataset.retryState === "load") void load();', wiring)
        self.assertIn('if (retry.dataset.retryState === "presentation") void refreshPresentation();', wiring)
        self.assertIn('data-retry-state="load"', script)
        self.assertIn('retry.dataset.retryState === "presentation"', wiring)
        self.assertIn('"connection", "presentation"', script)

    def test_load_failure_poll_retries_the_full_session_state(self):
        script = (ROOT / "static" / "app.js").read_text()
        render = script.split("function render()", 1)[1].split("function renderConnectionState()", 1)[0]
        refresh = script.split("async function refreshPresentation()", 1)[1].split("async function run()", 1)[0]

        self.assertIn("if (state.loadFailed) {", render)
        self.assertNotIn("state.loadFailed && !state.presentation", render)
        self.assertIn("if (state.loadFailed) {\n    await load();\n    return;\n  }", refresh)
        self.assertLess(refresh.index("if (state.loadFailed)"), refresh.index("await loadPresentationState()"))

    def test_vote_success_is_not_relabelled_when_live_refresh_fails(self):
        script = (ROOT / "static" / "app.js").read_text()
        vote = script.split("async function voteResponse(responseId)", 1)[1].split("function drawer()", 1)[0]

        self.assertGreaterEqual(vote.count("catch (error)"), 2)
        self.assertIn("Vote sent. Live refresh is delayed; retry to refresh.", vote)
        self.assertIn("Vote not sent. Check your connection and try again.", vote)
        self.assertLess(vote.index("votedResponseIds.add(responseId)"), vote.index("await loadPresentationState()"))

    def test_stream_status_notices_end_with_the_queue_or_run(self):
        script = (ROOT / "static" / "app.js").read_text()
        handler = script.split("function handleStreamEvent(event)", 1)[1].split("function updateTranscriptHeader()", 1)[0]

        self.assertIn("function clearTransientNotice()", script)
        self.assertIn("const firstMessage = state.run.transcript.length === 0;", handler)
        self.assertIn("if (firstMessage) clearTransientNotice();", handler)
        self.assertIn('state.noticeKind = "connection";', handler)
        done = handler.split('event.type === "done"', 1)[1]
        self.assertIn("clearTransientNotice();", done)

    def test_transient_load_error_retains_stored_session_and_offers_retry(self):
        script = (ROOT / "static" / "app.js").read_text()
        style = (ROOT / "static" / "style.css").read_text()

        self.assertIn("error.status = response.status", script)
        self.assertIn("function isInvalidSessionError(error)", script)
        self.assertIn('localStorage.removeItem("sid")', script)
        self.assertIn("function renderConnectionState()", script)
        self.assertIn('data-retry-state="load"', script)
        self.assertIn(".phone .connection-view", style)
        self.assertIn(".phone .connection-copy", style)
        self.assertIn(".phone .notice-slot", style)
        self.assertIn(".phone .notice.connection", style)
        self.assertIn(".phone .notice-retry", style)
        self.assertNotIn("localStorage.clear()", script)

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
        self.assertIn(".brand-mark{display:block", style)
        self.assertIn(".presentation-top{position:relative;flex:none;display:grid", style)
        self.assertIn(".join-box{position:static", style)
        self.assertIn(".vwv-slide-rail", style)

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
        self.assertIn("Assistant Builder", script)
        self.assertIn("Write the instructions for your assistant", script)
        self.assertIn("instruction-input", script)
        self.assertIn("test-view", script)
        self.assertIn("transcript-chat", script)
        self.assertIn(".bot-builder-view,.test-view", style)
        self.assertIn(".instruction-input{flex:1", style)
        self.assertIn(".transcript-chat{flex:1", style)

    def test_phone_clears_class_requirements_when_reset_removes_artifact(self):
        script = (ROOT / "static" / "app.js").read_text()

        self.assertIn("state.captured_requirements = presentation.captured_requirements", script)
        self.assertNotIn("state.presentation.captured_requirements || state.captured_requirements", script)

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
