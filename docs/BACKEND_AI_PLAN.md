# Hospital AI — Backend + AI Implementation Plan

> My lane: **NestJS backend + OpenAI AI layer**. Frontend builds in parallel on mocks.
> Source of truth: the **frozen API contract** in the Notion "📐 Architecture, Schema & API Contract" page + Swagger at `/api/docs`.
> Stack: **NestJS · TypeORM · PostgreSQL (Neon) · Mastra** (agents, tool calling, memory, evals/Studio) over a **3-provider fallback** (OpenAI `gpt-5.4-mini` → Anthropic `claude-sonnet-4-6` → Google `gemini-2.5-flash`).

## 0. Golden rules (from War Room)
- Swagger `/api/docs` is the contract. Don't change shapes without telling FE.
- **Every AI call has a non-AI fallback** (templates / rule-based). Demo must work if OpenAI is down.
- Commit to `main` every 30–45 min. No long branches.
- Priority is law: finish all **P0** in a block before P1/P2. ADM-01 only if everything else done.
- Feature freeze H22.

---

## 1. Setup (H0–1) — SETUP-01..06
| Ticket | Do |
|--------|----|
| SETUP-01 | Monorepo: root `package.json` workspaces, `apps/backend`, `apps/frontend` |
| SETUP-02 | `nest new apps/backend`, global prefix `/api/v1`, enable CORS, `ValidationPipe({ whitelist:true, transform:true })` |
| SETUP-03 | Frontend `npm create vite@latest` (FE owns) |
| SETUP-04 | `docker-compose.yml` → `postgres:15`; `.env` `DATABASE_URL` |
| SETUP-05 | TypeORM config (`synchronize: true` for hackathon — no migrations), base entity setup |
| SETUP-06 | Config: `@nestjs/config`, `JWT_SECRET` + 3 provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`); install **Mastra** (`@mastra/core @mastra/memory @mastra/evals @mastra/libsql @mastra/loggers`) + `@nestjs/jwt @nestjs/passport passport-jwt bcrypt class-validator @nestjs/swagger zod` |

Add **Swagger** at `/api/docs` immediately (FE depends on it). Seed `surgery_types` here or in POL-01.

---

## 2. Schema (TypeORM entities — 6 tables)
Enums: `role` = DOCTOR|PATIENT|ADMIN · `patient.status` = PRE_OP|RECOVERING|RECOVERED|AT_RISK · `item.type` = MEDICATION|DIET|ACTIVITY|CHECKUP|RESTRICTION · `riskLevel` = LOW|MEDIUM|HIGH · `severity` = INFO|WARNING|CRITICAL

```
users(id, fullName, phone, email, passwordHash, role, createdAt)
surgery_types(id, name, nameRu, nameUz, category, avgRecoveryDays)
patients(id, userId→users, doctorId→users, surgeryTypeId→surgery_types, surgeryDate, status, accessCode)
care_plans(id, patientId→patients, generatedByAi)
care_plan_items(id, carePlanId→care_plans, type, title, description, scheduleTime, dayOffset, isCompleted)
check_ins(id, patientId→patients, date, painLevel, temperature, symptoms, mood, notes, riskLevel)
alerts(id, patientId→patients, type, severity, message, isRead, createdAt)
```

---

## 3. Backend module build order (dependency-ordered)

Build in this exact order — each unblocks the next.

### BE-01 · `users/` — User entity + role enum  *(dep: SETUP-05)*
Entity + enum only. No endpoints yet.

### BE-02 · `auth/` — JWT register + login  *(dep: BE-01)*
- `POST /auth/register` `{ fullName, email, password }` → `{ accessToken, user }` (doctor signup)
- `POST /auth/login` `{ email, password }` → `{ accessToken, user }`, 401 on bad creds
- bcrypt hash; JWT sign `{ sub, role }`

### BE-03 · `auth/` — JwtAuthGuard + @Roles + /auth/me  *(dep: BE-02)*
- `JwtAuthGuard`, `@Roles('DOCTOR'|'PATIENT')` + `RolesGuard`, `@CurrentUser()` decorator
- `GET /auth/me` → current user from JWT

### BE-04 · `surgery-types/` — GET /surgery-types  *(dep: BE-01)*
- `GET /surgery-types` returns seeded list (id, name, nameRu, nameUz, category, avgRecoveryDays)

### BE-05 · `patients/` — CRUD + access-code login  *(dep: BE-03, BE-04)*
- `POST /patients` (DOCTOR) `{ fullName, phone, surgeryTypeId, surgeryDate }` →
  creates `user(role=PATIENT)` + `patient` + **generates 6-digit `accessCode`** + triggers care-plan gen (BE-07/AI-02) → returns `{ patient, accessCode }`
- `GET /patients` (DOCTOR) — own list + status + last check-in
- `GET /patients/:id` (DOCTOR) — full detail
- `POST /auth/patient-login` `{ accessCode }` → `{ accessToken, user, patient }` (no password = fast demo)

### BE-06 · `care-plans/` — CarePlan + CarePlanItem entities & endpoints  *(dep: BE-05)*
- `GET /patients/:id/care-plan` — items grouped by `dayOffset`
- `GET /care-plan/today` (PATIENT) — today's items (by `surgeryDate` + `dayOffset`)
- `PATCH /care-plan-items/:id/complete`

### BE-07 · `care-plans/` — Template care-plan generator (AI fallback)  *(dep: BE-06)* **P0 — build BEFORE AI-02**
- Pure function: `surgeryType + surgeryDate → CarePlanItem[]` from hardcoded templates per category (orthopedic/cosmetic/general…).
- Called on `POST /patients`. **Must never break.** AI-02 wraps/replaces this; on AI error → this runs.

### BE-08 · `check-ins/` — POST /check-ins + GET  *(dep: BE-05)*
- `POST /check-ins` (PATIENT) `{ painLevel, temperature, symptoms[], mood, notes }` → `{ checkIn, riskLevel, advice }`
- Rule-based `riskLevel` (see BE-09 logic) as **fallback**; AI-04 upgrades it.
- `GET /patients/:id/check-ins` (DOCTOR)

### BE-09 · `alerts/` — rule-based alerts + endpoints  *(dep: BE-08)*
- Rule engine on check-in: `temp ≥ 38.5 || painLevel ≥ 8 || "bleeding"/"infection" in symptoms` → create alert (severity by threshold). **Fallback for AI-04.**
- `GET /alerts` (DOCTOR) unread first · `PATCH /alerts/:id/read`

---

## 4. AI layer — Mastra (`ai/` module) — H10–16

Mastra lives in `apps/backend/src/ai/mastra/` (central instance, agents, tools, memory, scorers). The NestJS `AiService` wraps Mastra agents; controllers stay thin.

```
ai/
├─ mastra/
│  ├─ index.ts        # new Mastra({ agents, storage, vectors, scorers, logger, observability })
│  ├─ providers.ts    # the shared 3-provider fallback chain (FALLBACK_MODELS)
│  ├─ agents/         # carePlanAgent, nurseChatAgent, riskAgent
│  ├─ tools/          # createTool() actions (e.g. fetch patient context)
│  ├─ memory.ts       # AI-05 Memory config
│  └─ scorers/        # AI-06 confidence + relevancy/faithfulness
├─ ai.service.ts      # wraps agents, applies non-AI fallbacks
└─ ai.controller.ts   # POST /ai/chat
```

### AI-01 · Mastra core + 3-provider fallback + tool calling  *(dep: SETUP-06)* **P0**
```ts
// providers.ts — Mastra model fallback is built-in (array form)
export const FALLBACK_MODELS = [
  { model: 'openai/gpt-5.4-mini',         maxRetries: 2 }, // primary
  { model: 'anthropic/claude-sonnet-4-6', maxRetries: 1 }, // backup 1
  { model: 'google/gemini-2.5-flash',     maxRetries: 1 }, // backup 2
]
```
- Central `new Mastra({ ... })` instance; agents use `model: FALLBACK_MODELS`. If a provider 500s/rate-limits/times out → auto-failover to the next, no app code.
- Tool calling via `createTool` (Zod in/out). Keys from the 3 env vars.
- **Verify Mastra API with the `mastra` skill / MCP before coding** (v1 signatures move fast).

### AI-02 · Care-plan agent (structured output + confidence)  *(dep: AI-01, AI-06, BE-07)* **P0 — THE core feature**
- `carePlanAgent.generate(prompt, { structuredOutput: { schema: carePlanZod } })` where `carePlanZod` = array of `{ type, title, description, dayOffset, scheduleTime }`.
- Prompt from `surgeryType.name + category + avgRecoveryDays + surgeryDate`. Save as `CarePlanItem[]`, `care_plan.generatedByAi = true`.
- Confidence scorer (AI-06) attached. **All providers fail OR confidence < threshold → BE-07 templates** (`generatedByAi = false`).

### AI-03 · Nurse chat agent (trilingual + Memory)  *(dep: AI-01, AI-05, BE-08)* **P0**
- `POST /ai/chat` (PATIENT) `{ messages: [{role,content}] }` → `{ reply }`.
- `nurseChatAgent.generate(messages, { memory: { resource: patientId, thread: conversationId } })` → working memory + semantic recall (AI-05).
- Context injection (surgery type, **recovery day** = today − surgeryDate, recent check-ins, plan summary) via a Mastra tool or dynamic instructions. Persona "AI Recovery Nurse", auto **UZ/RU/EN**, safety line always appended.
- Wow-line: *"You're on day 3 after appendectomy — light walking is OK now."* Canned reply if all providers fail.

### AI-04 · Risk agent → confidence-scored auto-alerts  *(dep: AI-01, AI-06, BE-09)* **P1**
- In `check-ins.create()`: `riskAgent.generate(checkInSummary, { structuredOutput: { schema: riskZod } })` → `{ riskLevel, advice, alertDoctor, confidence: 0..1 }`.
- Save `checkIn.riskLevel`; return `advice` + `confidence`. If `HIGH` **and** `confidence ≥ threshold` → **CRITICAL alert** with AI reasoning. Low-confidence HIGH → alert flagged *"AI uncertain — verify"*.
- **On error → BE-09 rule-based.** Demo: fever+pain day 2 → infection risk → alert.

### AI-05 · Mastra Memory  *(dep: AI-01)* **P1**
- `Memory` with storage (LibSQL/Postgres) + vector + embedder. Working memory `scope: 'resource'` keyed by `patientId` (durable patient facts); semantic recall of past chat (`topK`). Wired into AI-03.

### AI-06 · Scorers / confidence evals  *(dep: AI-01)* **P1**
- Custom **confidence scorer** + prebuilt (`answer-relevancy`, `faithfulness`) from `@mastra/evals/scorers/prebuilt`, attached to care-plan & risk agents with `sampling`. Surface confidence in API responses + Studio. `runEvals` CI script with a pass/fail threshold.

### AI-07 · Studio + observability  *(dep: AI-01)* **P2**
- `mastra dev` → Studio at `:4111` (test agents/tools/memory, inspect traces + confidence). `Observability` AI tracing + `PinoLogger`. Demo prop: kill `OPENAI_API_KEY` live → Claude/Gemini answers.

### AI-08 · RAG — Cesarean recovery KB (pgvector)  *(dep: AI-01, BE-04)* **P1**
- **Focus surgery = Cesarean section** (most common major surgery in Uzbekistan/LMICs, ~30% of surgical volume). **Shared KB only**, not per-patient (patient data → Memory + SQL).
- **KB is already curated** in `apps/backend/src/ai/knowledge/cesarean/` (6 md files: sources, overview/timeline, wound care, pain+activity, warning-signs, emotional). Sources: **NHS** (Open Government Licence) + **MedlinePlus** (public domain) — see `00-SOURCES.md`.
- Ingest script: read md + YAML frontmatter → `MDocument.chunk` (markdown strategy) → embed `ModelRouterEmbeddingModel('openai/text-embedding-3-small')` (1536) → **pgvector** index in Neon (`CREATE EXTENSION vector`), metadata `{ surgeryType:'cesarean', section, sources }`.
- `createVectorQueryTool({ enableFilter: true })` filtered by `surgeryType` → tool on `carePlanAgent` (AI-02) + `nurseChatAgent` (AI-03). Empty retrieval → general-knowledge fallback.
- Synergy: grounding raises **faithfulness/confidence** (AI-06); the `warning-signs` doc also grounds **AI-04 risk scoring** (fever ≥38°C, heavy bleeding, one-leg swelling = DVT, etc.).

> Why not per-patient RAG: a patient's rows (plan, check-ins, alerts) fit in context — inject via SQL + Memory. Vector RAG is for the large unstructured guideline corpus only.

> Two-layer safety net: **provider fallback (in Mastra) + non-AI fallback on top (BE-07 templates, BE-09 rules).**

---

## 5. Integration + Polish (H16–24)
- **INT-03 golden flow (E2E):** patient check-in → AI risk → doctor alert. Rehearse this.
- **POL-01 seed:** 1 doctor (`demo@hospital.ai` / `demo123`) + **5 patients in varied states** (day 1 post-op, day 5 recovering, 1 AT_RISK w/ critical alert, etc.) + rich check-in history + plans. Seed `surgery_types`.
- **POL-05:** README — setup (`docker compose up` + 2 npm cmds), `.env.example`, demo creds, ASCII architecture.
- INT-04: backend returns clean errors/empty arrays so FE empty/loading/401 states work.

---

## 6. Backend hour-by-hour
| Hours | Work |
|-------|------|
| H0–1 | SETUP-01..06, Swagger up, freeze contract with FE |
| H1–4 | BE-01 → BE-02 → BE-03 (auth done, FE can wire real login) |
| H4–6 | BE-04, BE-05 (patients + access-code), BE-06 (care-plan read) |
| H6–10 | BE-07 templates, BE-08 check-ins, BE-09 rule alerts (full non-AI app works) |
| H10–16 | AI-01 (Mastra core + fallback) → AI-05 Memory → AI-08 RAG KB → AI-06 scorers → AI-02 → AI-03 → AI-04 → AI-07 Studio (each wraps its BE fallback) |
| H16–20 | INT-03 golden flow, connect real APIs, fix shape mismatches |
| H20–24 | POL-01 seed, POL-05 docs, bug bash, rehearse demo. Freeze H22. |

## 7. Cleanup note
Notion has duplicate/stale BE tickets (two BE-01/02/03/06/07/08 from a renumber). This plan follows the **Architecture page module map** (the frozen one). Worth deleting the stale duplicates in Notion to avoid confusion.
```
auth/ → BE-02,BE-03 · users/ → BE-01 · surgery-types/ → BE-04 · patients/ → BE-05
care-plans/ → BE-06,BE-07 · check-ins/ → BE-08 · alerts/ → BE-09 · ai/ → AI-01..04
```
