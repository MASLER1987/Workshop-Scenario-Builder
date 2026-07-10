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
let lastRenderedSlideId = null;
let pendingSlideTransition = "none";
let slideTimerInterval = null;
let slideTimerStarts = loadSlideTimerStarts();
let resultsPage = 0;
let pendingSlideImage = null;
let pendingSlideImageFile = null;
let pendingSlideImagePreviewUrl = "";
let slideEditorDirty = false;

const SLIDE_ASSIGNEES = ["JS", "MC", "MH", "EW"];
const SLIDE_DURATIONS = [2, 5, 10, 15];
const SLIDE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SLIDE_IMAGE_BYTES = 5 * 1024 * 1024;
const TEMPLATE_EDITOR_FIELDS = {
  standard: ["body", "bullets", "image"],
  interaction: ["body", "bullets", "phonePrompt"],
  "bot-results": [],
  "qna-review": ["body"],
  "suggestion-capture": ["body", "phonePrompt"],
  "requirements-capture": ["body", "phonePrompt"],
  "workflow-capture": ["body", "phonePrompt"],
};
const PARTICIPANT_MODE_LABELS = {
  passive: "Follow the presentation",
  bot: "Assistant Builder",
  results: "Latest bot result",
  qna: "Q&A",
  suggestion: "Suggestion input",
  requirements: "Requirements input",
  process: "Process input and voting",
};

const SLIDE_TEMPLATE_OPTIONS = [
  { value: "standard", label: "Standard slide", participantMode: "passive", podiumType: "slide" },
  { value: "interaction", label: "Assistant Builder slide", participantMode: "bot", podiumType: "activity", interaction: { placeholder: "Open the Assistant Builder on your phone." } },
  { value: "bot-results", label: "Bot results slide", participantMode: "results", podiumType: "live" },
  { value: "qna-review", label: "Q&A review slide", participantMode: "qna", podiumType: "interactive" },
  { value: "suggestion-capture", label: "Suggestion capture", participantMode: "suggestion", podiumType: "interactive", interaction: { maxLength: 160, placeholder: "Share an idea for the discussion." } },
  { value: "requirements-capture", label: "Requirements capture", participantMode: "requirements", podiumType: "interactive", interaction: { maxLength: 160, placeholder: "What should the intake bot collect, avoid, or explain?" } },
  { value: "workflow-capture", label: "Workflow capture", participantMode: "process", podiumType: "interactive", interaction: { maxLength: 100, placeholder: "What stage should happen in a good intake process?" } },
];

const PARTICIPANT_MODE_OPTIONS = ["passive", "bot", "results", "qna", "suggestion", "requirements", "process"];

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
  const previousSlideId = lastRenderedSlideId;
  sessions = await api("/api/podium/sessions");
  scenarios = await api("/api/podium/scenarios");
  summary = await api("/api/podium/summary");
  presentationState = await api("/api/podium/presentation");
  await loadSlideDeck();
  await loadSlideOverrides();
  selectedSlideIndex = Math.max(0, deckSlides.findIndex((slide) => slide.id === presentationState.active_slide_id));
  setTransitionFromSlideIds(previousSlideId, presentationState.active_slide_id);
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
  const slides = deckPersisted ? rows.map((row) => row.payload || {}) : PRESENTATION_SLIDES;
  deckSlides = slides.map(normaliseSlidePlanning);
}

function normaliseSlidePlanning(slide) {
  const minutes = Math.max(0, Number(slide.durationSeconds) / 60 || 0);
  const duration = minutes
    ? minutes > 10
      ? 15
      : SLIDE_DURATIONS.reduce((nearest, value) => Math.abs(value - minutes) < Math.abs(nearest - minutes) ? value : nearest, SLIDE_DURATIONS[0])
    : 5;
  return {
    ...slide,
    assignee: SLIDE_ASSIGNEES.includes(slide.assignee) ? slide.assignee : SLIDE_ASSIGNEES[0],
    durationSeconds: duration * 60,
  };
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
  const previousIndex = selectedSlideIndex;
  selectedSlideIndex = Math.max(0, Math.min(deckSlides.length - 1, index));
  pendingSlideTransition = selectedSlideIndex < previousIndex ? "back" : selectedSlideIndex > previousIndex ? "forward" : "none";
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
  return '<img class="brand-mark" src="/static/vwv-logo.png?v=1" width="799" height="191" alt="VWV">';
}

function slideTimerStorageKey() {
  return `podium-slide-timer-starts:${key || "local"}`;
}

function loadSlideTimerStarts() {
  try {
    return JSON.parse(sessionStorage.getItem(slideTimerStorageKey()) || "{}");
  } catch (e) {
    return {};
  }
}

function saveSlideTimerStarts() {
  try {
    sessionStorage.setItem(slideTimerStorageKey(), JSON.stringify(slideTimerStarts));
  } catch (e) {}
}

function resetSlideTimerStarts() {
  slideTimerStarts = {};
  try {
    sessionStorage.removeItem(slideTimerStorageKey());
  } catch (e) {}
}

function slideNumber(slide) {
  const index = deckSlides.findIndex((item) => item.id === slide.id);
  return index >= 0 ? index + 1 : selectedSlideIndex + 1;
}

function slideNumberBadge(slide) {
  return `<span class="slide-number-badge" aria-label="Slide ${slideNumber(slide)} of ${deckSlides.length}"><span>${slideNumber(slide)}</span><i>/</i>${deckSlides.length}</span>`;
}

