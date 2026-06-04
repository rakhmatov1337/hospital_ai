# Hospital AI

AI-powered pre- and post-surgical recovery platform — automates patient rehabilitation, reduces readmissions, and lets clinics monitor every patient from one dashboard.

3-sided platform: **Patient App**, **Doctor Dashboard**, **Admin Dashboard** (one Vite app, two layouts).

## Stack

- **Backend:** NestJS · TypeORM · PostgreSQL (Docker)
- **Frontend:** React · Vite · TypeScript
- **AI:** **Mastra** (agents, tool calling, memory, evals/Studio) over a **3-provider fallback** — OpenAI `gpt-5.4-mini` → Anthropic `claude-sonnet-4-6` → Google `gemini-2.5-flash`. Care-plan generation, trilingual nurse chat, confidence-scored risk. Every AI feature also has a non-AI fallback.

## Structure

```
hospital-ai/
├─ apps/
│  ├─ backend/      # NestJS — /api/v1, Swagger at /api/docs, Mastra in src/ai/mastra
│  └─ frontend/     # React + Vite + TS
└─ docs/
   └─ BACKEND_AI_PLAN.md   # backend + AI implementation plan
```

## Run

Postgres is **Neon** (cloud) — no Docker needed. Set `DATABASE_URL` + the 3 provider keys in `apps/backend/.env` (see `.env.example`).

```bash
cd apps/backend && npm i && npm run start:dev   # http://localhost:3000/api/docs
npx mastra dev                                   # Mastra Studio at http://localhost:4111
cd apps/frontend && npm i && npm run dev         # http://localhost:5173
```

## Demo credentials

Doctor: `demo@hospital.ai` / `demo123` · Patients log in with a 6-digit access code.

## Docs

- **[Backend + AI Implementation Plan](docs/BACKEND_AI_PLAN.md)**
- Architecture, schema & frozen API contract live in the Notion War Room.
