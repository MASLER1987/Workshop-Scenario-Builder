const $ = (s) => document.querySelector(s);
const app = $("#app");

let state = {
  sid: localStorage.sid,
  name: localStorage.name || "",
  instruction: "",
  version: 0,
  run: null,
  scenario: null,
  presentation: null,
  captured_requirements: null,
  responses: [],
  mode: "init",
  streaming: false,
  notice: "",
  noticeKind: "",
  noticeRetry: "",
  loadFailed: false,
};

const pendingActions = {
  profile: false,
  load: false,
  question: false,
  response: false,
  votes: new Set(),
};
const votedResponseIds = new Set();
let presentationRefreshPending = false;

app.addEventListener("click", (event) => {
  const retry = event.target.closest?.("[data-retry-state]");
  if (!retry || retry.disabled) return;
  if (retry.dataset.retryState === "load") void load();
  if (retry.dataset.retryState === "presentation") void refreshPresentation();
});

function noticeContentHtml() {
  if (!state.notice) return "";
  const kind = state.noticeKind === "success" ? "success" : state.noticeKind === "connection" ? "connection" : "";
  const retry = state.noticeRetry
    ? `<button type="button" class="notice-retry" data-retry-state="${esc(state.noticeRetry)}">Retry</button>`
    : "";
  return `<div class="notice ${kind}"><span>${esc(state.notice)}</span>${retry}</div>`;
}

function noticeHtml() {
  return `<div class="notice-slot" data-notice aria-live="polite">${noticeContentHtml()}</div>`;
}

function updateNotice() {
  const notice = $("[data-notice]");
  if (notice) notice.innerHTML = noticeContentHtml();
}

function setNotice(text, kind = "", retry = "") {
  state.notice = text;
  state.noticeKind = kind;
  state.noticeRetry = retry;
  updateNotice();
}

function clearConnectionNotice() {
  if (state.noticeKind === "connection" && state.noticeRetry === "presentation") setNotice("");
}

function clearTransientNotice() {
  if (state.noticeKind !== "connection") setNotice("");
}

async function responseError(response) {
  const raw = await response.text();
  let message = raw || `Request failed (${response.status})`;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.detail === "string") message = parsed.detail;
  } catch (e) {}
  const error = new Error(message);
  error.status = response.status;
  return error;
}

async function api(url, opt = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opt });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

function isInvalidSessionError(error) {
  return error?.status === 404 || error?.status === 410 || error?.status === 422;
}

function setButtonPending(button, isPending, idleLabel, pendingLabel = idleLabel) {
  if (!button) return;
  if (isPending) {
    button.dataset.idleLabel = idleLabel || button.textContent;
    button.textContent = pendingLabel;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    return;
  }
  button.textContent = button.dataset.idleLabel || idleLabel || button.textContent;
  button.disabled = false;
  button.removeAttribute("aria-busy");
  delete button.dataset.idleLabel;
}