function slideDurationSeconds(slide) {
  const duration = Number(slide.durationSeconds);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function presentationUpdatedAtMs() {
  const parsed = Date.parse(presentationState?.updated_at || "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function slideTimerStartMs(slide) {
  const activatedAt = presentationUpdatedAtMs();
  const savedStart = Number(slideTimerStarts[slide.id]) || 0;
  if (!savedStart || activatedAt > savedStart) {
    slideTimerStarts[slide.id] = activatedAt;
    saveSlideTimerStarts();
  }
  return Number(slideTimerStarts[slide.id]) || Date.now();
}

function formatRemainingTime(seconds) {
  const remaining = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(remaining / 60);
  return `${minutes}:${String(remaining % 60).padStart(2, "0")}`;
}

function slideTimerHtml(slide) {
  const duration = slideDurationSeconds(slide);
  if (!duration) return "";
  return `<div class="slide-timer" data-slide-timer data-slide-id="${esc(slide.id)}" data-slide-number="${slideNumber(slide)}" data-duration-seconds="${duration}" data-started-at="${slideTimerStartMs(slide)}" role="timer" aria-live="off"><div class="slide-timer-face"><span class="slide-timer-hand"></span><span class="slide-timer-digits" aria-hidden="true"></span></div></div>`;
}

function stopSlideTimer() {
  if (slideTimerInterval) {
    clearInterval(slideTimerInterval);
    slideTimerInterval = null;
  }
}

function updateSlideTimer() {
  const timer = document.querySelector("[data-slide-timer]");
  if (!timer) return;
  const duration = Number(timer.dataset.durationSeconds) || 0;
  const startedAt = Number(timer.dataset.startedAt) || Date.now();
  const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
  const remaining = Math.max(0, duration - elapsed);
  const ratio = duration ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  const handAngle = (1 - ratio) * 360;
  timer.style.setProperty("--timer-hand-angle", `${handAngle}deg`);
  timer.classList.toggle("timer-warning", remaining <= 60);
  timer.classList.toggle("timer-final", remaining <= 30);
  timer.classList.toggle("timer-expired", remaining <= 0);
  const digits = timer.querySelector(".slide-timer-digits");
  if (digits) digits.textContent = formatRemainingTime(remaining);
  timer.setAttribute("aria-label", `Slide ${timer.dataset.slideNumber} timer: ${formatRemainingTime(remaining)} remaining`);
}

function startSlideTimer() {
  stopSlideTimer();
  updateSlideTimer();
  slideTimerInterval = setInterval(updateSlideTimer, 1000);
}

async function renderPresentation() {
  app.classList.add("presentation-mode");
  const slide = currentSlide();
  if (slide.template === "requirements-capture" || slide.template === "suggestion-capture" || slide.template === "workflow-capture") {
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
    "suggestion-capture": renderSuggestionSlide,
    "requirements-capture": renderRequirementsSlide,
    "workflow-capture": renderProcessSlide,
    "bot-results": renderLiveSlide,
  };
  (renderers[slide.template] || renderStandardSlide)(slide);
}

function setTransitionFromSlideIds(previousSlideId, nextSlideId) {
  if (!previousSlideId || !nextSlideId || previousSlideId === nextSlideId) return;
  const previousIndex = deckSlides.findIndex((slide) => slide.id === previousSlideId);
  const nextIndex = deckSlides.findIndex((slide) => slide.id === nextSlideId);
  if (previousIndex < 0 || nextIndex < 0) {
    pendingSlideTransition = "forward";
    return;
  }
  pendingSlideTransition = nextIndex < previousIndex ? "back" : "forward";
}

function slideTransitionClass(direction) {
  if (direction === "forward") return " slide-enter slide-forward";
  if (direction === "back") return " slide-enter slide-back";
  return "";
}

function captureScrollState(selectors) {
  return {
    window: { x: window.scrollX, y: window.scrollY },
    elements: selectors.map((selector) => ({
      selector,
      values: Array.from(document.querySelectorAll(selector)).map((el) => ({ left: el.scrollLeft, top: el.scrollTop })),
    })),
  };
}

function restoreScrollState(state) {
  if (!state) return;
  requestAnimationFrame(() => {
    window.scrollTo(state.window.x, state.window.y);
    state.elements.forEach((entry) => {
      document.querySelectorAll(entry.selector).forEach((el, index) => {
        const value = entry.values[index];
        if (value) {
          el.scrollLeft = value.left;
          el.scrollTop = value.top;
        }
      });
    });
  });
}

function slideShell(slide, body) {
  const shouldAnimate = lastRenderedSlideId && lastRenderedSlideId !== slide.id && pendingSlideTransition !== "none";
  const transitionClass = shouldAnimate ? slideTransitionClass(pendingSlideTransition) : "";
  const scrollState = lastRenderedSlideId === slide.id ? captureScrollState([
    ".presentation-card",
    ".interaction-slide",
    ".curation-layout>section",
    ".question-list",
    ".bot-results-view",
  ]) : null;
  app.innerHTML = `<div class="podium-shell presentation-shell template-${esc(slide.template || "standard")}${transitionClass}"><div class="vwv-slide-rail" aria-hidden="true"><i></i><i></i><i></i></div><header class="presentation-top"><div class="slide-heading"><div class="brand-row">${brandMark()}</div><h1>${slideNumberBadge(slide)}<span class="slide-title-text">${esc(slide.title)}</span></h1></div><div class="join-box" aria-label="Join on your phone"><img class="qr-code" src="${esc(qrImageUrl())}" alt="QR code for participant app"><span class="join-caption">Scan to join</span></div></header>${body}<footer class="presentation-controls"><div class="presenter-nav"><button class="btn secondary" id="prev">Back</button><span class="slide-count">${selectedSlideIndex + 1}<i>/</i>${deckSlides.length}</span><button class="btn primary" id="next">Next</button></div><div class="presenter-tools"><button class="btn ghost" id="slide-list">Slide list</button><button class="btn ghost" id="edit-slide">Edit slide</button><button class="btn ghost" id="grid">Live grid</button><button class="btn ghost" id="reset">Reset</button></div></footer>${slideTimerHtml(slide)}<div class="presenter-hint" aria-hidden="true">Controls</div></div>`;
  lastRenderedSlideId = slide.id;
  pendingSlideTransition = "none";
  document.querySelector("#prev").onclick = () => activateSlide(selectedSlideIndex - 1);
  document.querySelector("#next").onclick = () => activateSlide(selectedSlideIndex + 1);
  document.querySelector("#slide-list").onclick = renderSlideList;
  document.querySelector("#edit-slide").onclick = () => openSlideEditor(slide);
  document.querySelector("#grid").onclick = () => {
    viewMode = "grid";
    renderGrid();
  };
  document.querySelector("#reset").onclick = () => {
    if (!confirm("Wipe workshop data?")) return;
    resetSlideTimerStarts();
    api("/api/podium/reset", { method: "POST" }).then(load);
  };
  restoreScrollState(scrollState);
  startSlideTimer();
}

function slideDropZone(index) {
  return `<div class="slide-drop-zone" data-drop-index="${index}" aria-hidden="true"></div>`;
}

function closeSlideList() {
  document.querySelector(".slide-list-panel")?.remove();
}

function renderSlideList() {
  if (!closeSlideEditor()) return;
  document.querySelector(".slide-list-panel")?.remove();
  const rows = deckSlides.map((slide, index) => {
    const isLive = index === selectedSlideIndex;
    const effective = effectiveSlide(slide);
    return `${slideDropZone(index)}<article class="slide-row ${isLive ? "selected" : ""}" draggable="true" data-slide-id="${esc(slide.id)}"><span class="drag-handle" role="presentation">::</span>${slidePlanningControls(effective, index)}<button class="slide-row-main" draggable="false" data-go-slide="${index}"><strong>${index + 1}. ${esc(effective.title || "Untitled slide")}${isLive ? '<span class="live-slide-pill">Live</span>' : ""}</strong><small>${esc(slideTemplateLabel(effective.template))} &middot; ${esc(PARTICIPANT_MODE_LABELS[effective.participantMode] || effective.participantMode || "Follow the presentation")}</small></button><button class="btn secondary" draggable="false" data-edit-row="${index}">Edit</button></article>`;
  }).join("") + slideDropZone(deckSlides.length);
  document.body.insertAdjacentHTML("beforeend", `<aside class="slide-list-panel"><header><div><span class="eyebrow">Deck</span><h2>Slide list</h2></div><button type="button" class="icon-close" id="close-slide-list" aria-label="Close">x</button></header><div class="slide-list-actions"><button class="btn primary" id="new-slide">New slide</button><span id="deck-save-status">${deckPersisted ? "Saved in Railway" : "Using bundled deck"}</span></div><p class="slide-list-help">Drag a row, or use Alt + Up/Down when it has keyboard focus.</p><div class="slide-list-columns" aria-hidden="true"><span></span><span>Owner</span><span>Time</span><span>Slide</span><span></span></div><div class="slide-rows" role="list">${rows}</div></aside>`);
  document.querySelector("#close-slide-list").onclick = closeSlideList;
  document.querySelector("#new-slide").onclick = createBlankSlide;
  document.querySelectorAll("[data-go-slide]").forEach((button) => (button.onclick = () => {
    closeSlideList();
    activateSlide(Number(button.dataset.goSlide));
  }));
  document.querySelectorAll("[data-edit-row]").forEach((button) => (button.onclick = () => openSlideEditor(effectiveSlide(deckSlides[Number(button.dataset.editRow)]))));
  document.querySelectorAll("[data-slide-assignee]").forEach((select) => (select.onchange = () => saveSlidePlanning(Number(select.dataset.slideAssignee), { assignee: select.value })));
  document.querySelectorAll("[data-slide-duration]").forEach((select) => (select.onchange = () => saveSlidePlanning(Number(select.dataset.slideDuration), { durationSeconds: Number(select.value) * 60 })));
  bindSlideRows();
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
    row.tabIndex = 0;
    row.setAttribute("role", "listitem");
    row.onkeydown = (event) => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      const index = deckSlides.findIndex((slide) => slide.id === row.dataset.slideId);
      reorderSlideToIndex(row.dataset.slideId, event.key === "ArrowUp" ? index - 1 : index + 2);
    };
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

async function saveSlidePlanning(index, patch) {
  if (!deckSlides[index]) return;
  deckSlides = deckSlides.map((slide, slideIndex) => slideIndex === index ? { ...slide, ...patch } : slide);
  const status = document.querySelector("#deck-save-status");
  if (status) status.textContent = "Saving...";
  try {
    await persistCurrentDeck();
    if (status) status.textContent = "Saved in Railway";
  } catch (error) {
    if (status) status.textContent = "Save failed - try again";
  }
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
    assignee: SLIDE_ASSIGNEES[0],
    durationSeconds: 300,
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

function slideTemplateLabel(template) {
  return SLIDE_TEMPLATE_OPTIONS.find((option) => option.value === template)?.label || "Standard slide";
}

function slideDurationMinutes(slide) {
  return normaliseSlidePlanning(slide).durationSeconds / 60;
}

function slidePlanningControls(slide, index) {
  const assignee = slide.assignee || SLIDE_ASSIGNEES[0];
  const minutes = slideDurationMinutes(slide);
  const assigneeOptions = SLIDE_ASSIGNEES.map((initials) => `<option value="${initials}" ${initials === assignee ? "selected" : ""}>${initials}</option>`).join("");
  const durationOptions = SLIDE_DURATIONS.map((value) => `<option value="${value}" ${value === minutes ? "selected" : ""}>${value}m</option>`).join("");
  return `<select class="slide-meta-select slide-assignee-select" draggable="false" data-slide-assignee="${index}" aria-label="Slide assignee">${assigneeOptions}</select><select class="slide-meta-select slide-duration-select" draggable="false" data-slide-duration="${index}" aria-label="Slide duration">${durationOptions}</select>`;
}

function openSlideEditor(slide) {
  const existing = document.querySelector(".edit-slide-panel");
  if (existing && !closeSlideEditor()) return;
  pendingSlideImage = normaliseSlideImage(slide.image);
  pendingSlideImageFile = null;
  revokeSlideImagePreview();
  slideEditorDirty = false;
  const bullets = (slide.bullets || []).join("\n");
  const placeholder = slide.template === "interaction" ? interactionPromptText(slide) : slide.interaction?.placeholder || "";
  document.body.insertAdjacentHTML("beforeend", `<aside class="edit-slide-panel"><form id="slide-edit-form"><header><div><span class="eyebrow">Slide editor</span><h2>${esc(slide.title)}</h2></div><button type="button" class="icon-close" id="close-editor" aria-label="Close">x</button></header><section class="slide-editor-preview" aria-label="Content preview"><div class="editor-slide-preview"><span id="preview-slide-label">Projected slide</span><strong id="preview-slide-title"></strong><p id="preview-slide-layout" class="preview-layout-hint"></p><p id="preview-slide-body"></p><ul id="preview-slide-bullets"></ul><div id="preview-slide-image" class="preview-slide-image"></div></div><div class="editor-phone-preview"><span>Phone</span><strong id="preview-phone-mode"></strong><p id="preview-phone-prompt"></p></div></section><label>Template<select id="edit-template">${optionHtml(SLIDE_TEMPLATE_OPTIONS, slide.template || "standard")}</select></label><div class="editor-mode-note"><span>Phone experience</span><strong id="edit-participant-mode-label"></strong><input type="hidden" id="edit-participant-mode" value="${esc(slide.participantMode || "passive")}"></div><label>Section<input id="edit-section" maxlength="80" value="${esc(slide.section || "")}"></label><label>Title<input id="edit-title" maxlength="140" value="${esc(slide.title || "")}"></label><label data-editor-field="body">Body<textarea id="edit-body" rows="6">${esc(slide.body || "")}</textarea></label><label data-editor-field="bullets">Bullets<textarea id="edit-bullets" rows="5" placeholder="One bullet per line">${esc(bullets)}</textarea></label>${slideImageEditorHtml()}<label data-editor-field="phonePrompt">Phone prompt<textarea id="edit-placeholder" rows="3">${esc(placeholder)}</textarea></label><p class="editor-fit-warning" id="editor-fit-warning" aria-live="polite"></p><div class="edit-slide-actions"><button type="button" class="btn danger" id="delete-slide">Delete slide</button><button type="button" class="btn secondary" id="reset-slide-override">Reset default</button><button type="button" class="btn secondary" id="cancel-slide-edit">Cancel</button><button type="submit" class="btn primary" id="save-slide">Save</button></div></form></aside>`);
  document.querySelector("#close-editor").onclick = closeSlideEditor;
  document.querySelector("#cancel-slide-edit").onclick = closeSlideEditor;
  document.querySelector("#reset-slide-override").onclick = () => resetSlideOverride(slide.id);
  document.querySelector("#delete-slide").onclick = () => deleteSlide(slide.id);
  document.querySelector("#edit-slide-image").onchange = handleSlideImageSelection;
  document.querySelector("#remove-slide-image").onclick = () => {
    pendingSlideImageFile = null;
    revokeSlideImagePreview();
    pendingSlideImage = null;
    updateSlideImageEditor();
    markSlideEditorDirty();
    updateSlideEditorPreview();
  };
  document.querySelector("#edit-template").onchange = (event) => {
    const defaults = templateDefaults(event.target.value);
    document.querySelector("#edit-participant-mode").value = defaults.participantMode;
    if (defaults.interaction && !document.querySelector("#edit-placeholder").value.trim()) {
      document.querySelector("#edit-placeholder").value = defaults.interaction.placeholder || "";
    }
    syncEditorFields();
    markSlideEditorDirty();
    updateSlideEditorPreview();
  };
  const form = document.querySelector("#slide-edit-form");
  form.addEventListener("input", () => {
    markSlideEditorDirty();
    updateSlideEditorPreview();
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    saveSlideOverride(slide);
  };
  syncEditorFields();
  updateSlideEditorPreview();
}

function closeSlideEditor(force = false) {
  const editor = document.querySelector(".edit-slide-panel");
  if (!editor) return true;
  if (!force && slideEditorDirty && !confirm("Discard unsaved slide changes?")) return false;
  editor.remove();
  revokeSlideImagePreview();
  pendingSlideImage = null;
  pendingSlideImageFile = null;
  slideEditorDirty = false;
  return true;
}

function markSlideEditorDirty() {
  slideEditorDirty = true;
}

function syncEditorFields() {
  const template = document.querySelector("#edit-template")?.value || "standard";
  const fields = new Set(TEMPLATE_EDITOR_FIELDS[template] || []);
  document.querySelectorAll("[data-editor-field]").forEach((field) => {
    field.hidden = !fields.has(field.dataset.editorField);
  });
  const defaults = templateDefaults(template);
  const mode = document.querySelector("#edit-participant-mode");
  const modeLabel = document.querySelector("#edit-participant-mode-label");
  if (mode) mode.value = defaults.participantMode;
  if (modeLabel) modeLabel.textContent = PARTICIPANT_MODE_LABELS[defaults.participantMode] || defaults.participantMode;
}

function updateSlideEditorPreview() {
  const template = document.querySelector("#edit-template")?.value || "standard";
  const fields = new Set(TEMPLATE_EDITOR_FIELDS[template] || []);
  const title = document.querySelector("#edit-title")?.value.trim() || "Untitled slide";
  const body = fields.has("body") ? document.querySelector("#edit-body")?.value.trim() || "" : "";
  const bullets = fields.has("bullets") ? (document.querySelector("#edit-bullets")?.value || "").split("\n").map((item) => item.trim()).filter(Boolean) : [];
  const mode = document.querySelector("#edit-participant-mode")?.value || templateDefaults(template).participantMode;
  const prompt = fields.has("phonePrompt") ? document.querySelector("#edit-placeholder")?.value.trim() || PARTICIPANT_MODE_LABELS[mode] : PARTICIPANT_MODE_LABELS[mode] || "Follow the presentation";
  const titleNode = document.querySelector("#preview-slide-title");
  const labelNode = document.querySelector("#preview-slide-label");
  const layoutNode = document.querySelector("#preview-slide-layout");
  const bodyNode = document.querySelector("#preview-slide-body");
  const bulletsNode = document.querySelector("#preview-slide-bullets");
  const imageNode = document.querySelector("#preview-slide-image");
  const modeNode = document.querySelector("#preview-phone-mode");
  const promptNode = document.querySelector("#preview-phone-prompt");
  const previewNode = document.querySelector(".editor-slide-preview");
  const previewSlide = { title, body, bullets, image: template === "standard" ? pendingSlideImage : null };
  const density = template === "standard" ? standardSlideDensity(previewSlide) : "";
  if (previewNode) {
    previewNode.className = `editor-slide-preview template-preview-${template}${density ? ` density-${density}` : ""}`;
  }
  if (titleNode) titleNode.textContent = title;
  if (labelNode) labelNode.textContent = `${slideTemplateLabel(template)}${density ? ` - ${projectorDensityLabel(density)}` : ""}`;
  if (layoutNode) layoutNode.textContent = previewTemplateHint(template);
  if (bodyNode) bodyNode.textContent = body;
  if (bulletsNode) {
    const visible = bullets.slice(0, 6).map((item) => `<li>${esc(item)}</li>`).join("");
    const remainder = bullets.length > 6 ? `<li class="preview-more">+${bullets.length - 6} more</li>` : "";
    bulletsNode.innerHTML = visible + remainder;
  }
  if (imageNode) imageNode.innerHTML = template === "standard" && pendingSlideImage ? `<img src="${esc(slideImageSource(pendingSlideImage))}" alt="">` : "";
  if (modeNode) modeNode.textContent = PARTICIPANT_MODE_LABELS[mode] || mode;
  if (promptNode) promptNode.textContent = prompt;
  const warning = document.querySelector("#editor-fit-warning");
  const longestBullet = bullets.reduce((longest, item) => Math.max(longest, item.length), 0);
  const mayOverflow = title.length > 100
    || (template === "standard" && (body.length > 480 || bullets.length > 7 || longestBullet > 125))
    || (template === "interaction" && (body.length > 360 || bullets.length > 5));
  const compactMessage = template === "standard" && density === "compact"
    ? "Using compact projector type. Consider splitting this content across two slides."
    : "";
  if (warning) warning.textContent = mayOverflow
    ? "This content is likely to overflow when projected. Shorten it or split it across slides."
    : compactMessage;
}

function previewTemplateHint(template) {
  return {
    standard: "Title, copy and optional list or image",
    interaction: "Task instructions, live participation counts and phone task",
    "bot-results": "Live class scores with paged participant results",
    "qna-review": "Open-question count and question review list",
    "suggestion-capture": "Incoming suggestions and a curated discussion list",
    "requirements-capture": "Incoming ideas and captured bot requirements",
    "workflow-capture": "Stage suggestions and the process board",
  }[template] || "Presentation content";
}

function normaliseSlideImage(image) {
  if (!image) return null;
  if (typeof image === "string") return { src: image, name: "Slide image" };
  if (typeof image.src !== "string") return null;
  if (!image.src.startsWith("/api/podium/slides/") && !image.src.startsWith("data:image/") && !image.src.startsWith("blob:")) return null;
  return { src: image.src, name: image.name || "Slide image", type: image.type || "" };
}

function slideImageSource(image) {
  const src = image?.src || "";
  if (!src.startsWith("/api/podium/slides/")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
}

function slideImageEditorHtml(message = "") {
  const preview = pendingSlideImage
    ? `<img src="${esc(slideImageSource(pendingSlideImage))}" alt="${esc(pendingSlideImage.name || "Selected slide image")}">`
    : '<span>No image selected</span>';
  return `<fieldset class="slide-image-field" id="slide-image-field" data-editor-field="image"><legend>Slide image</legend><div class="slide-image-preview" id="slide-image-preview">${preview}</div><div class="slide-image-controls"><label class="slide-image-upload" for="edit-slide-image">Choose image<input id="edit-slide-image" type="file" accept="image/jpeg,image/png,image/webp"></label><button type="button" class="btn secondary" id="remove-slide-image" ${pendingSlideImage ? "" : "disabled"}>Remove</button></div><p class="slide-image-help">JPEG, PNG or WebP up to 5 MB. The image sits beside bullets or spans the slide when there are no bullets.</p><p class="slide-image-message" id="slide-image-message" aria-live="polite">${esc(message)}</p></fieldset>`;
}

function syncSlideImageAvailability() {
  syncEditorFields();
}

function updateSlideImageEditor(message = "") {
  const preview = document.querySelector("#slide-image-preview");
  const remove = document.querySelector("#remove-slide-image");
  const status = document.querySelector("#slide-image-message");
  if (preview) {
    preview.innerHTML = pendingSlideImage
      ? `<img src="${esc(slideImageSource(pendingSlideImage))}" alt="${esc(pendingSlideImage.name || "Selected slide image")}">`
      : "<span>No image selected</span>";
  }
  if (remove) remove.disabled = !pendingSlideImage;
  if (status) status.textContent = message;
}

function validateSlideImage(file) {
  if (!SLIDE_IMAGE_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG or WebP image.");
  if (file.size > MAX_SLIDE_IMAGE_BYTES) throw new Error("Choose an image smaller than 5 MB.");
}

function revokeSlideImagePreview() {
  if (!pendingSlideImagePreviewUrl) return;
  URL.revokeObjectURL(pendingSlideImagePreviewUrl);
  pendingSlideImagePreviewUrl = "";
}

async function handleSlideImageSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    validateSlideImage(file);
    revokeSlideImagePreview();
    pendingSlideImagePreviewUrl = URL.createObjectURL(file);
    pendingSlideImageFile = file;
    pendingSlideImage = { src: pendingSlideImagePreviewUrl, name: file.name, type: file.type };
    updateSlideImageEditor(`${file.name} ready to save.`);
    markSlideEditorDirty();
    updateSlideEditorPreview();
  } catch (error) {
    event.target.value = "";
    updateSlideImageEditor(error.message);
  }
}

async function uploadSlideImage(slideId, file) {
  return api(`/api/podium/slides/${encodeURIComponent(slideId)}/image`, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "X-Filename": encodeURIComponent(file.name),
    },
    body: file,
  });
}

async function saveSlideOverride(slide) {
  const saveButton = document.querySelector("#save-slide");
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }
  try {
  const bulletLines = document.querySelector("#edit-bullets").value.split("\n").map((line) => line.trim()).filter(Boolean);
  const template = document.querySelector("#edit-template").value;
  const defaults = templateDefaults(template);
  await persistCurrentDeck();
  let savedImage = pendingSlideImage;
  if (pendingSlideImageFile) {
    updateSlideImageEditor("Uploading image...");
    savedImage = (await uploadSlideImage(slide.id, pendingSlideImageFile)).image;
  } else if (!pendingSlideImage && normaliseSlideImage(slide.image)) {
    await api(`/api/podium/slides/${encodeURIComponent(slide.id)}/image`, { method: "DELETE" });
  }
  const payload = {
    ...defaults,
    template: document.querySelector("#edit-template").value,
    participantMode: document.querySelector("#edit-participant-mode").value,
    section: document.querySelector("#edit-section").value.trim(),
    title: document.querySelector("#edit-title").value.trim(),
    body: document.querySelector("#edit-body").value.trim(),
    bullets: bulletLines,
    image: savedImage,
  };
  const placeholder = document.querySelector("#edit-placeholder");
  if (placeholder && placeholder.value.trim()) {
    payload.interaction = { ...(payload.interaction || {}), placeholder: placeholder.value.trim() };
  }
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
  slideEditorDirty = false;
  closeSlideEditor(true);
  renderPresentation();
  } catch (error) {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save";
    }
    const warning = document.querySelector("#editor-fit-warning");
    if (warning) warning.textContent = "Slide not saved. Check the connection and try again.";
  }
}

