const app = document.querySelector("#podium");
const key = new URLSearchParams(location.search).get("key");
let sessions = [];
let scenarios = [];
let summary = null;
let detail = null;
let sortMode = "leaderboard";
let viewMode = "presentation";
let presentationState = null;
let responses = [];
let questions = [];
let artifacts = [];
let deckSlides = PRESENTATION_SLIDES;
let deckPersisted = false;
let slideOverrides = {};
let selectedSlideIndex = 0;
let draggingSlideId = null;

const SLIDE_TEMPLATE_OPTIONS = [
  { value: "standard", label: "Standard slide", participantMode: "passive", podiumType: "slide" },
  { value: "interaction", label: "Bot building slide", participantMode: "bot", podiumType: "activity" },
  { value: "bot-results", label: "Bot results slide", participantMode: "results", podiumType: "live" },
  { value: "qna-review", label: "Q&A review slide", participantMode: "qna", podiumType: "interactive" },
  { value: "requirements-capture", label: "Requirements capture", participantMode: "requirements", podiumType: "interactive", interaction: { maxLength: 160, placeholder: "What should the intake bot collect, avoid, or explain?" } },
  { value: "workflow-capture", label: "Workflow capture", participantMode: "process", podiumType: "interactive", interaction: { maxLength: 100, placeholder: "What stage should happen in a good intake process?" } },
];

const PARTICIPANT_MODE_OPTIONS = ["passive", "bot", "results", "qna", "requirements", "process"];

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
  presentationState = await api("/api/podium/presentation");
  await loadSlideDeck();
  await loadSlideOverrides();
  selectedSlideIndex = Math.max(0, deckSlides.findIndex((slide) => slide.id === presentationState.active_slide_id));
  if (viewMode === "grid") renderGrid();
  else renderPresentation();
}

async function loadResponses(slideId) {
  responses = await api(`/api/podium/responses?slide_id=${encodeURIComponent(slideId)}`);
  artifacts = await api(`/api/podium/artifacts?slide_id=${encodeURIComponent(slideId)}`);
}

async function loadQuestions() {
  questions = await api("/api/podium/questions");
}

async function loadSlideOverrides() {
  const rows = await api("/api/podium/slide-overrides");
  slideOverrides = Object.fromEntries(rows.map((row) => [row.slide_id, row.payload || {}]));
}

async function loadSlideDeck() {
  const rows = await api("/api/podium/slides");
  deckPersisted = rows.length > 0;
  deckSlides = deckPersisted ? rows.map((row) => row.payload || {}) : PRESENTATION_SLIDES;
}

function baseSlide() {
  return deckSlides[selectedSlideIndex] || deckSlides[0] || PRESENTATION_SLIDES[0];
}

function effectiveSlide(slide = baseSlide()) {
  const override = slideOverrides[slide.id] || {};
  const interaction = slide.interaction || override.interaction
    ? { ...(slide.interaction || {}), ...(override.interaction || {}) }
    : undefined;
  const merged = {
    ...slide,
    ...override,
    id: slide.id,
    template: override.template || slide.template,
    participantMode: override.participantMode || slide.participantMode,
    podiumType: override.podiumType || slide.podiumType,
  };
  if (interaction) merged.interaction = interaction;
  return merged;
}

function currentSlide() {
  return effectiveSlide(baseSlide());
}

async function activateSlide(index) {
  selectedSlideIndex = Math.max(0, Math.min(deckSlides.length - 1, index));
  const slide = currentSlide();
  await api("/api/podium/presentation/activate", {
    method: "POST",
    body: JSON.stringify({ slide_id: slide.id, mode: slide.participantMode }),
  });
  presentationState = await api("/api/podium/presentation");
  renderPresentation();
}

async function saveArtifact(slideId, artifactType, payload) {
  await api("/api/podium/artifacts", {
    method: "POST",
    body: JSON.stringify({ slide_id: slideId, artifact_type: artifactType, payload }),
  });
  await loadResponses(slideId);
  renderPresentation();
}

function qrUrl() {
  return location.origin + "/";
}

function qrImageUrl() {
  return `/api/qr?text=${encodeURIComponent(qrUrl())}`;
}