function primarySubmitButton(id, label, pending, pendingLabel) {
  const attributes = pending ? 'disabled aria-busy="true"' : "";
  return `<button class="btn primary" id="${id}" ${attributes}>${pending ? pendingLabel : label}</button>`;
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function saveDraft() {
  const input = $("#instruction");
  if (input && state.sid) localStorage["draft:" + state.sid] = input.value;
}

function questionDraftKey() {
  return state.sid ? "question-draft:" + state.sid : "";
}

function questionDraft() {
  const key = questionDraftKey();
  return key ? localStorage[key] || "" : "";
}

function saveQuestionDraft() {
  const key = questionDraftKey();
  const input = $("#question");
  if (key && input) localStorage[key] = input.value;
}

function clearQuestionDraft(key = questionDraftKey(), expectedValue) {
  if (!key) return;
  if (expectedValue === undefined || localStorage[key] === expectedValue) delete localStorage[key];
}

function responseDraftKey(type) {
  const slideId = state.presentation?.active_slide_id || "current";
  return state.sid ? "response-draft:" + state.sid + ":" + slideId + ":" + type : "";
}

function responseDraft(type) {
  const key = responseDraftKey(type);
  return key ? localStorage[key] || "" : "";
}

function saveResponseDraft(type) {
  const key = responseDraftKey(type);
  const input = $("#response");
  if (key && input) localStorage[key] = input.value;
}

function clearResponseDraft(type, key = responseDraftKey(type), expectedValue) {
  if (!key) return;
  if (expectedValue === undefined || localStorage[key] === expectedValue) delete localStorage[key];
}

function preserveLiveInputs() {
  saveQuestionDraft();
  const response = $("#response");
  if (response) {
    const mode = state.presentation?.participant_mode;
    if (mode === "requirements" || mode === "suggestion" || mode === "process") saveResponseDraft(mode);
  }
}

function characterCounterHtml(value, maxLength, id) {
  return `<div class="input-meta"><span id="${id}" aria-live="polite">${String(value || "").length} / ${maxLength}</span></div>`;
}

function updateCharacterCount(input, id, maxLength = input?.maxLength || 0) {
  const counter = document.querySelector(`#${id}`);
  if (counter && input) counter.textContent = `${input.value.length} / ${maxLength}`;
}

function responseLimit(fallback) {
  return Number(state.presentation?.interaction?.maxLength) || fallback;
}

function render() {
  if (!state.sid) {
    app.innerHTML = `<section class="phone-screen profile-intro">${brandMark()}<p class="eyebrow">Legal technology workshop</p><h1>Welcome</h1><p class="muted">Create your profile, then keep this page open during the presentation.</p><ol class="outcomes"><li><strong>Learn about legal technology careers</strong></li><li><strong>Learn how we build</strong></li><li><strong>Get hands on with AI</strong></li></ol><label for="name">Your name</label><input id="name" maxlength="40" placeholder="Your name" value="${esc(state.name)}">${noticeHtml()}<div class="phone-action">${primarySubmitButton("start", "Start", pendingActions.profile, "Joining...")}</div></section>`;
    $("#start").onclick = start;
    return;
  }
  if (state.loadFailed) {
    renderConnectionState();
    return;
  }
  const participantMode = state.presentation?.participant_mode || "qna";
  if (shouldShowTranscript(participantMode)) {
    renderTranscript();
    return;
  }
  if (participantMode !== "bot") {
    renderCompanion(participantMode);
    return;
  }
  app.innerHTML = `<section class="phone-screen bot-builder-view"><header class="bot-workspace-head"><div><strong>${esc(state.name)}</strong><h1>Assistant Builder</h1></div><span class="badge">v${state.version || "new"}</span></header>${noticeHtml()}${capturedRequirementsHtml()}<label class="instruction-editor" for="instruction"><div class="instruction-editor-head"><span>Instructions</span><small id="instruction-count">${state.instruction.length} / 4000</small></div><textarea id="instruction" class="instruction-input" maxlength="4000" placeholder="Write the instructions for your assistant...">${esc(state.instruction)}</textarea></label></section><div class="bar"><button class="btn secondary" id="brief">Client brief</button><button class="btn primary" id="run" ${state.instruction.trim() ? "" : "disabled"}>Run test</button></div>`;
  $("#instruction").oninput = (e) => {
    state.instruction = e.target.value;
    $("#run").disabled = !state.instruction.trim();
    updateCharacterCount(e.target, "instruction-count", 4000);
    saveDraft();
  };
  $("#brief").onclick = drawer;
  $("#run").onclick = run;
}

function renderConnectionState() {
  app.innerHTML = `<section class="phone-screen connection-view">${phoneHead("Reconnecting", "paused")}<div class="connection-copy"><p class="eyebrow">Connection paused</p><h1>Your place is still saved</h1><p class="muted">Your session and drafts are staying on this phone while we reconnect.</p>${noticeHtml()}</div><div class="phone-action"><button type="button" class="btn primary" data-retry-state="load" ${pendingActions.load ? 'disabled aria-busy="true"' : ""}>${pendingActions.load ? "Retrying..." : "Retry connection"}</button></div></section>`;
}

function shouldShowTranscript(participantMode) {
  if (!state.run) return false;
  return participantMode === "results" || (participantMode === "bot" && state.mode === "transcript");
}

function syncModeToPresentation() {
  const participantMode = state.presentation?.participant_mode || "qna";
  state.mode = participantMode === "results" && state.run ? "transcript" : "editor";
}

async function start() {
  if (pendingActions.profile) return;
  state.name = $("#name").value.trim();
  if (!state.name) return;
  localStorage.name = state.name;
  pendingActions.profile = true;
  const button = $("#start");
  setButtonPending(button, true, "Start", "Joining...");
  try {
    const r = await api("/api/sessions", { method: "POST", body: JSON.stringify({ display_name: state.name }) });
    state.sid = r.session_id;
    localStorage.sid = state.sid;
    await load();
  } catch (error) {
    setNotice("We couldn't connect yet. Check your connection and try again.", "connection");
  } finally {
    pendingActions.profile = false;
    setButtonPending($("#start"), false, "Start");
  }
}

async function load() {
  if (pendingActions.load) return;
  pendingActions.load = true;
  setButtonPending($("[data-retry-state=\"load\"]"), true, "Retry connection", "Retrying...");
  try {
    let r;
    try {
      r = await api(`/api/sessions/${state.sid}/state`);
    } catch (error) {
      if (!isInvalidSessionError(error)) throw error;
      localStorage.removeItem("sid");
      state.sid = null;
      state.presentation = null;
      state.run = null;
      state.scenario = null;
      state.responses = [];
      state.loadFailed = false;
      setNotice("That workshop session is no longer available. Enter your name to join again.", "connection");
      render();
      return;
    }
    state.name = r.display_name;
    state.scenario = r.active_scenario;
    state.captured_requirements = r.captured_requirements;
    state.instruction = localStorage["draft:" + state.sid] || r.latest_instruction?.text || "";
    state.version = r.latest_instruction?.version_number || 0;
    state.run = r.latest_run;
    await loadPresentationState();
    syncModeToPresentation();
    state.streaming = false;
    state.loadFailed = false;
    setNotice("");
    render();
  } catch (error) {
    state.loadFailed = true;
    setNotice("We couldn't reconnect. Your session and drafts are still saved.", "connection");
    renderConnectionState();
  } finally {
    pendingActions.load = false;
    setButtonPending($("[data-retry-state=\"load\"]"), false, "Retry connection");
  }
}

async function loadPresentationState() {
  const presentation = await api("/api/presentation/state");
  const responses = presentation.participant_mode === "process"
    ? await api(`/api/presentation/responses?slide_id=${encodeURIComponent(presentation.active_slide_id)}`)
    : [];
  state.presentation = presentation;
  state.captured_requirements = presentation.captured_requirements;
  state.responses = responses;
}

async function refreshPresentation() {
  if (!state.sid || state.streaming || presentationRefreshPending) return;
  if (state.loadFailed) {
    await load();
    return;
  }
  presentationRefreshPending = true;
  try {
    preserveLiveInputs();
    const beforeSlide = state.presentation?.active_slide_id;
    const beforeMode = state.presentation?.participant_mode;
    await loadPresentationState();
    const slideChanged = state.presentation?.active_slide_id !== beforeSlide;
    const modeChanged = state.presentation?.participant_mode !== beforeMode;
    clearConnectionNotice();
    if (slideChanged || modeChanged) {
      syncModeToPresentation();
      render();
      return;
    }
    if (state.presentation?.participant_mode === "process") updateProcessResponses();
  } catch (error) {
    setNotice("Live updates are paused. Your draft is safe and we'll retry automatically.", "connection", "presentation");
  } finally {
    presentationRefreshPending = false;
  }
}

async function run() {
  const text = state.instruction;
  await streamRun(`/api/sessions/${state.sid}/run`, { method: "POST", body: JSON.stringify({ instruction_text: text }) });
}

async function rerun() {
  await streamRun(`/api/sessions/${state.sid}/rerun`, { method: "POST" });
}

async function streamRun(url, opt) {
  state.run = { version_number: state.version, transcript: [], ended_reason: "" };
  state.mode = "transcript";
  state.streaming = true;
  setNotice("");
  render();
  try {
    const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opt });
    if (!response.ok) throw await responseError(response);
    if (!response.body) throw new Error("Streaming is not available in this browser.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) await processStreamLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) await processStreamLine(buffer);
    if (state.streaming) {
      finishInterruptedStream("Connection lost. The partial conversation is still shown.");
    }
  } catch (error) {
    const message = state.run.transcript.length
      ? "Connection lost. The partial conversation is still shown."
      : error.message || "The test could not start. Please try again.";
    finishInterruptedStream(message);
  }
}