async function resetSlideOverride(slideId) {
  await api(`/api/podium/slide-overrides/${encodeURIComponent(slideId)}`, { method: "DELETE" });
  await api(`/api/podium/slides/${encodeURIComponent(slideId)}/image`, { method: "DELETE" });
  delete slideOverrides[slideId];
  const builtin = PRESENTATION_SLIDES.find((slide) => slide.id === slideId);
  if (builtin) {
    deckSlides = deckSlides.map((item) => item.id === slideId ? { ...builtin } : item);
  } else {
    deckSlides = deckSlides.map((item) => item.id === slideId ? { ...item, image: null } : item);
  }
  if (deckPersisted) await persistCurrentDeck();
  closeSlideEditor(true);
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
  closeSlideEditor(true);
  closeSlideList();
  await activateSlide(selectedSlideIndex);
}

function standardSlideDensity(slide) {
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  const bodyLength = String(slide.body || "").length;
  const titleLength = String(slide.title || "").length;
  const longestBullet = bullets.reduce((longest, item) => Math.max(longest, String(item).length), 0);
  const hasImage = Boolean(normaliseSlideImage(slide.image));
  const spaciousBulletLimit = hasImage ? 3 : 4;
  const balancedBulletLimit = hasImage ? 5 : 6;
  const spaciousBodyLimit = hasImage ? 160 : 220;
  if (bullets.length <= spaciousBulletLimit && bodyLength <= spaciousBodyLimit && titleLength <= 80 && longestBullet <= 100) {
    return "spacious";
  }
  if (bullets.length <= balancedBulletLimit && bodyLength <= 360 && titleLength <= 100 && longestBullet <= 125) {
    return "balanced";
  }
  return "compact";
}

