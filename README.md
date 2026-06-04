# Hospital AI

AI-powered pre- and post-surgical recovery platform — automates patient rehabilitation, reduces readmissions, and lets clinics monitor every patient from one dashboard.

**4-tier multi-tenant platform:** **Superadmin** (creates hospitals, uploads AI training docs, tracks AI quality) → **Hospital Admin** (creates doctors, tracks the hospital) → **Doctor** (creates patients, sets care plans, handles alerts) → **Patient** (checklist, medications, diet, daily check-in, AI nurse chat).

## Stack

- **Backend:** NestJS · TypeORM · PostgreSQL + pgvector
- **Frontend:** React · Vite · TypeScript (deployed on Vercel)
- **AI:** **Mastra v1** — agents (care plan, risk, **streaming** nurse chat, clinical advisor), **tool calling** (patient profile/care-plan/meds/check-ins + RAG), **memory** (per-patient), **workflows** (onboarding, daily check-in, KB ingestion), **scorers/evals** (faithfulness-style + custom medical-safety, confidence scoring), and **Studio**. Runs on a **3-provider fallback** — OpenAI `gpt-5.4-mini` → Anthropic `claude-sonnet-4-6` → Google `gemini-2.5-flash` — with a non-AI fallback under that. Single surgery KB focus: **Appendectomy**.

## Structure

```
hospital-ai/
├─ apps/
│  ├─ backend/      # NestJS — /api/v1, Swagger /api/docs, Mastra in src/ai/mastra
│  └─ frontend/     # React + Vite + TS
└─ docs/            # BACKEND_V2_PLAN.md, openapi.json
```

## Run (backend)

Set `DATABASE_URL` (local Postgres) + `OPENAI_API_KEY` in `apps/backend/.env` (see `.env.example`). Enable pgvector once: `CREATE EXTENSION IF NOT EXISTS vector;`

```bash
cd apps/backend
npm install
npm run build         # compile (tsc emits decorator metadata)
npm run seed          # superadmin/hospital/doctor + 4 demo patients (creates all tables)
npm run ingest        # load the appendectomy KB into pgvector (RAG)
npm run start:dev     # API + Swagger: http://localhost:3000/api/docs
npm run studio        # Mastra Studio: http://localhost:4111 (agents/workflows/scorers)
npm run eval          # run the appendectomy eval suite -> ScoreLog (needs build)
```

## Demo logins

| Role | Login |
|------|-------|
| Superadmin | `super@hospital.ai` / `super123` |
| Hospital admin | `hospital@hospital.ai` / `hospital123` |
| Doctor | `demo@hospital.ai` / `demo123` |
| Patient | access code `HOSP-1235` (Bobur — appendectomy, at-risk) · `HOSP-1234` (Nodira) |

## API testing

- **Swagger UI:** http://localhost:3000/api/docs · spec at `docs/openapi.json` (39 endpoints)
- **Postman:** import `postman/HospitalAI.postman_collection.json` — run top-to-bottom for the full 4-role golden flow (superadmin → hospital → doctor → patient, AI care plan, AI risk, streaming chat, eval metrics). Tokens auto-captured.

## Golden flow (verified end-to-end)

doctor login → create patient → **AI care plan** (RAG-grounded, confidence ~0.9) → approve → patient login → daily check-in → **AI risk HIGH (conf 0.98) → auto CRITICAL alert → patient AT_RISK** → doctor sees alert → patient opens **streaming nurse chat** (personalized via tools, trilingual, KB-grounded) → superadmin reviews **AI metrics** (eval scores + confidence).

## Docs

- **[Backend v2 Plan](docs/BACKEND_V2_PLAN.md)** — full architecture, API design, AI layer, workflows, evals