function pageScrollHeight() {
  return Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0);
}

function isNearPageBottom() {
  return pageScrollHeight() - (window.scrollY + window.innerHeight) <= 120;
}

function followPageBottom(shouldFollow) {
  if (!shouldFollow) return;
  requestAnimationFrame(() => window.scrollTo({ top: pageScrollHeight(), behavior: "auto" }));
}

function renderTranscriptPreservingScroll(shouldFollow, scrollTop) {
  renderTranscript();
  requestAnimationFrame(() => {
    const top = shouldFollow ? pageScrollHeight() : Math.min(scrollTop, pageScrollHeight());
    window.scrollTo({ top, behavior: "auto" });
  });
}

function finishInterruptedStream(message) {
  const shouldFollow = isNearPageBottom();
  const scrollTop = window.scrollY;
  state.streaming = false;
  state.run.transcript.forEach((item) => {
    item.streaming = false;
  });
  setNotice(message, "connection");
  renderTranscriptPreservingScroll(shouldFollow, scrollTop);
}

async function processStreamLine(line) {
  if (!line.trim()) return;
  handleStreamEvent(JSON.parse(line));
  await nextPaint();
}

function handleStreamEvent(event) {
  const shouldFollow = isNearPageBottom();
  const scrollTop = window.scrollY;
  let messageIndex = state.run.transcript.length - 1;
  if (event.type === "run_start") {
    state.version = event.version_number;
    state.run.version_number = event.version_number;
  } else if (event.type === "message_start") {
    const firstMessage = state.run.transcript.length === 0;
    if (firstMessage) clearTransientNotice();
    state.run.transcript.push({ role: event.role, text: "", streaming: true });
    messageIndex = state.run.transcript.length - 1;
  } else if (event.type === "delta") {
    const msg = state.run.transcript[state.run.transcript.length - 1];
    if (msg) msg.text += event.text;
  } else if (event.type === "message_end") {
    const msg = state.run.transcript[state.run.transcript.length - 1];
    if (msg) msg.streaming = false;
  } else if (event.type === "status") {
    state.notice = event.text || "";
    state.noticeKind = "";
    state.noticeRetry = "";
  } else if (event.type === "error") {
    const msg = state.run.transcript[state.run.transcript.length - 1];
    if (msg) msg.streaming = false;
    state.notice = event.detail || "connection lost - partial conversation shown";
    state.noticeKind = "connection";
    state.noticeRetry = "";
  } else if (event.type === "score") {
    const { type, ...score } = event;
    state.run.score = score;
  } else if (event.type === "done") {
    state.run.run_id = event.run_id;
    state.run.ended_reason = event.ended_reason;
    state.run.transcript.forEach((msg) => {
      msg.streaming = false;
    });
    state.streaming = false;
    clearTransientNotice();
  }

  const requiresFullRender = event.type === "score" || event.type === "done";
  if (requiresFullRender) {
    renderTranscriptPreservingScroll(shouldFollow, scrollTop);
    return;
  }
  if (event.type === "run_start") updateTranscriptHeader();
  if (event.type === "message_start") appendTranscriptMessage(messageIndex);
  if (event.type === "delta" || event.type === "message_end" || event.type === "error") updateTranscriptMessage(messageIndex);
  if (event.type === "status" || event.type === "error") updateNotice();
  followPageBottom(shouldFollow);
}