function projectorDensityLabel(density) {
  return density.charAt(0).toUpperCase() + density.slice(1);
}

function renderStandardSlide(slide) {
  const bullets = (slide.bullets || []).map((item) => `<li>${esc(item)}</li>`).join("");
  const image = normaliseSlideImage(slide.image);
  const imageHtml = image ? `<figure class="slide-image-frame"><img src="${esc(slideImageSource(image))}" alt="${esc(image.name || "")}"></figure>` : "";
  const copy = `<div class="standard-slide-copy"><p>${esc(slide.body || "")}</p>${bullets ? `<ul>${bullets}</ul>` : ""}</div>`;
  const layoutClass = image ? ` has-image ${bullets ? "has-bullets" : "no-bullets"}` : "";
  const density = standardSlideDensity(slide);
  slideShell(slide, `<section class="presentation-card standard-slide density-${density}${layoutClass}">${copy}${imageHtml}</section>`);
}

function interactionPromptText(slide) {
  if (slide.interaction?.placeholder) return slide.interaction.placeholder;
  return slide.participantMode === "bot" ? "Open the Assistant Builder on your phone." : "Follow the prompt on your phone.";
}

function renderInteractionSlide(slide) {
  const totalRuns = summary?.total_runs || 0;
  const tested = sessions.filter((session) => Number(session.run_count) > 0).length;
  const captured = artifacts.find((item) => item.artifact_type === "captured_requirements")?.payload?.items || [];
  const capturedHtml = captured.length ? `<div class="mini-requirements"><h3>Class requirements</h3><ul>${captured.map((item) => `<li>${esc(item.text || item)}</li>`).join("")}</ul></div>` : "";
  const bullets = (slide.bullets || []).map((item) => `<li>${esc(item)}</li>`).join("");
  slideShell(slide, `<section class="presentation-card interaction-slide"><div><p>${esc(slide.body || "")}</p>${bullets ? `<ul>${bullets}</ul>` : ""}<div class="activity-metrics"><span><b>${sessions.length}</b> joined</span><span><b>${tested}</b> tested</span><span><b>${totalRuns}</b> total runs</span></div>${capturedHtml}</div><div class="activity-callout"><strong>Phone task</strong><p>${esc(interactionPromptText(slide))}</p></div></section>`);
}

