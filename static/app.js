const $ = (s) => document.querySelector(s);
const app = $("#app");

let state = {
  sid: localStorage.sid,
  name: localStorage.name || "",
  instruction: "",
  version: 0,
  run: null,
  scenario: null,
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
  if (state.mode === "transcript" && state.run) {
    renderTranscript();
    return;
  }
  app.innerHTML = `<div class="top"><strong>${esc(state.name)}</strong><span class="badge">v${state.version || "new"}</span></div><h2>Write your chatbot instruction</h2><textarea id="instruction" maxlength="4000" placeholder="Write the instructions for your intake chatbot...">${esc(state.instruction)}</textarea><div class="bar"><button class="btn secondary" id="brief">Client brief</button><button class="btn primary" id="run">Run test</button></div>`;
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
    state.instruction = localStorage["draft:" + state.sid] || r.latest_instruction?.text || "";
    state.version = r.latest_instruction?.version_number || 0;
    state.run = r.latest_run;
    state.mode = state.run ? "transcript" : "editor";
    state.streaming = false;
    state.notice = "";
    render();
  } catch (e) {
    localStorage.clear();
    state.sid = null;
    render();
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

function drawer() {
  const d = document.createElement("div");
  d.className = "drawer";
  d.innerHTML = `<button class="btn secondary close">x</button><h2>${esc(state.scenario?.title || "Client brief")}</h2><p>${esc(state.scenario?.public_brief || "")}</p>`;
  document.body.append(d);
  d.querySelector("button").onclick = () => d.remove();
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

state.sid ? load() : render();
