# Prompt Playground — Workshop Scenario Builder

A single FastAPI service for live workshops where participants write generic family-team intake chatbot instructions and test them against a randomly selected Anthropic-powered simulated legal client. A presenter podium shows sessions, instructions, run transcripts, scores, and reset controls.

## Stack

- Python 3.12, FastAPI, uvicorn
- asyncpg with idempotent startup schema and seeded scenarios
- Anthropic SDK using `claude-haiku-4-5-20251001`
- Static vanilla HTML/CSS/JS served from `/static`

## Environment variables

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Railway Postgres connection string, injected by the Railway Postgres service |
| `DATABASE_PUBLIC_URL` | Optional fallback Railway Postgres public connection string |
| `POSTGRES_URL` | Optional fallback Postgres connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `PODIUM_KEY` | Shared secret for `/podium?key=...` and podium API routes |
| `ACTIVE_SCENARIO_ID` | Optional scenario override; otherwise each run selects randomly from the family scenario pool |
| `MAX_ACTIVE_RUNS` | Optional global LLM run cap per service instance; defaults to `10` |
| `DB_CONNECT_ATTEMPTS` | Optional Postgres startup retry count; defaults to `3` |
| `DB_CONNECT_TIMEOUT` | Optional per-attempt Postgres startup timeout in seconds; defaults to `8` |

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://localhost/prompt_playground
export ANTHROPIC_API_KEY=...
export PODIUM_KEY=dev-secret
uvicorn app.main:app --reload
```

Participant app: <http://localhost:8000/>

Presenter app: <http://localhost:8000/podium?key=dev-secret>

## Synced presentation mode

The podium controls the live workshop flow. Each podium slide shows the participant URL so students can join once, create a profile, and keep their phone open as a companion view.

- Most slides keep phones in Q&A/passive mode.
- Baseline and improvement rounds switch phones to the bot builder.
- The requirements slide lets students submit ideas while the podium curates a captured requirements list.
- The second bot round shows that captured requirements list above the participant editor.
- The process map slide lets students submit/upvote stage ideas while the podium arranges them into a stage board.

## Railway

Set the Railway start command to:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Attach Railway Postgres to the app service. Railway should inject `DATABASE_URL`; do not hardcode a database URL in the repo.

On startup, the FastAPI service uses `DATABASE_URL` and creates/updates the required schema in Railway Postgres, including sessions, runs, scenarios, presentation state, Q&A, responses, votes, and curated presentation artifacts. If `DATABASE_URL` is unavailable or unreachable, the app can also try `DATABASE_PUBLIC_URL` and `POSTGRES_URL` when those variables are present.

Set these service variables manually:

- `ANTHROPIC_API_KEY`
- `PODIUM_KEY`
- `MAX_ACTIVE_RUNS` optional, defaults to `10`

If Railway returns `502` during startup and logs show a Postgres connection timeout, check that the app service and Postgres service are in the same Railway project/environment and that the app service has the Postgres variable reference attached. The app logs the host and database name it is trying to reach without printing credentials.
