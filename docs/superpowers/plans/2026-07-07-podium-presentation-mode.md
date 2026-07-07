# Synced Podium Presentation And Participant Companion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the app into a synchronized workshop system for around 50 Year 10 students. The podium is the projected presentation and presenter control surface. Student phones are companion devices reached by QR code: profile first, then Q&A/passive companion by default, with selected interactive slices becoming active tasks.

**Core decision:** Not every slide is interactive. Interaction is reserved for moments where student input changes what happens next in the session.

**Tech stack:** Python 3.12, FastAPI, asyncpg, vanilla HTML/CSS/JS, unittest, Railway deployment.

---

## Build Decisions

These are now fixed enough to build around:

- Students scan one QR code from any slide.
- Students create one profile for the whole workshop.
- The participant app follows the active podium state through polling.
- The normal phone state is `qna` or `passive`.
- Only selected slides switch the phone into an active mode.
- Presenter controls the active slide from the podium.
- Podium keeps showing QR/short URL for late joiners.
- Existing bot run, scoring, transcript and podium session logic remains part of the workshop half.
- Reset clears sessions, runs, Q&A, votes, suggestions and interactive responses.

## Participant Modes

- `profile`: first-run name/profile creation.
- `qna`: default question submission for non-interactive slides.
- `passive`: simple "watch the screen" companion card.
- `vote`: one-tap vote or classification.
- `suggestion`: short free-text input.
- `requirements`: structured input into active requirements buckets.
- `process`: submit or upvote process-stage suggestions.
- `bot`: instruction editor, run button, queued/running state, transcript and score.
- `results`: personal transcript, score, coaching tip and edit/rerun action.
- `reflection`: short closing response.

## Slide State Contract

Each presentation item should define:

```javascript
{
  id: "requirements-gathering",
  title: "Requirements Gathering: What Matters For Intake?",
  section: "workshop",
  podiumType: "interactive",
  participantMode: "requirements",
  interaction: {
    buckets: ["useful-facts", "safety-rules", "next-step"],
    maxLength: 160
  }
}
```

Minimum fields:

- `id`
- `title`
- `section`
- `podiumType`: `slide`, `interactive`, `activity`, `live`, `wrap`
- `participantMode`
- `durationSeconds`
- `presenterNote`

## Current Slide Map

| # | Slide | Phone Mode | Build Status |
|---|---|---|---|
| 1 | Welcome: Who We Are | `qna` or `passive` | Build as passive |
| 2 | What Is Legal Technology? | `qna` or optional `vote` | Decide interaction later |
| 3 | What Does A Legal Engineer Do? | `passive` | Build as passive |
| 4 | Careers And Skills | `passive` | Build as passive |
| 5 | Legal Technology Careers Map | `passive` or optional `vote` | Decide interaction later |
| 6 | Bridge To The Challenge | `passive` | Build as passive with QR |
| 7 | Baseline Build: Do Your Best Intake Bot | `bot` | Existing app flow adapted |
| 8 | Baseline Results: What Did We Learn? | `results` | Existing app flow adapted |
| 9 | Requirements Gathering | `requirements` | Build incoming ideas and captured list |
| 10 | Build Round 2: Improve With Requirements | `bot` | Add captured requirements to brief |
| 11 | Process Mapping | `process` | Build suggestions/upvotes and podium stage board |
| 12 | What Happens During The Process? | `passive` or `reflection` | Decide interaction later |
| 13 | Debrief | `passive` | Build as podium-led |
| 14 | Careers Wrap | `qna` or `reflection` | Decide interaction later |

## Interactive Slices To Design Before Build

These need final interaction definitions:

1. **Baseline Build**
   - Purpose: students try building an intake bot before seeing a shared requirements list.
   - Mode: `bot`.
   - Uses only the general family enquiry brief.

2. **Requirements Gathering**
   - Purpose: gather what matters for matter intake and turn selected ideas into bot requirements.
   - Mode: `requirements`.
   - Students submit short ideas.
   - Podium shows incoming ideas and lets presenter drag selected ideas into a captured requirements list.

3. **Requirements-Based Bot Build**
   - Purpose: students improve their first bot using the captured requirements list.
   - Mode: `bot`.
   - Participant brief includes both the general family enquiry brief and the captured requirements list.

4. **Process Mapping**
   - Purpose: make students think about the stages of matter intake after they have experienced the bot twice.
   - Mode: `process`.
   - Students submit stage suggestions and/or upvote suggestions.
   - Podium lets presenter drag suggestions into stage places to assemble the process map.

5. **Process Inspection**
   - Purpose: help students understand what happened during the simulated process.
   - Likely podium-led, with optional reflection.

6. **Optional First-Half Interaction**
   - Purpose: keep the first half alive without turning every slide into a task.
   - Candidate slides: legal tech examples or careers map.

7. **Optional Closing Reflection**
   - Purpose: one takeaway linking skills/careers to the workshop.
   - Could be `reflection` or just Q&A/passive.

## Data Model Additions

Add lightweight tables alongside existing sessions/runs/scenarios:

