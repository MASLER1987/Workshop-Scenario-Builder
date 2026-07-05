const app = document.querySelector("#podium");
const key = new URLSearchParams(location.search).get("key");
let sessions = [];
let scenarios = [];
let detail = null;

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
  renderGrid();
}

function renderGrid() {
  detail = null;
  app.innerHTML = `<header><h1>Prompt Playground Podium</h1><div><strong>${sessions.length}</strong> participants</div><select id="scen">${scenarios.map((s) => `<option value="${s.id}" ${s.is_active ? "selected" : ""}>${esc(s.title)}</option>`).join("")}</select><button class="btn secondary" id="reset">Reset</button></header><section class="grid">${sessions.map(card).join("")}</section>`;
  document.querySelectorAll(".card").forEach((c) => (c.onclick = () => openDetail(c.dataset.id)));
  document.querySelector("#scen").onchange = (e) => api(`/api/podium/scenarios/${e.target.value}/activate`, { method: "POST" }).then(load);
  document.querySelector("#reset").onclick = () => confirm("Wipe sessions, instructions, and runs?") && api("/api/podium/reset", { method: "POST" }).then(load);
}

function card(s) {
  const hot = Date.now() - new Date(s.last_active_at) < 30000 ? "hot" : "";
  const score = s.best_total ? `${s.best_captured}/${s.best_total} &middot; ${s.best_overall}/20` : "No score yet";
  return `<article class="card ${hot}" data-id="${s.id}"><h2>${esc(s.display_name)}</h2><p><span class="badge">v${s.latest_version_number || "new"}</span> ${s.run_count} runs</p><p class="scoreline">${score}</p><p class="muted">${ago(s.last_active_at)}</p></article>`;
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
  app.innerHTML = `<button class="btn secondary" id="back">Back</button><div class="detail"><section class="pane"><h2>Instruction <span class="badge">v${run?.version_number || d.latest_instruction?.version_number || "new"}</span></h2><div class="instruction">${esc(instruction)}</div><div class="history">${d.run_history.map((r) => `<button class="btn secondary" data-run="${r.id}">v${r.version_number} ${new Date(r.created_at).toLocaleTimeString()}</button>`).join("")}</div></section><section class="pane"><h2>Latest conversation</h2><div class="chat">${chat(transcript)}</div>${scorePanel(run?.score)}</section></div>`;
  document.querySelector("#back").onclick = load;
  document.querySelectorAll("[data-run]").forEach((b) => (b.onclick = () => renderDetail(b.dataset.run)));
}

function chat(t) {
  return (t || []).map((m) => `<div class="msg ${m.role === "bot" ? "bot" : "client"}"><div class="label">${m.role === "bot" ? "Bot" : "Client"}</div>${esc(m.text)}</div>`).join("") || '<p class="muted">No run yet.</p>';
}

function scorePanel(score) {
  if (!score) return '<p class="muted">No score yet.</p>';
  const results = (score.results || []).map((item) => `<li class="${item.captured ? "yes" : "no"}"><span>${item.captured ? "yes" : "no"}</span><div><strong>${esc(item.label || item.id)}</strong>${item.evidence ? `<small>${esc(item.evidence)}</small>` : ""}</div></li>`).join("");
  const skills = ["tone", "questions", "clarity", "honesty"].map((key) => skillRow(labelFor(key), score.rubric?.[key] || 0)).join("");
  return `<section class="score-panel podium-score"><h3>Info captured: ${score.captured} / ${score.total}</h3><ul class="objectives">${results}</ul><h3>Bot skills</h3><div class="skills">${skills}</div><div class="tip"><strong>Tip</strong><p>${esc(score.tip || "")}</p></div></section>`;
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

setInterval(async () => {
  try {
    if (detail) {
      detail.data = await api(`/api/podium/sessions/${detail.id}`);
      renderDetail();
    } else {
      await load();
    }
  } catch (e) {}
}, 5000);

load().catch((e) => (app.innerHTML = "<h1>Podium unavailable</h1><pre>" + esc(e.message) + "</pre>"));