function renderLiveSlide(slide) {
  const page = pagedResultSessions();
  slideShell(slide, `<section class="bot-results-view">${summaryStrip()}<div class="results-toolbar"><div class="sortbar"><button class="btn ${sortMode === "leaderboard" ? "primary" : "secondary"}" data-sort="leaderboard">Leaderboard</button><button class="btn ${sortMode === "improved" ? "primary" : "secondary"}" data-sort="improved">Most improved</button></div>${resultsPager(page)}</div><section class="grid results-grid">${page.rows.map(card).join("") || '<p class="muted results-empty">Waiting for the first completed run.</p>'}</section></section>`);
  bindSessionCards();
  document.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => {
    sortMode = b.dataset.sort;
    resultsPage = 0;
    renderPresentation();
  }));
  document.querySelectorAll("[data-results-page]").forEach((button) => (button.onclick = () => {
    resultsPage = Number(button.dataset.resultsPage);
    renderPresentation();
  }));
}

function resultPageSize() {
  if (window.innerWidth >= 1500) return 8;
  return 4;
}

function pagedResultSessions() {
  const allRows = sortedSessions();
  const pageSize = resultPageSize();
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  resultsPage = Math.max(0, Math.min(resultsPage, pageCount - 1));
  const start = resultsPage * pageSize;
  return { rows: allRows.slice(start, start + pageSize), pageCount, page: resultsPage, total: allRows.length };
}