```sql
presentation_state (
  id INT PRIMARY KEY DEFAULT 1,
  active_slide_id TEXT NOT NULL,
  active_mode TEXT NOT NULL,
  is_frozen BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
)

participant_responses (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  slide_id TEXT NOT NULL,
  response_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
)

participant_questions (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  text TEXT NOT NULL,
  is_answered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
)

participant_response_votes (
  response_id UUID REFERENCES participant_responses(id),
  session_id UUID REFERENCES sessions(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (response_id, session_id)
)

presentation_artifacts (
  id UUID PRIMARY KEY,
  slide_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
)
```

Notes:

- `participant_responses` stores votes, suggestions, raw requirements ideas, raw process-stage ideas and reflections.
- `participant_response_votes` stores one upvote per session per response for process-stage suggestions.
- `presentation_artifacts` stores presenter-curated outputs, especially the captured requirements list and final process-stage map.
- Bot runs stay in `runs`.
- Reset truncates sessions, instructions, runs, questions, responses, response votes and artifacts, but not scenarios.

## API Additions

Participant:

- `GET /api/presentation/state` returns active slide, participant mode, freeze status and interaction config.
- `POST /api/sessions/{id}/questions` submits a Q&A question.
- `POST /api/sessions/{id}/responses` submits vote/suggestion/requirements/reflection payloads.
- `POST /api/sessions/{id}/responses/{response_id}/vote` upvotes a process-stage suggestion.

Presenter:

- `GET /api/podium/presentation?key=...` gets active slide state and response summaries.
- `POST /api/podium/presentation/activate?key=...` sets active slide/mode.
- `POST /api/podium/presentation/freeze?key=...` freezes/unfreezes participant state.
- `GET /api/podium/questions?key=...` lists Q&A.
- `POST /api/podium/questions/{id}/answered?key=...` marks a question answered.
- `GET /api/podium/responses?key=...&slide_id=...` lists responses for a slide.
- `POST /api/podium/artifacts?key=...` saves captured requirements or process-stage map.
- `GET /api/podium/artifacts?key=...&slide_id=...` reads captured requirements or process-stage map.

## Frontend Build Plan

### Task 1: Presentation Definitions

- [ ] Create `static/presentation.js`.
- [ ] Define all 14 slides with mode metadata.
- [ ] Include QR/short URL copy in each podium slide render.
- [ ] Add tests that verify first-half slides default to `qna`/`passive`.
- [ ] Add tests that verify selected workshop slides expose interactive modes.

### Task 2: Presentation State API

- [ ] Add `presentation_state`, `participant_responses`, and `participant_questions` schema setup.
- [ ] Add `participant_response_votes` and `presentation_artifacts` schema setup.
- [ ] Seed default active slide to `welcome`.
- [ ] Add participant state endpoint.
- [ ] Add podium activate/freeze endpoints.
- [ ] Add response and question endpoints.
- [ ] Add response upvote endpoint.
- [ ] Add presenter artifact save/read endpoints.
- [ ] Add tests for state, activation, response submit, upvote submit, artifact save/read, Q&A submit and reset clearing.

### Task 3: Participant Companion Shell

- [ ] Keep profile creation as first screen.
- [ ] Poll presentation state after profile creation.
- [ ] Render `qna` and `passive` defaults.
- [ ] Render `vote`, `suggestion`, `requirements`, `process`, and `reflection` views.
- [ ] Preserve existing bot builder/results flow for `bot` and `results`.
- [ ] For the second bot round, show captured requirements in the participant brief above the editor.
- [ ] Handle slide changes while typing with a clear "the presenter has moved on" state.

### Task 4: Podium Presentation Mode

- [ ] Render first-half slides at projector scale.
- [ ] Render QR/short URL consistently.
- [ ] Add presenter controls: next, previous, jump, freeze, live grid, reset.
- [ ] Show response summaries for active interactive slides.
- [ ] Keep existing session grid/detail views available.

### Task 5: Workshop Screens

- [ ] Build requirements gathering with incoming ideas pool and drag-and-drop captured list.
- [ ] Persist captured requirements and expose them to the participant bot brief.
- [ ] Adapt baseline and requirements-based bot build/test rounds to active presentation mode.
- [ ] Build process mapping with stage suggestions, upvotes and drag-and-drop stage places.
- [ ] Add process inspection/spotlight view.
- [ ] Add improvement and progression views.

### Task 6: Verification

- [ ] Run Python tests:

```bash
python -m unittest tests.test_simulation tests.test_static_assets tests.test_evaluation tests.test_main_stream tests.test_podium_progression -v
```

- [ ] Run compile and JS checks:

```bash
python -m compileall app tests
node --check static/presentation.js
node --check static/app.js
node --check static/podium.js
git diff --check
```

- [ ] Browser-test participant profile, Q&A default, baseline bot run, requirements input, captured list, requirements-based bot run, process-stage suggestions/upvotes, podium slide activation and reset.

## Remaining Design Work

Before coding the interactive screens, define:

- Requirements gathering details: exact input prompt, max items on screen, edit/delete behaviour, and whether captured requirements are grouped or flat.
- Process mapping details: stage labels, whether students suggest stages from scratch or upvote seeded examples, and how many final stages the podium should hold.
- Whether to include one first-half vote/classification.
- Whether process inspection needs phone input or should be podium-led.
- Whether closing reflection is worth adding.

The next design session should focus only on these interactive slices.