function brandMark() {
  return '<div class="brand-mark" aria-label="VWV"><strong>vwv</strong><span></span><span></span><span></span></div>';
}

async function renderPresentation() {
  const slide = currentSlide();
  if (slide.template === "requirements-capture" || slide.template === "workflow-capture") {
    await loadResponses(slide.id);
  }
  if (slide.template === "qna-review") {
    await loadQuestions();
  }
  renderByTemplate(slide);
}

function renderByTemplate(slide) {
  const renderers = {
    standard: renderStandardSlide,
    interaction: renderInteractionSlide,
    "qna-review": renderQnaReviewSlide,
    "requirements-capture": renderRequirementsSlide,
    "workflow-capture": renderProcessSlide,
    "bot-results": renderLiveSlide,
  };
  (renderers[slide.template] || renderStandardSlide)(slide);
}

function slideShell(slide, body) {
  const section = slide.section ? `<span class="slide-section">${esc(slide.section)}</span>` : "";
  app.innerHTML = `<div class="podium-shell presentation-shell template-${esc(slide.template || "standard")}"><header class="presentation-top"><div class="slide-heading"><div class="brand-row">${brandMark()}${section}</div><h1>${esc(slide.title)}</h1></div><div class="join-box" aria-label="Join on your phone"><img class="qr-code" src="${esc(qrImageUrl())}" alt="QR code for participant app"><span class="join-caption">Scan to join</span></div></header>${body}<footer class="presentation-controls"><div class="presenter-nav"><button class="btn secondary" id="prev">Back</button><span class="slide-count">${selectedSlideIndex + 1}<i>/</i>${deckSlides.length}</span><button class="btn primary" id="next">Next</button></div><div class="presenter-tools"><button class="btn ghost" id="slide-list">Slide list</button><button class="btn ghost" id="edit-slide">Edit slide</button><button class="btn ghost" id="grid">Live grid</button><button class="btn ghost" id="reset">Reset</button></div></footer><div class="presenter-hint" aria-hidden="true">Controls</div></div>`;
  document.querySelector("#prev").onclick = () => activateSlide(selectedSlideIndex - 1);
  document.querySelector("#next").onclick = () => activateSlide(selectedSlideIndex + 1);
  document.querySelector("#slide-list").onclick = renderSlideList;
  document.querySelector("#edit-slide").onclick = () => openSlideEditor(slide);
  document.querySelector("#grid").onclick = () => {
    viewMode = "grid";
    renderGrid();
  };
  document.querySelector("#reset").onclick = () => confirm("Wipe workshop data?") && api("/api/podium/reset", { method: "POST" }).then(load);
}

function renderSlideList() {
  closeSlideEditor();
  document.querySelector(".slide-list-panel")?.remove();
  const rows = deckSlides.map((slide, index) => {
    const isLive = index === selectedSlideIndex;
    return `${slideDropZone(index)}<article class="slide-row ${isLive ? "selected" : ""}" draggable="true" data-slide-id="${esc(slide.id)}"><span class="drag-handle" role="presentation">::</span><button class="quick-nav-arrow" draggable="false" data-go-slide="${index}" aria-label="Go to slide ${index + 1}">-></button><button class="slide-row-main" draggable="false" data-go-slide="${index}"><strong>${index + 1}. ${esc(slide.title || "Untitled slide")}${isLive ? '<span class="live-slide-pill">Live</span>' : ""}</strong><small>${esc(slide.section || "slide")} · ${esc(slide.template || "standard")} · phone: ${esc(slide.participantMode || "passive")}</small></button><button class="btn secondary" draggable="false" data-edit-row="${index}">Edit</button></article>`;
  }).join("") + slideDropZone(deckSlides.length);
  document.body.insertAdjacentHTML("beforeend", `<aside class="slide-list-panel"><header><div><span class="eyebrow">Deck</span><h2>Slide list</h2></div><button type="button" class="icon-close" id="close-slide-list" aria-label="Close">x</button></header><div class="slide-list-actions"><button class="btn primary" id="new-slide">New slide</button><span>${deckPersisted ? "Saved in Railway" : "Using bundled deck"}</span></div><div class="slide-rows">${rows}</div></aside>`);
  document.querySelector("#close-slide-list").onclick = closeSlideList;
  document.querySelector("#new-slide").onclick = createBlankSlide;
  document.querySelectorAll("[data-go-slide]").forEach((button) => (button.onclick = () => {
    closeSlideList();
    activateSlide(Number(button.dataset.goSlide));
  }));
  document.querySelectorAll("[data-edit-row]").forEach((button) => (button.onclick = () => openSlideEditor(effectiveSlide(deckSlides[Number(button.dataset.editRow)]))));
  bindSlideRows();
}