function resultsPager(page) {
  if (page.pageCount <= 1) return `<span class="results-page-count">${page.total} participant${page.total === 1 ? "" : "s"}</span>`;
  return `<nav class="results-pager" aria-label="Results pages"><button class="btn secondary" data-results-page="${page.page - 1}" ${page.page === 0 ? "disabled" : ""} aria-label="Previous results page">Previous</button><span class="results-page-count">${page.page + 1} / ${page.pageCount}</span><button class="btn secondary" data-results-page="${page.page + 1}" ${page.page >= page.pageCount - 1 ? "disabled" : ""} aria-label="Next results page">Next</button></nav>`;
}

function questionSlideLabel(question) {
  return question.slide_title || question.slide_id || "Unknown slide";
}

function renderQnaReviewSlide(slide) {
  const visibleQuestions = questions.filter((question) => !question.is_answered);
  const archivedCount = questions.length - visibleQuestions.length;
  const list = visibleQuestions.map((question) => `<article class="question-card"><div><p>${esc(question.text)}</p><small>${esc(question.display_name || "Participant")}<span class="question-slide-pill">${esc(questionSlideLabel(question))}</span></small></div><button class="btn primary" data-archive-question="${question.id}">Tick</button></article>`).join("");
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

function capturedRequirementResponseIds(captured) {
  return new Set(captured.map((item) => item.response_id).filter(Boolean));
}

function renderRequirementsSlide(slide) {
  const captured = capturedRequirements();
  const capturedIds = capturedRequirementResponseIds(captured);
  const availableResponses = responses.filter((r) => !capturedIds.has(r.id));
  const incoming = availableResponses.map((r) => `<article class="idea-card requirements-idea-card" draggable="true" data-response="${r.id}"><p>${esc(r.payload?.text || "")}</p><button class="btn secondary" data-capture="${r.id}">Capture</button></article>`).join("");
  const capturedHtml = captured.map((item, index) => `<li><span>${esc(item.text || item)}</span><button class="req-remove" data-remove-req="${index}" aria-label="Remove requirement">Remove</button></li>`).join("");
  const incomingCount = availableResponses.length ? ` <span class="count-pill">${availableResponses.length}</span>` : "";
  const capturedCount = captured.length ? ` <span class="count-pill">${captured.length}</span>` : "";
  const prompt = slide.body ? `<p class="curation-prompt">${esc(slide.body)}</p>` : "";
  const capturedBody = captured.length
    ? `<ol id="captured-list" class="captured-list">${capturedHtml}</ol><p class="muted curation-foot">These become the phone brief for the second bot round.</p>`
    : `<p class="muted empty-hint">Nothing captured yet. Drag an idea across, or hit Capture — your picks become the phone brief for round two.</p>`;
  slideShell(slide, `<div class="curation-layout"><section class="incoming-col"><h2>Incoming ideas${incomingCount}</h2>${prompt}<div class="idea-pool requirements-idea-pool">${incoming || '<p class="muted empty-hint">No ideas yet — they appear here as students send them.</p>'}</div></section><section class="captured-requirements" data-requirements-drop="true"><h2>Captured requirements${capturedCount}</h2>${capturedBody}</section></div>`);
  document.querySelectorAll("[data-capture]").forEach((button) => (button.onclick = () => captureRequirementResponse(slide.id, button.dataset.capture)));
  document.querySelectorAll("[data-remove-req]").forEach((button) => (button.onclick = () => {
    const next = captured.filter((_, index) => index !== Number(button.dataset.removeReq));
    saveArtifact(slide.id, "captured_requirements", { items: next });
  }));
  bindDraggableIdeas();
  const dropZone = document.querySelector("[data-requirements-drop]");
  if (dropZone) {
    dropZone.ondragover = allowDrop;
    dropZone.ondragenter = () => dropZone.classList.add("drag-over");
    dropZone.ondragleave = (event) => {
      if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("drag-over");
    };
    dropZone.ondrop = (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      captureRequirementResponse(slide.id, event.dataTransfer.getData("text/plain"));
    };
  }
}

function captureRequirementResponse(slideId, responseId) {
  const captured = capturedRequirements();
  if (capturedRequirementResponseIds(captured).has(responseId)) return;
  const item = responses.find((r) => r.id === responseId);
  if (!item) return;
  const next = [...captured, { response_id: item.id, text: item.payload?.text || "" }];
  saveArtifact(slideId, "captured_requirements", { items: next });
}

function capturedSuggestions() {
  return artifacts.find((item) => item.artifact_type === "captured_suggestions")?.payload?.items || [];
}

function capturedSuggestionResponseIds(captured) {
  return new Set(captured.map((item) => item.response_id).filter(Boolean));
}

function renderSuggestionSlide(slide) {
  const captured = capturedSuggestions();
  const capturedIds = capturedSuggestionResponseIds(captured);
  const availableResponses = responses.filter((r) => !capturedIds.has(r.id));
  const incoming = availableResponses.map((r) => `<article class="idea-card requirements-idea-card" draggable="true" data-response="${r.id}"><p>${esc(r.payload?.text || "")}</p><button class="btn secondary" data-capture-suggestion="${r.id}">Capture</button></article>`).join("");
  const capturedHtml = captured.map((item, index) => `<li><span>${esc(item.text || item)}</span><button class="req-remove" data-remove-suggestion="${index}" aria-label="Remove suggestion">Remove</button></li>`).join("");
  const incomingCount = availableResponses.length ? ` <span class="count-pill">${availableResponses.length}</span>` : "";
  const capturedCount = captured.length ? ` <span class="count-pill">${captured.length}</span>` : "";
  const prompt = slide.body ? `<p class="curation-prompt">${esc(slide.body)}</p>` : "";
  const capturedBody = captured.length
    ? `<ol id="captured-suggestion-list" class="captured-list">${capturedHtml}</ol><p class="muted curation-foot">Captured here for discussion only. These do not change the Assistant Builder brief.</p>`
    : `<p class="muted empty-hint">Nothing captured yet. Drag an idea across, or hit Capture to build a discussion list.</p>`;
  slideShell(slide, `<div class="curation-layout suggestion-capture"><section class="incoming-col"><h2>Incoming suggestions${incomingCount}</h2>${prompt}<div class="idea-pool requirements-idea-pool">${incoming || '<p class="muted empty-hint">No suggestions yet — they appear here as students send them.</p>'}</div></section><section class="captured-requirements" data-suggestions-drop="true"><h2>Captured suggestions${capturedCount}</h2>${capturedBody}</section></div>`);
  document.querySelectorAll("[data-capture-suggestion]").forEach((button) => (button.onclick = () => captureSuggestionResponse(slide.id, button.dataset.captureSuggestion)));
  document.querySelectorAll("[data-remove-suggestion]").forEach((button) => (button.onclick = () => {
    const next = captured.filter((_, index) => index !== Number(button.dataset.removeSuggestion));
    saveArtifact(slide.id, "captured_suggestions", { items: next });
  }));
  bindDraggableIdeas();
  const dropZone = document.querySelector("[data-suggestions-drop]");
  if (dropZone) {
    dropZone.ondragover = allowDrop;
    dropZone.ondragenter = () => dropZone.classList.add("drag-over");
    dropZone.ondragleave = (event) => {
      if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("drag-over");
    };
    dropZone.ondrop = (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      captureSuggestionResponse(slide.id, event.dataTransfer.getData("text/plain"));
    };
  }
}

function captureSuggestionResponse(slideId, responseId) {
  const captured = capturedSuggestions();
  if (capturedSuggestionResponseIds(captured).has(responseId)) return;
  const item = responses.find((r) => r.id === responseId);
  if (!item) return;
  const next = [...captured, { response_id: item.id, text: item.payload?.text || "" }];
  saveArtifact(slideId, "captured_suggestions", { items: next });
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

function processItemResponseIds(stages) {
  return new Set(stages.flatMap((stage) => (stage.items || []).map((item) => item.response_id).filter(Boolean)));
}

function renderProcessSlide(slide) {
  const stages = processMap();
  const usedResponseIds = processItemResponseIds(stages);
  const availableProcessResponses = responses.filter((r) => !usedResponseIds.has(r.id));
  const ideas = availableProcessResponses.map((r) => `<article class="idea-card" draggable="true" data-response="${r.id}"><strong>${r.votes || 0} votes</strong><p>${esc(r.payload?.text || "")}</p>${stages.map((stage, index) => `<button class="btn secondary" data-stage="${index}" data-response="${r.id}">${esc(stage.title)}</button>`).join("")}</article>`).join("");
  const emptyIdeas = responses.length ? "All suggestions have been placed." : "Waiting for process-stage ideas...";
  const prompt = slide.body ? `<p class="curation-prompt">${esc(slide.body)}</p>` : "";
  const board = stages.map((stage, index) => `<section class="stage drop-zone" data-stage-drop="${index}"><h3>${esc(stage.title)}</h3>${(stage.items || []).map((item) => `<p>${esc(item.text || item)}</p>`).join("")}</section>`).join("");
  slideShell(slide, `<div class="curation-layout"><section><h2>Stage suggestions</h2>${prompt}<div class="idea-pool">${ideas || `<p class="muted">${emptyIdeas}</p>`}</div></section><section><h2>Process stage board</h2><div class="process-stage-board">${board}</div></section></div>`);
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
  const next = stages.map((stage, index) => {
    const items = (stage.items || []).filter((item) => item.response_id !== responseId);
    return index === stageIndex ? { ...stage, items: [...items, { response_id: item.id, text: item.payload?.text || "" }] } : { ...stage, items };
  });
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
  app.classList.remove("presentation-mode");
  stopSlideTimer();
  detail = null;
  document.querySelector(".result-detail-overlay")?.remove();
  app.innerHTML = `<div class="podium-shell"><header class="podium-header"><div class="podium-title">${brandMark()}<h1>Prompt Playground Podium</h1><p>${sessions.length} participants live</p></div><div class="podium-actions"><span class="badge">Scenario pool: ${scenarios.length}</span><button class="btn secondary" id="slides">Slides</button><button class="btn secondary" id="reset">Reset</button></div></header>${summaryStrip()}<div class="sortbar"><button class="btn ${sortMode === "leaderboard" ? "primary" : "secondary"}" data-sort="leaderboard">Leaderboard</button><button class="btn ${sortMode === "improved" ? "primary" : "secondary"}" data-sort="improved">Most improved</button></div><section class="grid">${sortedSessions().map(card).join("")}</section></div>`;
  bindSessionCards();
  document.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => {
    sortMode = b.dataset.sort;
    renderGrid();
  }));
  document.querySelector("#reset").onclick = () => {
    if (!confirm("Wipe sessions, instructions, and runs?")) return;
    resetSlideTimerStarts();
    api("/api/podium/reset", { method: "POST" }).then(load);
  };
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
  return `<article class="card ${hot}" data-id="${s.id}" role="button" tabindex="0" aria-label="Open ${esc(s.display_name)} result"><h2>${esc(s.display_name)}</h2><p><span class="badge">v${s.latest_version_number || "new"}</span> ${s.run_count} runs</p><div class="card-score ${scoreClass(s.latest_captured)}"><strong>${latest}</strong>${bestRubric ? `<span>${bestRubric}</span>` : ""}</div>${progressionStrip(s.trend, s.objectives_total)}<p class="muted">${ago(s.last_active_at)}</p></article>`;
}

