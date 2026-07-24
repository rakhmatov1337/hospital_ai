# Hospital AI

A **30-day post-operative recovery programme**: patients follow a clinician-approved recovery plan at home, and clinic staff work a live check-in queue and handle escalations from a web dashboard. Multi-tenant (`clinic_id` everywhere), UZ / RU / EN.

## The safety line (read this first)

> **No AI-generated text ever reaches a patient's screen.** Not disabled — *architecturally absent*.

Everything follows from that rule:

- Patients only ever see **clinician-approved content from a versioned content library**. Unapproved content **fails closed** — it renders nothing and raises an error.
- Check-in **tiering is deterministic clinic rules** (`emergency · urgent · routine`), assigned **server-side**, never by a model and never client-side.
- **Escalations are append-only** — no code path may edit, delete, hide, delay or dedupe one.
- The app **routes to humans**; it never judges, reassures, or diagnoses.

The AI's job is to **select, schedule, translate and route approved content** — never to compose it.

## Structure

```
hospital-ai/
├─ apps/
│  ├─ api/            NestJS 11 + Prisma 6 + PostgreSQL 16  (/v1, Swagger at /v1/docs)
│  └─ dashboard/      React 18 + Vite + TS + Tailwind + TanStack Query (8 screens, D1–D8)
├─ packages/
│  └─ shared-types/   enums, DTO/response types, ERROR_CODES shared by api + dashboard
└─ docs/superpowers/  design specs + implementation plans (specs/ and plans/)
```

## Run locally

Requires Node 22+, pnpm, and a local PostgreSQL 16.

```bash
pnpm install

# apps/api/.env  — DATABASE_URL, JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH (RS256), etc.
pnpm --filter api exec prisma migrate deploy
pnpm --filter api build
pnpm --filter api seed        # Sehat Clinic (DEMO): 3 staff, 6 patients, 642 tasks, tri-lingual placeholder content
pnpm --filter api start       # http://localhost:3000/v1  (docs: /v1/docs)

# apps/dashboard/.env — VITE_API_BASE_URL=http://localhost:3000/v1  (must be absolute)
pnpm --filter dashboard dev   # http://localhost:5173
```

**Demo staff login:** `lead@sehat.demo` / `demo1234` (clinical lead) · `nurse@sehat.demo` / `demo1234`

> `NODE_ENV=production` together with `ALLOW_PLACEHOLDER_CONTENT=true` **throws at boot**, and the demo seed refuses to run in production — both deliberate. Demo/pilot environments run as `staging`.

## The adversarial QA gate — a release blocker

```bash
pnpm --filter api qa:gate     # exits non-zero on ANY failure; writes a run-log to qa-runs/
```

Three layers, **one failure = no release**:

- **Layer 1 — architectural:** no free-text reaches a model · no model output in patient UI · patient strings resolve only from the signed library · unapproved content fails closed · survey free-text is write-only.
- **Layer 2 — adversarial:** 15 attack classes ("Can I eat plov?", threshold probing, roleplay, prompt injection, negation traps) run in **EN / UZ / RU**.
- **Layer 3 — escalation integrity:** emergencies always surface · nothing downranked out of sight · ambiguity escalates · append-only log · out-of-hours behaviour.

## AI

One agent, **clinician-side only**: `care-plan-selector` (Mastra). Given a procedure it assembles a **draft** recovery plan by choosing *which approved content keys* land on *which recovery day and time*. It emits **keys, days and times — never prose**, and every key it returns is re-validated server-side against the approved library, so a hallucinated key rejects the whole draft.

```bash
pnpm --filter api studio      # Mastra Studio → http://localhost:4111
```

`POST /v1/plans/ai-draft` (clinical lead only) returns a draft **for a clinician to approve** — it is never persisted as a live plan, and never reaches a patient.

## Live

| | |
|---|---|
| API | https://api.hospital-ai.uz/v1/docs |
| Dashboard | https://dashboard.hospital-ai.uz |

## Docs

Design specs and implementation plans live in **`docs/superpowers/`** — `specs/` (what and why) and `plans/` (how it was built), covering the backend foundation, safety core, dashboard, AI safety/QA gate, and the patient API.
