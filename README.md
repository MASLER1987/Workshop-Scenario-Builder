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
| `DATABASE_URL` | Postgres connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `PODIUM_KEY` | Shared secret for `/podium?key=...` and podium API routes |
| `ACTIVE_SCENARIO_ID` | Optional scenario override; otherwise each run selects randomly from the family scenario pool |
| `MAX_ACTIVE_RUNS` | Optional global LLM run cap per service instance; defaults to `10` |

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

## Railway

Set the Railway start command to:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Attach Railway Postgres, then set `ANTHROPIC_API_KEY` and `PODIUM_KEY` in service variables.