function updateTranscriptHeader() {
  const version = $("[data-run-version]");
  if (version) version.textContent = `v${state.run.version_number || state.version || "new"}`;
}

function appendTranscriptMessage(index) {
  const chat = $(".transcript-chat");
  const message = state.run.transcript[index];
  if (!chat || !message) return;
  const showLabel = !state.run.transcript.slice(0, index).some((item) => item.role === message.role);
  chat.insertAdjacentHTML("beforeend", transcriptMessageHtml(message, index, showLabel));
}

function updateTranscriptMessage(index) {
  const message = state.run.transcript[index];
  const messageElement = document.querySelector(`[data-message="${index}"]`);
  if (!message || !messageElement) return;
  const messageText = messageElement.querySelector(".message-text");
  if (messageText) messageText.textContent = message.text;
  const typing = messageElement.querySelector(".typing");
  if (!message.streaming && typing) typing.remove();
}

function renderTranscript() {
  const reason = state.streaming
    ? "running..."
    : state.run.ended_reason === "client_ended"
      ? "conversation ended naturally"
      : state.run.ended_reason === "error"
        ? "ended with an error"
        : "reached turn limit";
  app.innerHTML = `<section class="phone-screen test-view"><header class="bot-workspace-head test-head"><div><span class="eyebrow">Bot test</span><h1 data-run-version>v${state.run.version_number || state.version || "new"}</h1></div><span class="tag">${reason}</span></header>${noticeHtml()}<div class="chat transcript-chat">${chat(state.run.transcript)}</div>${scorePanel(state.run.score)}</section><div class="bar"><button class="btn primary" id="edit" ${state.streaming ? "disabled" : ""}>Edit instruction</button><button class="btn secondary" id="again" ${state.streaming ? "disabled" : ""}>Run again</button></div>`;
  $("#edit").onclick = () => {
    if (state.streaming) return;
    state.mode = "editor";
    render();
  };
  $("#again").onclick = () => {
    if (!state.streaming) rerun();
  };
}

