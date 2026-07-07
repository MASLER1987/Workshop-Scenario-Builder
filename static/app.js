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
};

const api = (url, opt = {}) =>
  fetch(url, { headers: { "Content-Type": "application/json" }, ...opt }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function saveDraft() {
  const input = $("#instruction");
  if (input && state.sid) localStorage["draft:" + state.sid] = input.value;
}

function render() {
  if (!state.sid) {
    app.innerHTML = `<h1>Prompt Playground</h1><p class="muted">Test your intake chatbot against a simulated legal client.</p><input id="name" maxlength="40" placeholder="Your name"><p><button class="btn primary" id="start">Start</button></p>`;
    $("#start").onclick = start;
    return;
  }
  const participantMode = state.presentation?.participant_mode || "qna";
  if ((participantMode === "results" || state.mode === "transcript") && state.run) {
    renderTranscript();
    return;
  }
  if (participantMode !== "bot") {
    renderCompanion(participantMode);
    return;
  }
  app.innerHTML = `<div class="top"><strong>${esc(state.name)}</strong><span class="badge">v${state.version || "new"}</span></div><h2>Write your chatbot instruction</h2>${capturedRequirementsHtml()}<textarea id="instruction" maxlength="4000" placeholder="Write the instructions for your intake chatbot...">${esc(state.instruction)}</textarea><div class="bar"><button class="btn secondary" id="brief">Client brief</button><button class="btn primary" id="run">Run test</button></div>`;
  $("#instruction").oninput = (e) => {
    state.instruction = e.target.value;
    saveDraft();
  };
  $("#brief").onclick = drawer;
  $("#run").onclick = run;
}

async function start() {
  state.name = $("#name").value.trim();
  if (!state.name) return;
  const r = await api("/api/sessions", { method: "POST", body: JSON.stringify({ display_name: state.name }) });
  state.sid = r.session_id;
  localStorage.sid = state.sid;
  localStorage.name = state.name;
  await load();
}

async function load() {
  try {
    const r = await api(`/api/sessions/${state.sid}/state`);
    state.name = r.display_name;
    state.scenario = r.active_scenario;
    state.captured_requirements = r.captured_requirements;
    state.instruction = localStorage["draft:" + state.sid] || r.latest_instruction?.text || "";
    state.version = r.latest_instruction?.version_number || 0;
    state.run = r.latest_run;
    await loadPresentationState();
    state.mode = state.presentation?.participant_mode === "results" && state.run ? "transcript" : "editor";
    state.streaming = false;
    state.notice = "";
    render();
  } catch (e) {
    localStorage.clear();
    state.sid = null;
    render();
  }
}

async function loadPresentationState() {
  state.presentation = await api("/api/presentation/state");
  state.captured_requirements = state.presentation.captured_requirements || state.captured_requirements;
  if (state.presentation.participant_mode === "process") {
    state.responses = await api(`/api/presentation/responses?slide_id=${encodeURIComponent(state.presentation.active_slide_id)}`);
  }
}

async function refreshPresentation() {
  if (!state.sid || state.streaming) return;
  try {
    const before = state.presentation?.active_slide_id;
    await loadPresentationState();
    if (state.presentation?.active_slide_id !== before || state.presentation?.participant_mode === "process") render();
  } catch (e) {}
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
  state.notice = "";
  render();
  try {
    const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opt });
    if (!response.ok) throw new Error(await response.text());
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
      state.notice = "connection lost - partial conversation shown";
      state.streaming = false;
      render();
    }
  } catch (e) {
    state.notice = state.run.transcript.length ? "connection lost - partial conversation shown" : e.message;
    state.streaming = false;
    render();
  }
}

async function processStreamLine(line) {
  if (!line.trim()) return;
  handleStreamEvent(JSON.parse(line));
  await nextPaint();
}

