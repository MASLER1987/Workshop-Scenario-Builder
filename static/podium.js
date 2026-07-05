const app = document.querySelector("#podium");
const key = new URLSearchParams(location.search).get("key");
let sessions = [];
let scenarios = [];
let summary = null;
let detail = null;
let sortMode = "leaderboard";

const api = (u, o = {}) =>
  fetch(u + (u.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key), {
    headers: { "Content-Type": "application/json" },
    ...o,
  }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });

function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return Math.floor(s) + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

async function load() {
  sessions = await api("/api/podium/sessions");
  scenarios = await api("/api/podium/scenarios");
  summary = await api("/api/podium/summary");
  renderGrid();
}

function sortedSessions() {
  const rows = [...sessions];
  if (sortMode === "improved") {
    rows.sort((a, b) => improvement(b) - improvement(a) || b.latest_captured - a.latest_captured || new Date(b.last_active_at) - new Date(a.last_active_at));
  } else {
    rows.sort((a, b) => b.best_captured - a.best_captured || b.best_rubric - a.best_rubric || new Date(b.last_active_at) - new Date(a.last_active_at));
  }
  return rows;
}

function renderGrid() {
  detail = null;
  app.innerHTML = `<div class="podium-shell"><header class="podium-header"><div class="podium-title"><h1>Prompt Playground Podium</h1><p>${sessions.length} participants live</p></div><div class="podium-actions"><span class="badge">Scenario pool: ${scenarios.length}</span><button class="btn secondary" id="reset">Reset</button></div></header>${summaryStrip()}<div class="sortbar"><button class="btn ${sortMode === "leaderboard" ? "primary" : "secondary"}" data-sort="leaderboard">Leaderboard</button><button class="btn ${sortMode === "improved" ? "primary" : "secondary"}" data-sort="improved">Most improved</button></div><section class="grid">${sortedSessions().map(card).join("")}</section></div>`;
  document.querySelectorAll(".card").forEach((c) => (c.onclick = () => openDetail(c.dataset.id)));
  document.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => {
    sortMode = b.dataset.sort;
    renderGrid();
  }));
  document.querySelector("#reset").onclick = () => confirm("Wipe sessions, instructions, and runs?") && api("/api/podium/reset", { method: "POST" }).then(load);
}