function brandMark() {
  return '<img class="brand-mark" src="/static/vwv-logo.png?v=1" width="799" height="191" alt="VWV">';
}

function renderCompanion(mode) {
  const slide = activeSlide();
  if (mode === "requirements") {
    renderRequirements(slide);
  } else if (mode === "suggestion") {
    renderSuggestion(slide);
  } else if (mode === "process") {
    renderProcess(slide);
  } else if (mode === "qna") {
    renderQna(slide);
  } else {
    renderPassive(slide);
  }
}

function activeSlide() {
  return state.presentation?.active_slide || (typeof presentationSlide === "function" ? presentationSlide(state.presentation?.active_slide_id) : null);
}

function phoneHead(status, statusClass = "") {
  return `<header class="phone-head">${brandMark()}<span class="badge status-live ${esc(statusClass)}">${esc(status)}</span></header>`;
}

function activeSlideBanner(slide, label = "Live slide") {
  return `<div class="active-slide-banner"><span>${esc(label)}</span><strong>${esc(slide?.title || "Workshop")}</strong></div>`;
}

function renderPassive(slide) {
  app.innerHTML = `<section class="phone-screen companion-view">${phoneHead("Connected")}${activeSlideBanner(slide)}${noticeHtml()}<div class="companion passive-companion"><p>${esc(slide?.body || "Watch the screen. You can ask a question at any time.")}</p></div><div class="phone-action"><button class="btn secondary" id="qna">Ask a question</button></div></section>`;
  $("#qna").onclick = () => renderQna(slide);
}

function renderQna(slide) {
  const draft = questionDraft();
  app.innerHTML = `<section class="phone-screen companion-view">${phoneHead("Q&A")}${activeSlideBanner(slide)}<div class="companion input-companion"><h1>Ask a question</h1><p class="muted">Send it to the presenters for this slide.</p><label class="sr-only" for="question">Your question</label><textarea id="question" maxlength="500" class="short phone-textarea" placeholder="Type your question...">${esc(draft)}</textarea>${characterCounterHtml(draft, 500, "question-count")}${noticeHtml()}<div class="phone-action">${primarySubmitButton("send-question", "Send question", pendingActions.question, "Sending...")}</div></div></section>`;
  $("#question").oninput = (event) => {
    saveQuestionDraft();
    updateCharacterCount(event.target, "question-count", 500);
  };
  $("#send-question").onclick = submitQuestion;
}