function handleStreamEvent(event) {
  if (event.type === "run_start") {
    state.version = event.version_number;
    state.run.version_number = event.version_number;
  } else if (event.type === "message_start") {
    state.run.transcript.push({ role: event.role, text: "", streaming: true });
  } else if (event.type === "delta") {
    const msg = state.run.transcript[state.run.transcript.length - 1];
    if (msg) msg.text += event.text;
  } else if (event.type === "message_end") {
    const msg = state.run.transcript[state.run.transcript.length - 1];
    if (msg) msg.streaming = false;
  } else if (event.type === "status") {
    state.notice = event.text || "";
  } else if (event.type === "error") {
    const msg = state.run.transcript[state.run.transcript.length - 1];
    if (msg) msg.streaming = false;
    state.notice = event.detail || "connection lost - partial conversation shown";
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
  }
  render();
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
}

function renderTranscript() {
  const reason = state.streaming
    ? "running..."
    : state.run.ended_reason === "client_ended"
      ? "conversation ended naturally"
      : state.run.ended_reason === "error"
        ? "ended with an error"
        : "reached turn limit";
  app.innerHTML = `<div class="top"><h2>Test - v${state.run.version_number || state.version || "new"}</h2><span class="tag">${reason}</span></div>${state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ""}<div class="chat">${chat(state.run.transcript)}</div>${scorePanel(state.run.score)}<div class="bar"><button class="btn primary" id="edit" ${state.streaming ? "disabled" : ""}>Edit instruction</button><button class="btn secondary" id="again" ${state.streaming ? "disabled" : ""}>Run again</button></div>`;
  $("#edit").onclick = () => {
    if (state.streaming) return;
    state.mode = "editor";
    render();
  };
  $("#again").onclick = () => {
    if (!state.streaming) rerun();
  };
}

function renderCompanion(mode) {
  const slide = typeof presentationSlide === "function" ? presentationSlide(state.presentation?.active_slide_id) : null;
  if (mode === "requirements") {
    renderRequirements(slide);
  } else if (mode === "process") {
    renderProcess(slide);
  } else if (mode === "qna") {
    renderQna(slide);
  } else {
    renderPassive(slide);
  }
}

function renderPassive(slide) {
  app.innerHTML = `<div class="top"><strong>${esc(state.name)}</strong><span class="badge">Connected</span></div><section class="companion"><p class="eyebrow">On screen</p><h1>${esc(slide?.title || "Workshop")}</h1><p>${esc(slide?.body || "Watch the screen. You can ask a question at any time.")}</p><button class="btn secondary" id="qna">Ask a question</button></section>`;
  $("#qna").onclick = () => renderQna(slide);
}

function renderQna(slide) {
  app.innerHTML = `<div class="top"><strong>${esc(state.name)}</strong><span class="badge">Q&A</span></div><section class="companion"><p class="eyebrow">On screen</p><h1>${esc(slide?.title || "Questions")}</h1><p class="muted">Ask a question for the presenters.</p><textarea id="question" maxlength="500" class="short" placeholder="Type your question..."></textarea><p><button class="btn primary" id="send-question">Send question</button></p>${state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ""}</section>`;
  $("#send-question").onclick = submitQuestion;
}

async function submitQuestion() {
  const text = $("#question").value.trim();
  if (!text) return;
  await api(`/api/sessions/${state.sid}/questions`, { method: "POST", body: JSON.stringify({ text }) });
  state.notice = "Question sent.";
  renderQna(typeof presentationSlide === "function" ? presentationSlide(state.presentation?.active_slide_id) : null);
}

function renderRequirements(slide) {
  app.innerHTML = `<div class="top"><strong>${esc(state.name)}</strong><span class="badge">Requirements</span></div><section class="companion"><p class="eyebrow">Interactive slide</p><h1>${esc(slide?.title || "What matters for intake?")}</h1><p>Suggest something the bot should collect, avoid, or explain.</p><textarea id="response" maxlength="160" class="short" placeholder="${esc(state.presentation?.interaction?.placeholder || "Your idea...")}"></textarea><p><button class="btn primary" id="send-response">Send idea</button></p>${state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ""}</section>`;
  $("#send-response").onclick = () => submitResponse("requirements");
}