function bindSessionCards() {
  document.querySelectorAll(".card[data-id]").forEach((cardElement) => {
    const open = () => openDetail(cardElement.dataset.id);
    cardElement.onclick = open;
    cardElement.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    };
  });
}

async function openDetail(id) {
  detail = { id, data: await api(`/api/podium/sessions/${id}`) };
  renderDetail();
}

function closeDetail() {
  detail = null;
  document.querySelector(".result-detail-overlay")?.remove();
}

function renderDetail(runId) {
  const d = detail.data;
  const run = runId ? d.run_history.find((r) => r.id === runId) : d.latest_run;
  const instruction = run?.instruction_text || d.latest_instruction?.text || "No instruction yet";
  const transcript = run?.transcript || [];
  const scrollState = runId ? null : captureScrollState([".result-detail-overlay .pane"]);
  document.querySelector(".result-detail-overlay")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<aside class="result-detail-overlay" role="dialog" aria-modal="true" aria-label="Participant result"><div class="podium-shell detail-shell"><header class="podium-header detail-header"><button class="btn secondary" id="close-result-detail">Back to slide</button>${progressionHeader(d.run_history)}</header><div class="detail"><section class="pane instruction-pane"><h2>Instruction <span class="badge">v${run?.version_number || d.latest_instruction?.version_number || "new"}</span></h2><div class="instruction">${esc(instruction)}</div><div class="history">${d.run_history.map((r) => `<button class="btn secondary ${run?.id === r.id ? "selected" : ""}" data-run="${r.id}">v${r.version_number} ${scoreText(r)}</button>`).join("")}</div></section><section class="pane conversation-pane"><h2>Conversation</h2><div class="chat">${chat(transcript)}</div></section><section class="pane detail-score-pane"><h2>Score and coaching</h2>${scorePanel(run?.score)}</section></div></div></aside>`);
  document.querySelector("#close-result-detail").onclick = closeDetail;
  document.querySelectorAll("[data-run]").forEach((b) => (b.onclick = () => renderDetail(b.dataset.run)));
  restoreScrollState(scrollState);
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
  return `<section class="score-panel podium-score ${scoreClass(score.captured)}"><h3>Info captured: ${score.captured} / ${score.total}</h3><ul class="objectives">${results}</ul><h3>Instruction strength</h3><div class="skills">${skills}</div><div class="tip"><strong>Tip</strong><p>${esc(score.tip || "")}</p></div></section>`;
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
  if (event.key === "Escape" && detail) {
    event.preventDefault();
    closeDetail();
    return;
  }
  if (event.key === "Escape" && document.querySelector(".edit-slide-panel")) {
    event.preventDefault();
    closeSlideEditor();
    return;
  }
  if (event.key === "Escape" && document.querySelector(".slide-list-panel")) {
    event.preventDefault();
    closeSlideList();
    return;
  }
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
      const nextPresentation = await api("/api/podium/presentation");
      if (presentationState?.active_slide_id && nextPresentation.active_slide_id !== presentationState.active_slide_id) {
        presentationState = nextPresentation;
        closeDetail();
        await load();
        return;
      }
      presentationState = nextPresentation;
      detail.data = await api(`/api/podium/sessions/${detail.id}`);
      summary = await api("/api/podium/summary");
      renderDetail();
    } else {
      await load();
    }
  } catch (e) {}
}, 5000);

load().catch((e) => (app.innerHTML = "<h1>Podium unavailable</h1><pre>" + esc(e.message) + "</pre>"));