async function submitQuestion() {
  if (pendingActions.question) return;
  const input = $("#question");
  const submittedValue = input.value;
  const draftValue = submittedValue;
  const text = submittedValue.trim();
  if (!text) return;
  const submittedSlideId = state.presentation?.active_slide_id;
  const draftKey = questionDraftKey();
  pendingActions.question = true;
  setButtonPending($("#send-question"), true, "Send question", "Sending...");
  try {
    await api(`/api/sessions/${state.sid}/questions`, { method: "POST", body: JSON.stringify({ text }) });
    clearQuestionDraft(draftKey, draftValue);
    if ($("#question") === input && state.presentation?.active_slide_id === submittedSlideId) {
      input.value = "";
      updateCharacterCount(input, "question-count", 500);
    }
    setNotice("Question sent.", "success");
  } catch (error) {
    setNotice("Question not sent. Check your connection and try again.", "connection");
  } finally {
    pendingActions.question = false;
    setButtonPending($("#send-question"), false, "Send question");
  }
}

function renderRequirements(slide) {
  const limit = responseLimit(160);
  const draft = responseDraft("requirements");
  app.innerHTML = `<section class="phone-screen companion-view">${phoneHead("Requirements")}${activeSlideBanner(slide, "Interactive now")}<div class="companion input-companion"><h1>${esc(slide?.body || "What should the bot collect, avoid, or explain?")}</h1><label class="sr-only" for="response">Your requirement idea</label><textarea id="response" maxlength="${limit}" class="short phone-textarea compact-textarea" placeholder="${esc(state.presentation?.interaction?.placeholder || "Your idea...")}">${esc(draft)}</textarea>${characterCounterHtml(draft, limit, "response-count")}${noticeHtml()}<div class="phone-action">${primarySubmitButton("send-response", "Send idea", pendingActions.response, "Sending...")}</div></div></section>`;
  $("#response").oninput = (event) => {
    saveResponseDraft("requirements");
    updateCharacterCount(event.target, "response-count", limit);
  };
  $("#send-response").onclick = () => submitResponse("requirements");
}

function renderSuggestion(slide) {
  const limit = responseLimit(160);
  const draft = responseDraft("suggestion");
  app.innerHTML = `<section class="phone-screen companion-view">${phoneHead("Suggestions")}${activeSlideBanner(slide, "Interactive now")}<div class="companion input-companion"><h1>Share an idea</h1><p>${esc(slide?.body || "Send a suggestion for the presenters.")}</p><label class="sr-only" for="response">Your suggestion</label><textarea id="response" maxlength="${limit}" class="short phone-textarea compact-textarea" placeholder="${esc(state.presentation?.interaction?.placeholder || "Your suggestion...")}">${esc(draft)}</textarea>${characterCounterHtml(draft, limit, "response-count")}${noticeHtml()}<div class="phone-action">${primarySubmitButton("send-response", "Send suggestion", pendingActions.response, "Sending...")}</div></div></section>`;
  $("#response").oninput = (event) => {
    saveResponseDraft("suggestion");
    updateCharacterCount(event.target, "response-count", limit);
  };
  $("#send-response").onclick = () => submitResponse("suggestion");
}

function renderProcess(slide) {
  const limit = responseLimit(100);
  const draft = responseDraft("process");
  app.innerHTML = `<section class="phone-screen companion-view">${phoneHead("Process map")}${activeSlideBanner(slide, "Interactive now")}<div class="companion input-companion"><h1>Build the process</h1><p>${esc(slide?.body || "Suggest a stage, or upvote one that looks useful.")}</p><label class="sr-only" for="response">Your process stage</label><textarea id="response" maxlength="${limit}" class="short phone-textarea compact-textarea" placeholder="${esc(state.presentation?.interaction?.placeholder || "Suggest a stage...")}">${esc(draft)}</textarea>${characterCounterHtml(draft, limit, "response-count")}${noticeHtml()}<div class="phone-action">${primarySubmitButton("send-response", "Send stage", pendingActions.response, "Sending...")}</div><ul class="phone-list" id="process-responses">${processResponsesHtml()}</ul></div></section>`;
  $("#response").oninput = (event) => {
    saveResponseDraft("process");
    updateCharacterCount(event.target, "response-count", limit);
  };
  $("#send-response").onclick = () => submitResponse("process");
  bindProcessVotes();
}