function renderProcess(slide) {
  const suggestions = (state.responses || []).map((item) => `<li><button class="vote" data-vote="${item.id}">+${item.votes || 0}</button><span>${esc(item.payload?.text || "")}</span></li>`).join("");
  app.innerHTML = `<div class="top"><strong>${esc(state.name)}</strong><span class="badge">Process map</span></div><section class="companion"><p class="eyebrow">Interactive slide</p><h1>${esc(slide?.title || "Matter intake stages")}</h1><p>Suggest a stage, or upvote one that looks useful.</p><textarea id="response" maxlength="100" class="short" placeholder="${esc(state.presentation?.interaction?.placeholder || "Suggest a stage...")}"></textarea><p><button class="btn primary" id="send-response">Send stage</button></p><ul class="phone-list">${suggestions}</ul>${state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ""}</section>`;
  $("#send-response").onclick = () => submitResponse("process");
  document.querySelectorAll("[data-vote]").forEach((button) => (button.onclick = () => voteResponse(button.dataset.vote)));
}

async function submitResponse(type) {
  const text = $("#response").value.trim();
  if (!text) return;
  await api(`/api/sessions/${state.sid}/responses`, {
    method: "POST",
    body: JSON.stringify({
      slide_id: state.presentation.active_slide_id,
      response_type: type,
      payload: { text },
    }),
  });
  state.notice = "Sent.";
  await loadPresentationState();
  render();
}

async function voteResponse(responseId) {
  await api(`/api/sessions/${state.sid}/responses/${responseId}/vote`, { method: "POST" });
  await loadPresentationState();
  render();
}

function drawer() {
  const d = document.createElement("div");
  d.className = "drawer";
  d.innerHTML = `<button class="btn secondary close">x</button><h2>${esc(state.scenario?.title || "Client brief")}</h2><p>${esc(state.scenario?.public_brief || "")}</p>${capturedRequirementsHtml()}`;
  document.body.append(d);
  d.querySelector("button").onclick = () => d.remove();
}

function capturedRequirementsHtml() {
  const items = state.captured_requirements?.items || [];
  if (!items.length) return "";
  return `<h3>Class requirements</h3><ul>${items.map((item) => `<li>${esc(item.text || item)}</li>`).join("")}</ul>`;
}

function chat(t) {
  const seen = {};
  return (t || []).map((m, index) => {
    const roleName = m.role === "bot" ? "Your bot" : "Client";
    const label = seen[m.role] ? "" : `<div class="label">${roleName}</div>`;
    seen[m.role] = true;
    return `<div class="msg ${m.role === "bot" ? "bot" : "client"}" data-message="${index}">${label}<span>${esc(m.text)}</span>${m.streaming ? '<span class="typing">...</span>' : ""}</div>`;
  }).join("");
}

function scorePanel(score) {
  if (!score) return state.streaming ? '<section class="score-panel"><p class="muted">Scoring your bot...</p></section>' : "";
  const results = (score.results || []).map((item) => `<li class="${item.captured ? "yes" : "no"}"><span>${item.captured ? "yes" : "no"}</span><div><strong>${esc(item.label || item.id)}</strong>${item.evidence ? `<small>${esc(item.evidence)}</small>` : ""}</div></li>`).join("");
  const skills = ["tone", "questions", "clarity", "honesty"].map((key) => skillRow(labelFor(key), score.rubric?.[key] || 0)).join("");
  return `<section class="score-panel"><h3>Info captured: ${score.captured} / ${score.total}</h3><ul class="objectives">${results}</ul><h3>Bot skills</h3><div class="skills">${skills}</div><div class="tip"><strong>Tip</strong><p>${esc(score.tip || "")}</p></div></section>`;
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