function summaryStrip() {
  const data = summary || { session_count: 0, total_runs: 0, class_average_latest_captured: 0, distribution: {} };
  const dist = Object.entries(data.distribution || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  return `<section class="summary-strip"><div><span>Participants</span><strong>${data.session_count || 0}</strong></div><div><span>Total runs</span><strong>${data.total_runs || 0}</strong></div><div><span>Class average</span><strong>${data.class_average_latest_captured || 0}/5</strong></div><div class="distribution"><span>Distribution</span><div>${dist.map(([score, count]) => `<i class="${scoreClass(score)}" title="${score}/5: ${count}" style="height:${Math.max(8, Number(count) * 12)}px"></i>`).join("")}</div></div></section>`;
}

function card(s) {
  const hot = Date.now() - new Date(s.last_active_at) < 30000 ? "hot" : "";
  const hasScore = (s.trend || []).length > 0;
  const latest = hasScore ? `${s.latest_captured}/${s.objectives_total || 5}` : "no runs yet";
  const bestRubric = hasScore ? `${s.best_rubric}/20` : "";
  return `<article class="card ${hot}" data-id="${s.id}"><h2>${esc(s.display_name)}</h2><p><span class="badge">v${s.latest_version_number || "new"}</span> ${s.run_count} runs</p><div class="card-score ${scoreClass(s.latest_captured)}"><strong>${latest}</strong>${bestRubric ? `<span>${bestRubric}</span>` : ""}</div>${progressionStrip(s.trend, s.objectives_total)}<p class="muted">${ago(s.last_active_at)}</p></article>`;
}

async function openDetail(id) {
  detail = { id, data: await api(`/api/podium/sessions/${id}`) };
  renderDetail();
}

function renderDetail(runId) {
  const d = detail.data;
  const run = runId ? d.run_history.find((r) => r.id === runId) : d.latest_run;
  const instruction = run?.instruction_text || d.latest_instruction?.text || "No instruction yet";
  const transcript = run?.transcript || [];
  app.innerHTML = `<div class="podium-shell detail-shell"><header class="podium-header detail-header"><button class="btn secondary" id="back">Back</button>${progressionHeader(d.run_history)}</header><div class="detail"><section class="pane"><h2>Instruction <span class="badge">v${run?.version_number || d.latest_instruction?.version_number || "new"}</span></h2><div class="instruction">${esc(instruction)}</div><div class="history">${d.run_history.map((r) => `<button class="btn secondary ${run?.id === r.id ? "selected" : ""}" data-run="${r.id}">v${r.version_number} ${scoreText(r)}</button>`).join("")}</div></section><section class="pane"><h2>Conversation</h2><div class="chat">${chat(transcript)}</div>${scorePanel(run?.score)}</section></div></div>`;
  document.querySelector("#back").onclick = load;
  document.querySelectorAll("[data-run]").forEach((b) => (b.onclick = () => renderDetail(b.dataset.run)));
}

function progressionHeader(history) {
  const scored = (history || []).filter((r) => r.captured !== null && r.captured !== undefined);
  if (!scored.length) return '<section class="progression-header muted">No scored runs yet.</section>';
  return `<section class="progression-header">${scored.map((r) => `<span class="${scoreClass(r.captured)}">v${r.version_number} ${r.captured}/${r.score?.total || 5}</span>`).join("<b>-></b>")}</section>`;
}

function progressionStrip(trend, total = 5) {
  const values = trend || [];
  if (!values.length) return '<div class="progression empty">No scored runs yet</div>';
  return `<div class="progression">${values.map((value) => `<i class="${scoreClass(value)}" title="${value}/${total || 5}" style="height:${Math.max(10, Number(value) * 8)}px"></i>`).join("")}</div>`;
}

function chat(t) {
  return (t || []).map((m) => `<div class="msg ${m.role === "bot" ? "bot" : "client"}"><div class="label">${m.role === "bot" ? "Bot" : "Client"}</div>${esc(m.text)}</div>`).join("") || '<p class="muted">No run yet.</p>';
}

function scorePanel(score) {
  if (!score) return '<p class="muted">No score yet.</p>';
  const results = (score.results || []).map((item) => `<li class="${item.captured ? "yes" : "no"}"><span>${item.captured ? "yes" : "no"}</span><div><strong>${esc(item.label || item.id)}</strong>${item.evidence ? `<small>${esc(item.evidence)}</small>` : ""}</div></li>`).join("");
  const skills = ["tone", "questions", "clarity", "honesty"].map((key) => skillRow(labelFor(key), score.rubric?.[key] || 0)).join("");
  return `<section class="score-panel podium-score ${scoreClass(score.captured)}"><h3>Info captured: ${score.captured} / ${score.total}</h3><ul class="objectives">${results}</ul><h3>Bot skills</h3><div class="skills">${skills}</div><div class="tip"><strong>Tip</strong><p>${esc(score.tip || "")}</p></div></section>`;
}

function skillRow(label, value) {
  const score = Math.max(0, Math.min(5, Number(value) || 0));
  return `<div class="skill"><span>${label}</span><div class="dots">${Array.from({ length: 5 }, (_, i) => `<i class="${i < score ? "on" : ""}"></i>`).join("")}</div><b>${score}/5</b></div>`;
}

function improvement(session) {
  const trend = session.trend || [];
  return trend.length ? Math.max(...trend) - trend[0] : 0;
}

function scoreText(run) {
  return run?.captured === null || run?.captured === undefined ? "unscored" : `${run.captured}/${run.score?.total || 5}`;
}

function scoreClass(value) {
  const score = Number(value) || 0;
  if (score <= 1) return "score-low";
  if (score <= 3) return "score-mid";
  return "score-high";
}

function labelFor(key) {
  return { tone: "Tone", questions: "Questions", clarity: "Clarity", honesty: "Honesty" }[key] || key;
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

setInterval(async () => {
  try {
    if (detail) {
      detail.data = await api(`/api/podium/sessions/${detail.id}`);
      summary = await api("/api/podium/summary");
      renderDetail();
    } else {
      await load();
    }
  } catch (e) {}
}, 5000);

load().catch((e) => (app.innerHTML = "<h1>Podium unavailable</h1><pre>" + esc(e.message) + "</pre>"));