function processResponsesHtml() {
  return (state.responses || []).map((item) => {
    const responseId = String(item.id);
    const pending = pendingActions.votes.has(responseId);
    const voted = votedResponseIds.has(responseId);
    const label = pending ? "Voting..." : voted ? "Voted" : `+${item.votes || 0}`;
    const attributes = pending ? 'disabled aria-busy="true"' : voted ? "disabled" : "";
    return `<li><button class="vote" data-vote="${esc(responseId)}" ${attributes}>${label}</button><span>${esc(item.payload?.text || "")}</span></li>`;
  }).join("");
}

function bindProcessVotes(root = document) {
  root.querySelectorAll("[data-vote]").forEach((button) => {
    button.onclick = () => voteResponse(button.dataset.vote);
  });
}

function updateProcessResponses() {
  const list = $("#process-responses");
  if (!list) return;
  const focusedVote = document.activeElement?.dataset?.vote || "";
  list.innerHTML = processResponsesHtml();
  bindProcessVotes(list);
  if (focusedVote) {
    const replacement = Array.from(list.querySelectorAll("[data-vote]")).find((button) => button.dataset.vote === focusedVote);
    if (replacement) replacement.focus({ preventScroll: true });
  }
}

async function submitResponse(type) {
  if (pendingActions.response) return;
  const input = $("#response");
  const submittedValue = input.value;
  const draftValue = submittedValue;
  const text = submittedValue.trim();
  if (!text) return;
  const submittedSlideId = state.presentation?.active_slide_id;
  const draftKey = responseDraftKey(type);
  const idleLabel = type === "process" ? "Send stage" : type === "suggestion" ? "Send suggestion" : "Send idea";
  pendingActions.response = true;
  setButtonPending($("#send-response"), true, idleLabel, "Sending...");
  let presentationChanged = false;
  try {
    await api(`/api/sessions/${state.sid}/responses`, {
      method: "POST",
      body: JSON.stringify({
        slide_id: submittedSlideId,
        response_type: type,
        payload: { text },
      }),
    });
    clearResponseDraft(type, draftKey, draftValue);
    if ($("#response") === input && state.presentation?.active_slide_id === submittedSlideId && state.presentation?.participant_mode === type) {
      input.value = "";
      updateCharacterCount(input, "response-count", input.maxLength);
    }
    setNotice(type === "process" ? "Stage sent." : type === "suggestion" ? "Suggestion sent." : "Idea sent.", "success");
    const beforeSlide = state.presentation?.active_slide_id;
    const beforeMode = state.presentation?.participant_mode;
    try {
      await loadPresentationState();
      presentationChanged = state.presentation?.active_slide_id !== beforeSlide || state.presentation?.participant_mode !== beforeMode;
    } catch (error) {
      setNotice("Sent. Live updates are paused; retry to refresh.", "connection", "presentation");
    }
  } catch (error) {
    setNotice("Response not sent. Check your connection and try again.", "connection");
  } finally {
    pendingActions.response = false;
    setButtonPending($("#send-response"), false, idleLabel);
  }
  if (presentationChanged) {
    syncModeToPresentation();
    render();
  } else if (state.presentation?.participant_mode === "process") {
    updateProcessResponses();
  }
}

async function voteResponse(responseId) {
  responseId = String(responseId);
  if (pendingActions.votes.has(responseId)) return;
  pendingActions.votes.add(responseId);
  updateProcessResponses();
  let presentationChanged = false;
  let votePosted = false;
  try {
    await api(`/api/sessions/${state.sid}/responses/${responseId}/vote`, { method: "POST" });
    votePosted = true;
    votedResponseIds.add(responseId);
    const beforeSlide = state.presentation?.active_slide_id;
    const beforeMode = state.presentation?.participant_mode;
    try {
      await loadPresentationState();
      presentationChanged = state.presentation?.active_slide_id !== beforeSlide || state.presentation?.participant_mode !== beforeMode;
    } catch (error) {
      setNotice("Vote sent. Live refresh is delayed; retry to refresh.", "connection", "presentation");
    }
  } catch (error) {
    if (!votePosted) setNotice("Vote not sent. Check your connection and try again.", "connection");
  } finally {
    pendingActions.votes.delete(responseId);
  }
  if (presentationChanged) {
    syncModeToPresentation();
    render();
  } else {
    updateProcessResponses();
  }
}