function slideDropZone(index) {
  return `<div class="slide-drop-zone" data-drop-index="${index}" aria-hidden="true"></div>`;
}

function closeSlideList() {
  document.querySelector(".slide-list-panel")?.remove();
}

function bindSlideRows() {
  document.querySelectorAll(".slide-row[draggable]").forEach((row) => {
    row.ondragstart = (event) => {
      draggingSlideId = row.dataset.slideId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggingSlideId);
      row.classList.add("dragging");
    };
    row.ondragend = clearSlideDragState;
  });
  document.querySelectorAll(".slide-drop-zone[data-drop-index]").forEach((zone) => {
    zone.ondragenter = (event) => {
      if (!draggingSlideId) return;
      event.preventDefault();
      zone.classList.add("drop-target");
    };
    zone.ondragleave = (event) => {
      if (!zone.contains(event.relatedTarget)) zone.classList.remove("drop-target");
    };
    zone.ondragover = (event) => {
      if (!draggingSlideId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    };
    zone.ondrop = (event) => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData("text/plain") || draggingSlideId;
      const dropIndex = Number(zone.dataset.dropIndex);
      clearSlideDragState();
      reorderSlideToIndex(sourceId, dropIndex);
    };
  });
}

function clearSlideDragState() {
  draggingSlideId = null;
  document.querySelectorAll(".slide-row.dragging, .slide-row.drop-target, .slide-drop-zone.drop-target").forEach((row) => {
    row.classList.remove("dragging", "drop-target");
  });
}

function slideRowPositions() {
  return new Map(
    [...document.querySelectorAll(".slide-row[data-slide-id]")].map((row) => [
      row.dataset.slideId,
      row.getBoundingClientRect(),
    ])
  );
}