function drawer() {
  const backdrop = document.createElement("div");
  backdrop.className = "drawer-backdrop";
  backdrop.innerHTML = `<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="client-brief-title"><div class="drawer-handle" aria-hidden="true"></div><button type="button" class="icon-close drawer-close" aria-label="Close client brief">&times;</button><h2 id="client-brief-title">${esc(state.scenario?.title || "Client brief")}</h2><p>${esc(state.scenario?.public_brief || "")}</p>${capturedRequirementsHtml()}</section>`;
  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    document.body.classList.remove("drawer-open");
    backdrop.remove();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
  };
  backdrop.onclick = (event) => {
    if (event.target === backdrop) close();
  };
  const sheet = backdrop.querySelector(".drawer");
  let startY = null;
  sheet.addEventListener("pointerdown", (event) => {
    startY = event.clientY;
  });
  sheet.addEventListener("pointerup", (event) => {
    if (startY !== null && event.clientY - startY > 80) close();
    startY = null;
  });
  backdrop.querySelector(".drawer-close").onclick = close;
  document.addEventListener("keydown", onKeyDown);
  document.body.classList.add("drawer-open");
  document.body.append(backdrop);
  backdrop.querySelector(".drawer-close").focus();
}

function capturedRequirementsHtml() {
  const items = state.captured_requirements?.items || [];
  if (!items.length) return "";
  return `<section class="class-requirements"><h2>Class requirements</h2><ul>${items.map((item) => `<li>${esc(item.text || item)}</li>`).join("")}</ul></section>`;
}

function chat(t) {
  const seen = {};
  return (t || []).map((m, index) => {
    const showLabel = !seen[m.role];
    seen[m.role] = true;
    return transcriptMessageHtml(m, index, showLabel);
  }).join("");
}

function transcriptMessageHtml(message, index, showLabel) {
  const roleName = message.role === "bot" ? "Your bot" : "Client";
  const label = showLabel ? `<div class="label">${roleName}</div>` : "";
  return `<div class="msg ${message.role === "bot" ? "bot" : "client"}" data-message="${index}">${label}<span class="message-text">${esc(message.text)}</span>${message.streaming ? '<span class="typing">...</span>' : ""}</div>`;
}

function scorePanel(score) {
  if (!score) return state.streaming ? '<section class="score-panel"><p class="muted">Scoring your bot...</p></section>' : "";
  const results = (score.results || []).map((item) => `<li class="${item.captured ? "yes" : "no"}"><span>${item.captured ? "yes" : "no"}</span><div><strong>${esc(item.label || item.id)}</strong>${item.evidence ? `<small>${esc(item.evidence)}</small>` : ""}</div></li>`).join("");
  const skills = ["tone", "questions", "clarity", "honesty"].map((key) => skillRow(labelFor(key), score.rubric?.[key] || 0)).join("");
  return `<section class="score-panel"><h3>Info captured: ${score.captured} / ${score.total}</h3><ul class="objectives">${results}</ul><h3>Instruction strength</h3><div class="skills">${skills}</div><div class="tip"><strong>Tip</strong><p>${esc(score.tip || "")}</p></div></section>`;
}

function skillRow(label, value) {
  const score = Math.max(0, Math.min(5, Number(value) || 0));
  return `<div class="skill"><span>${label}</span><div class="dots">${Array.from({ length: 5 }, (_, i) => `<i class="${i < score ? "on" : ""}"></i>`).join("")}</div><b>${score}/5</b></div>`;
}

function labelFor(key) {
  return { tone: "Tone", questions: "Questions", clarity: "Clarity", honesty: "Honesty" }[key] || key;
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

setInterval(refreshPresentation, 5000);
state.sid ? load() : render();