function animateSlideListFrom(previousPositions) {
  document.querySelectorAll(".slide-row[data-slide-id]").forEach((row) => {
    const previous = previousPositions.get(row.dataset.slideId);
    if (!previous) return;
    const current = row.getBoundingClientRect();
    const deltaY = previous.top - current.top;
    if (!deltaY) return;
    row.animate(
      [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
      { duration: 190, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  });
}

async function persistCurrentDeck() {
  const slides = deckSlides.map((slide) => effectiveSlide(slide));
  await api("/api/podium/slides", {
    method: "PUT",
    body: JSON.stringify({ slides }),
  });
  deckPersisted = true;
}

async function saveSlideOrder() {
  await persistCurrentDeck();
  await api("/api/podium/slides/order", {
    method: "PUT",
    body: JSON.stringify({ slide_ids: deckSlides.map((slide) => slide.id) }),
  });
}

async function reorderSlideToIndex(sourceId, targetIndex) {
  if (!sourceId || Number.isNaN(targetIndex)) return;
  const previousPositions = slideRowPositions();
  const activeId = currentSlide().id;
  const sourceIndex = deckSlides.findIndex((slide) => slide.id === sourceId);
  if (sourceIndex < 0) return;
  let insertionIndex = Math.max(0, Math.min(deckSlides.length, targetIndex));
  if (insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1) return;
  const next = [...deckSlides];
  const [moved] = next.splice(sourceIndex, 1);
  if (sourceIndex < insertionIndex) insertionIndex -= 1;
  next.splice(insertionIndex, 0, moved);
  deckSlides = next;
  selectedSlideIndex = Math.max(0, deckSlides.findIndex((slide) => slide.id === activeId));
  await saveSlideOrder();
  renderSlideList();
  animateSlideListFrom(previousPositions);
  renderPresentation();
}

async function createBlankSlide() {
  await persistCurrentDeck();
  const response = await api("/api/podium/slides", {
    method: "POST",
    body: JSON.stringify({ payload: blankSlidePayload() }),
  });
  const slide = response.slide?.payload;
  if (!slide) return;
  deckPersisted = true;
  deckSlides = [...deckSlides, slide];
  selectedSlideIndex = deckSlides.length - 1;
  closeSlideList();
  await activateSlide(selectedSlideIndex);
  openSlideEditor(effectiveSlide(slide));
}

function blankSlidePayload() {
  return {
    title: "Untitled slide",
    section: "custom",
    ...templateDefaults("standard"),
    body: "",
    bullets: [],
    durationSeconds: 180,
  };
}

function templateDefaults(template) {
  const option = SLIDE_TEMPLATE_OPTIONS.find((item) => item.value === template) || SLIDE_TEMPLATE_OPTIONS[0];
  const defaults = {
    template: option.value,
    podiumType: option.podiumType,
    participantMode: option.participantMode,
  };
  if (option.interaction) defaults.interaction = { ...option.interaction };
  return defaults;
}

function optionHtml(options, selectedValue) {
  return options.map((option) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return `<option value="${esc(value)}" ${value === selectedValue ? "selected" : ""}>${esc(label)}</option>`;
  }).join("");
}

function openSlideEditor(slide) {
  const existing = document.querySelector(".edit-slide-panel");
  if (existing) existing.remove();
  const bullets = (slide.bullets || []).join("\n");
  const placeholder = slide.interaction?.placeholder || "";
  document.body.insertAdjacentHTML("beforeend", `<aside class="edit-slide-panel"><form id="slide-edit-form"><header><div><span class="eyebrow">Slide editor</span><h2>${esc(slide.title)}</h2></div><button type="button" class="icon-close" id="close-editor" aria-label="Close">x</button></header><label>Template<select id="edit-template">${optionHtml(SLIDE_TEMPLATE_OPTIONS, slide.template || "standard")}</select></label><label>Phone mode<select id="edit-participant-mode">${optionHtml(PARTICIPANT_MODE_OPTIONS, slide.participantMode || "passive")}</select></label><label>Section<input id="edit-section" maxlength="80" value="${esc(slide.section || "")}"></label><label>Title<input id="edit-title" maxlength="140" value="${esc(slide.title || "")}"></label><label>Body<textarea id="edit-body" rows="6">${esc(slide.body || "")}</textarea></label><label>Bullets<textarea id="edit-bullets" rows="5" placeholder="One bullet per line">${esc(bullets)}</textarea></label><label>Phone prompt<textarea id="edit-placeholder" rows="3">${esc(placeholder)}</textarea></label><div class="edit-slide-actions"><button type="button" class="btn danger" id="delete-slide">Delete slide</button><button type="button" class="btn secondary" id="reset-slide-override">Reset default</button><button type="button" class="btn secondary" id="cancel-slide-edit">Cancel</button><button type="submit" class="btn primary">Save</button></div></form></aside>`);
  document.querySelector("#close-editor").onclick = closeSlideEditor;
  document.querySelector("#cancel-slide-edit").onclick = closeSlideEditor;
  document.querySelector("#reset-slide-override").onclick = () => resetSlideOverride(slide.id);
  document.querySelector("#delete-slide").onclick = () => deleteSlide(slide.id);
  document.querySelector("#edit-template").onchange = (event) => {
    const defaults = templateDefaults(event.target.value);
    document.querySelector("#edit-participant-mode").value = defaults.participantMode;
    if (defaults.interaction && !document.querySelector("#edit-placeholder").value.trim()) {
      document.querySelector("#edit-placeholder").value = defaults.interaction.placeholder || "";
    }
  };
  document.querySelector("#slide-edit-form").onsubmit = (event) => {
    event.preventDefault();
    saveSlideOverride(slide);
  };
}

function closeSlideEditor() {
  document.querySelector(".edit-slide-panel")?.remove();
}

async function saveSlideOverride(slide) {
  const bulletLines = document.querySelector("#edit-bullets").value.split("\n").map((line) => line.trim()).filter(Boolean);
  const template = document.querySelector("#edit-template").value;
  const defaults = templateDefaults(template);
  const payload = {
    ...defaults,
    template: document.querySelector("#edit-template").value,
    participantMode: document.querySelector("#edit-participant-mode").value,
    section: document.querySelector("#edit-section").value.trim(),
    title: document.querySelector("#edit-title").value.trim(),
    body: document.querySelector("#edit-body").value.trim(),
    bullets: bulletLines,
  };
  const placeholder = document.querySelector("#edit-placeholder");
  if (placeholder && placeholder.value.trim()) {
    payload.interaction = { ...(payload.interaction || {}), placeholder: placeholder.value.trim() };
  }
  await persistCurrentDeck();
  await api(`/api/podium/slides/${encodeURIComponent(slide.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ payload }),
  });
  slideOverrides[slide.id] = payload;
  deckSlides = deckSlides.map((item) => item.id === slide.id ? { ...item, ...payload } : item);
  if (currentSlide().id === slide.id) {
    await api("/api/podium/presentation/activate", {
      method: "POST",
      body: JSON.stringify({ slide_id: slide.id, mode: payload.participantMode }),
    });
    presentationState = await api("/api/podium/presentation");
  }
  closeSlideEditor();
  renderPresentation();
}

async function resetSlideOverride(slideId) {
  await api(`/api/podium/slide-overrides/${encodeURIComponent(slideId)}`, { method: "DELETE" });
  delete slideOverrides[slideId];
  const builtin = PRESENTATION_SLIDES.find((slide) => slide.id === slideId);
  if (builtin) {
    deckSlides = deckSlides.map((item) => item.id === slideId ? { ...builtin } : item);
    if (deckPersisted) await persistCurrentDeck();
  }
  closeSlideEditor();
  renderPresentation();
}

async function deleteSlide(slideId) {
  const button = document.querySelector("#delete-slide");
  if (!button) return;
  if (deckSlides.length <= 1) {
    button.textContent = "Cannot delete last slide";
    button.disabled = true;
    return;
  }
  if (button.dataset.confirmed !== "true") {
    button.dataset.confirmed = "true";
    button.textContent = "Are you sure?";
    button.classList.add("confirm-delete-slide");
    return;
  }
  const activeId = currentSlide().id;
  const deletedIndex = deckSlides.findIndex((slide) => slide.id === slideId);
  if (deletedIndex < 0) return;
  await persistCurrentDeck();
  await api(`/api/podium/slides/${encodeURIComponent(slideId)}`, { method: "DELETE" });
  deckSlides = deckSlides.filter((slide) => slide.id !== slideId);
  delete slideOverrides[slideId];
  if (activeId === slideId) {
    selectedSlideIndex = Math.min(deletedIndex, deckSlides.length - 1);
  } else {
    selectedSlideIndex = Math.max(0, deckSlides.findIndex((slide) => slide.id === activeId));
  }
  closeSlideEditor();
  closeSlideList();
  await activateSlide(selectedSlideIndex);
}

function renderStandardSlide(slide) {
  const bullets = (slide.bullets || []).map((item) => `<li>${esc(item)}</li>`).join("");
  slideShell(slide, `<section class="presentation-card standard-slide"><p>${esc(slide.body || "")}</p>${bullets ? `<ul>${bullets}</ul>` : ""}</section>`);
}

function renderInteractionSlide(slide) {
  const totalRuns = summary?.total_runs || 0;
  const tested = sessions.filter((session) => Number(session.run_count) > 0).length;
  const captured = artifacts.find((item) => item.artifact_type === "captured_requirements")?.payload?.items || [];
  const capturedHtml = captured.length ? `<div class="mini-requirements"><h3>Class requirements</h3><ul>${captured.map((item) => `<li>${esc(item.text || item)}</li>`).join("")}</ul></div>` : "";
  slideShell(slide, `<section class="presentation-card interaction-slide"><div><p>${esc(slide.body || "")}</p><div class="activity-metrics"><span><b>${sessions.length}</b> joined</span><span><b>${tested}</b> tested</span><span><b>${totalRuns}</b> total runs</span></div>${capturedHtml}</div><div class="activity-callout"><strong>Phone task</strong><p>${slide.participantMode === "bot" ? "Open the bot builder on your phone." : "Follow the prompt on your phone."}</p></div></section>`);
}

function renderLiveSlide(slide) {
  slideShell(slide, `<section class="bot-results-view">${summaryStrip()}<div class="sortbar"><button class="btn ${sortMode === "leaderboard" ? "primary" : "secondary"}" data-sort="leaderboard">Leaderboard</button><button class="btn ${sortMode === "improved" ? "primary" : "secondary"}" data-sort="improved">Most improved</button></div><section class="grid">${sortedSessions().map(card).join("")}</section></section>`);
  document.querySelectorAll(".card").forEach((c) => (c.onclick = () => openDetail(c.dataset.id)));
  document.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => {
    sortMode = b.dataset.sort;
    renderPresentation();
  }));
}

function renderQnaReviewSlide(slide) {
  const visibleQuestions = questions.filter((question) => !question.is_answered);
  const archivedCount = questions.length - visibleQuestions.length;
  const list = visibleQuestions.map((question) => `<article class="question-card"><div><p>${esc(question.text)}</p><small>${esc(question.display_name || "Participant")}</small></div><button class="btn primary" data-archive-question="${question.id}">Tick</button></article>`).join("");
  slideShell(slide, `<section class="qna-review"><div class="qna-summary"><p>${esc(slide.body || "")}</p><strong>${visibleQuestions.length}</strong><span>open questions</span><em>${archivedCount} archived</em></div><div class="question-list">${list || '<p class="muted">No open questions yet.</p>'}</div></section>`);
  document.querySelectorAll("[data-archive-question]").forEach((button) => (button.onclick = () => archiveQuestion(button.dataset.archiveQuestion)));
}

async function archiveQuestion(questionId) {
  await api(`/api/podium/questions/${questionId}/answered`, { method: "POST" });
  await loadQuestions();
  renderPresentation();
}

function capturedRequirements() {
  return artifacts.find((item) => item.artifact_type === "captured_requirements")?.payload?.items || [];
}

function renderRequirementsSlide(slide) {
  const captured = capturedRequirements();
  const incoming = responses.map((r) => `<article class="idea-card" draggable="true" data-response="${r.id}"><p>${esc(r.payload?.text || "")}</p><button class="btn secondary" data-capture="${r.id}">Capture</button></article>`).join("");
  const capturedHtml = captured.map((item, index) => `<li><span>${esc(item.text || item)}</span><button class="btn secondary" data-remove-req="${index}">Remove</button></li>`).join("");
  slideShell(slide, `<div class="curation-layout"><section><h2>Incoming ideas</h2><div class="idea-pool">${incoming || '<p class="muted">Waiting for student ideas...</p>'}</div></section><section class="captured-requirements drop-zone" data-requirements-drop="true"><h2>Captured requirements</h2><ol id="captured-list">${capturedHtml}</ol><p class="muted">Drag useful ideas here. These appear in the phone brief for the second bot round.</p></section></div>`);
  document.querySelectorAll("[data-capture]").forEach((button) => (button.onclick = () => captureRequirementResponse(slide.id, button.dataset.capture)));
  document.querySelectorAll("[data-remove-req]").forEach((button) => (button.onclick = () => {
    const next = captured.filter((_, index) => index !== Number(button.dataset.removeReq));
    saveArtifact(slide.id, "captured_requirements", { items: next });
  }));
  bindDraggableIdeas();
  const dropZone = document.querySelector("[data-requirements-drop]");
  if (dropZone) {
    dropZone.ondragover = allowDrop;
    dropZone.ondrop = (event) => {
      event.preventDefault();
      captureRequirementResponse(slide.id, event.dataTransfer.getData("text/plain"));
    };
  }
}

function captureRequirementResponse(slideId, responseId) {
  const captured = capturedRequirements();
  const item = responses.find((r) => r.id === responseId);
  if (!item) return;
  const next = [...captured, { text: item.payload?.text || "" }];
  saveArtifact(slideId, "captured_requirements", { items: next });
}

function processMap() {
  return artifacts.find((item) => item.artifact_type === "process_stage_map")?.payload?.stages || [
    { title: "Stage 1", items: [] },
    { title: "Stage 2", items: [] },
    { title: "Stage 3", items: [] },
    { title: "Stage 4", items: [] },
    { title: "Stage 5", items: [] },
  ];
}

function renderProcessSlide(slide) {
  const stages = processMap();
  const ideas = responses.map((r) => `<article class="idea-card" draggable="true" data-response="${r.id}"><strong>${r.votes || 0} votes</strong><p>${esc(r.payload?.text || "")}</p>${stages.map((stage, index) => `<button class="btn secondary" data-stage="${index}" data-response="${r.id}">${esc(stage.title)}</button>`).join("")}</article>`).join("");
  const board = stages.map((stage, index) => `<section class="stage drop-zone" data-stage-drop="${index}"><h3>${esc(stage.title)}</h3>${(stage.items || []).map((item) => `<p>${esc(item.text || item)}</p>`).join("")}</section>`).join("");
  slideShell(slide, `<div class="curation-layout"><section><h2>Stage suggestions</h2><div class="idea-pool">${ideas || '<p class="muted">Waiting for process-stage ideas...</p>'}</div></section><section><h2>Process stage board</h2><div class="process-stage-board">${board}</div></section></div>`);
  document.querySelectorAll("[data-stage]").forEach((button) => (button.onclick = () => {
    addProcessItemToStage(slide.id, Number(button.dataset.stage), button.dataset.response);
  }));
  bindDraggableIdeas();
  document.querySelectorAll("[data-stage-drop]").forEach((zone) => {
    zone.ondragover = allowDrop;
    zone.ondrop = (event) => {
      event.preventDefault();
      addProcessItemToStage(slide.id, Number(zone.dataset.stageDrop), event.dataTransfer.getData("text/plain"));
    };
  });
}

function addProcessItemToStage(slideId, stageIndex, responseId) {
  const stages = processMap();
  const item = responses.find((r) => r.id === responseId);
  if (!item) return;
  const next = stages.map((stage, index) => index === stageIndex ? { ...stage, items: [...(stage.items || []), { text: item.payload?.text || "" }] } : stage);
  saveArtifact(slideId, "process_stage_map", { stages: next });
}

function bindDraggableIdeas() {
  document.querySelectorAll("[draggable][data-response]").forEach((card) => {
    card.ondragstart = (event) => event.dataTransfer.setData("text/plain", card.dataset.response);
  });
}

function allowDrop(event) {
  event.preventDefault();
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
  app.innerHTML = `<div class="podium-shell"><header class="podium-header"><div class="podium-title">${brandMark()}<h1>Prompt Playground Podium</h1><p>${sessions.length} participants live</p></div><div class="podium-actions"><span class="badge">Scenario pool: ${scenarios.length}</span><button class="btn secondary" id="slides">Slides</button><button class="btn secondary" id="reset">Reset</button></div></header>${summaryStrip()}<div class="sortbar"><button class="btn ${sortMode === "leaderboard" ? "primary" : "secondary"}" data-sort="leaderboard">Leaderboard</button><button class="btn ${sortMode === "improved" ? "primary" : "secondary"}" data-sort="improved">Most improved</button></div><section class="grid">${sortedSessions().map(card).join("")}</section></div>`;
  document.querySelectorAll(".card").forEach((c) => (c.onclick = () => openDetail(c.dataset.id)));
  document.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => {
    sortMode = b.dataset.sort;
    renderGrid();
  }));
  document.querySelector("#reset").onclick = () => confirm("Wipe sessions, instructions, and runs?") && api("/api/podium/reset", { method: "POST" }).then(load);
  document.querySelector("#slides").onclick = () => {
    viewMode = "presentation";
    renderPresentation();
  };
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

function inPresentation() {
  return viewMode === "presentation" && !detail;
}

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const tag = (target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
  if (!inPresentation() || document.querySelector(".edit-slide-panel")) return;
  if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    activateSlide(selectedSlideIndex + 1);
  } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    activateSlide(selectedSlideIndex - 1);
  }
});

document.addEventListener("mousemove", (event) => {
  const nearBottom = inPresentation() && event.clientY > window.innerHeight - 132;
  app.classList.toggle("reveal-controls", nearBottom);
});

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
