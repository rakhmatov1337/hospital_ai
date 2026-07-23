# SP1 — Backend Foundation & Data Model (Design)

- **Status:** approved (design), pending spec review
- **Date:** 2026-07-23
- **Owner:** Nazrulloh
- **Sub-project:** SP1 of 4 (SP1 foundation → SP2 safety core → SP3 AI layer → SP4 dashboard)
- **Source of truth:** the finalized Hospital AI spec in Notion (guest workspace; page ids in the `product-spec-notion` memory). This doc is the committed local restatement of what SP1 builds.

---

## 1. Context & goal

Hospital AI is a **30-day post-operative recovery programme**: a clinic web dashboard + backend, multi-tenant (`clinic_id` everywhere), UZ/RU/EN. The immediate target is an **award-ready MVP** (President Tech & AI Awards); the Sehat clinic pilot is deferred.

We are **rebuilding the backend to the finalized spec** (Option 1): fresh domain model in a monorepo, lifting and repurposing the existing Mastra/RAG AI layer clinician-side (SP3). **No Flutter patient app** this round — the patient-facing API is still built, but its consumers for the MVP are the seed/demo harness and tests.

**The one rule everything serves:** *no AI-generated text ever reaches a patient, and no patient sees any string that lacks a clinician sign-off record.* SP1 lays the foundation that makes this enforceable by architecture.

### SP1 goal
Stand up the monorepo, the complete Prisma data model, two-audience auth with repository-layer tenancy, the production gate, the recovery-day/task-generation engine, and the seed/demo harness — with the mandatory negative-test suite. After SP1, the database is real, safe, multi-tenant, and demoable; SP2 adds the live safety behaviours on top.

### Non-goals (deferred)
- Deterministic tiering engine, escalation ladder timers, `task_missed` job, content-resolution API, 16 telemetry events → **SP2**
- AI content/translation assistant, recovery-plan template drafter, RAG, staff summaries → **SP3**
- The 8 dashboard screens (D1–D8) → **SP4**
- Anything on the spec's out-of-scope list (free AI chat, diet engine, biometric login, push/telephony, >2 procedures, clinic self-service, etc.)

---

## 2. Architecture spine (shared by all sub-projects)

Monorepo per ADR, **no Docker** (local Postgres):

```
hospital-ai/
├─ apps/
│  ├─ api/            NestJS + TypeScript + Prisma (domain DB)
│  │                  + Mastra/pgvector lifted from apps/backend (dormant until SP3)
│  └─ dashboard/      React 18 + Vite + TS + Tailwind + TanStack Query (SP4)
├─ packages/
│  └─ shared-types/   TS types + Zod schemas shared by api ↔ dashboard
├─ apps/backend/      LEGACY — kept read-only as a porting source; deleted once AI layer is lifted
├─ docs/
├─ turbo.json · pnpm-workspace.yaml · package.json (workspaces)
```

- **Package manager / runner:** pnpm workspaces + Turborepo for the TS apps.
- **Database:** local **PostgreSQL 16 + pgvector**. `DATABASE_URL` env var; `CREATE EXTENSION IF NOT EXISTS vector;` run once. Prisma owns the domain schema and migrations. Mastra (SP3) keeps its **own** pg/pgvector connection (as it does today with `@mastra/pg`), so the AI layer coexists with Prisma without contention.
- **TypeScript strict**; files kebab-case, classes PascalCase, DB columns snake_case (Prisma `@map`).
- **One NestJS module per domain:** `auth`, `clinics`, `patients`, `plans`, `tasks`, `checkins`, `escalations`, `content`, `telemetry` (checkins/escalations/content/telemetry are scaffolded in SP1, given behaviour in SP2).

### Safety enforced by structure — the nine stop conditions

Each Agent Self-Check "Level 0" condition is made *impossible* by architecture, not avoided by discipline:

| Stop condition | Structural prevention (SP1 unless noted) |
|---|---|
| Model output reaches a patient | No model is wired to any patient endpoint; AI layer is dormant/clinician-only (SP3). Patient responses only ever carry content-library ids/values. |
| Hardcoded patient-visible string | Patient-facing strings resolve from `ContentTranslation` by `content_key`+`language`; enforced by a lint rule (SP2) + no string literals in patient responses. |
| Unapproved content renders | Content resolver returns only `status=approved`; missing ⇒ explicit error, never a fallback (resolver in SP2; schema + gate in SP1). |
| App judges a symptom | No code path composes clinical judgement; tiering is deterministic rules → routes to humans (SP2). |
| Escalation edited/deleted/hidden | `Escalation`/`EscalationNotification` have **no** update/delete repo methods + Prisma middleware blocks mutation; status forward-only. |
| Tier assigned client-side | Tier is computed server-side on submission against a stored `rule_version` (SP2); the API is the only writer of `tier_assigned`. |
| Analytics carry clinical free text | `Event.payload` is categorical-only by schema; `CheckInAnswer.answer_value` is categorical/numeric; survey `free_text` stored in a separate table excluded from analytics. |
| Hosting region hardcoded | `DATA_REGION` env var, never a literal. |
| Instruction attributed to app | Safety-critical content strings are phrased "Your clinic's instruction: …" and interpolate `{CLINIC_NAME}`/`{CLINIC_PHONE}` (content pack). |

---

## 3. Data model — 16 entities (Prisma)

Every entity carries `clinic_id` from the first migration. **UUID v7** ids, snake_case columns, enums, Prisma **migrations** (never `synchronize`). Field lists follow the spec's Data Model page.

**Tenancy / identity**
- `Clinic` — `name`, `phone`, `emergency_number`, `working_hours`, `working_days`, `timezone` (IANA), `on_duty_contact`, `backup_contact`, `head_contact`, escalation timings (`notify_minutes`, `ack_minutes`, `breach_minutes`).
- `Staff` — `clinic_id`, `name`, `email`, `password_hash`, `role` (`staff | clinical_lead`), `active`.
- `Patient` — `clinic_id`, `patient_ref` (anonymised; the **only** patient id used in telemetry), `name`, `phone`, `age_band`, `procedure_type`, `discharge_date`, `language`, `plan_id`, `status` (`enrolled | active | completed | withdrawn`), `enrolment_code`, `code_expires_at`, `consent_version`, `consented_at`.
- `Consent` — `patient_id`, `version`, `accepted_at`, `text_snapshot`. **Immutable** (new consent = new row).

**Programme**
- `RecoveryPlan` — `clinic_id`, `procedure_type`, `name`, `duration_days` (30).
- `PlanItem` (template) — `plan_id`, `recovery_day`, `task_type` (`medication | activity | wound_care | education | checkin`), `content_ref`, `scheduled_time`, `window_minutes`.
- `Task` (instance) — `patient_id`, `plan_item_id`, `task_type`, `scheduled_for`, `window_closes_at`, `recovery_day`, `status` (`pending | completed | missed`), `completed_at`, `on_time`.

**Check-in / safety**
- `CheckIn` — `patient_id`, `submitted_at`, `recovery_day`, `question_set_version`, `rule_version`, `tier_assigned` (`emergency | urgent | routine`), `within_clinic_hours`.
- `CheckInAnswer` — `checkin_id`, `question_ref`, `answer_value` (categorical or numeric — **never free text**).
- `EscalationRule` — `clinic_id`, `version`, `tier`, `conditions` (JSON), `approved_by`, `approved_at`, `active`.
- `Escalation` — `checkin_id`, `patient_id`, `tier`, `created_at`, `status` (`new | acknowledged | contacted | breached`), `outcome_code`, `clinical_note` (staff-only). **Append-only, status forward-only.**
- `EscalationNotification` — `escalation_id`, `attempt_number`, `channel`, `recipient_role`, `sent_at`, `delivered`. **Append-only (incl. failed attempts).**

**Content**
- `ContentItem` — `clinic_id` (nullable = global), `category`, `content_key`, `status`.
- `ContentTranslation` — `content_item_id`, `language`, `text`, `version`, `approved_by`, `approved_at`, `status`, `is_placeholder`. **Approved versions never edited (edit ⇒ new Draft version).**

**Analytics**
- `Event` — `clinic_id`, `patient_ref`, `event_name`, `occurred_at`, `local_offset`, `recovery_day`, `schema_version`, `payload` (categorical only). **Append-only, never backfilled.**
- `SurveyResponse` — `patient_id`, `completed_at`, `q1_helpful`, `q2_easy`, `q3_adherence_support`, `q4_recommend`, `free_text` (stored here, **excluded** from analytics).

### Immutability enforcement
`Escalation`, `EscalationNotification`, `Consent`, `Event` and approved `ContentTranslation` rows are protected two ways: (1) their repositories expose **no** `update`/`delete`; (2) a **Prisma client extension / middleware** throws on any `update`/`delete`/`upsert` targeting these models (approved-translation guard checks `status`). Status transitions on `Escalation` are validated forward-only in the service.

---

## 4. Auth & tenancy

Two separate JWT systems, **RS256**, keys from `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`:

- `aud:"patient"` — issued at enrolment. Access 24h, refresh 60 days (covers the 30-day programme with margin; a patient is never logged out mid-recovery). Login: `enrolment_code` + `phone` (no password).
- `aud:"staff"` — access 8h, no long refresh (shared clinic computers). Login: email + password (bcrypt). Password reset via email link (SP4/SP2).

Every token carries `clinic_id`. Guards **verify `aud` explicitly** — a patient token at a staff endpoint returns **403** (automated test proves it). **Clinic scoping is applied at the repository layer** via a Prisma extension that injects `where: { clinic_id }` from request context, so a forgotten filter in a future endpoint cannot leak across clinics. Cross-clinic access is an explicit negative test.

---

## 5. The production gate

Two env flags and the rule binding them:

- `ALLOW_PLACEHOLDER_CONTENT` — `true` in dev/staging/demo, **must be `false` in production**.
- `PATIENT_ENROLMENT_ENABLED` — default `false`.

Rules:
- Enrolment (creating a `Patient`) is **refused** with error `CLINICAL_CONTENT_NOT_APPROVED` while any required content item lacks a real clinician sign-off (i.e. any `is_placeholder` or non-`approved` translation in the patient's language set).
- Placeholder content is stamped `is_placeholder: true`, `approved_by: "PLACEHOLDER — NOT CLINICALLY APPROVED"`.
- With `ALLOW_PLACEHOLDER_CONTENT=false`, placeholder content **fails closed** exactly like unapproved content.
- The dashboard shows a persistent placeholder banner whenever placeholders are active (SP4).

Other required env vars: `DATABASE_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `DATA_REGION`, `API_BASE_URL`.

---

## 6. Recovery-day engine & task generation

- `recovery_day = floor(now_local − discharge_date)` computed in the **clinic timezone** (Asia/Tashkent for the demo). Discharge = day 0. Stored everything UTC; day boundaries use clinic-local dates. **Explicit tests across a day boundary and a DST change** (a recovery_day off-by-one shifts every task).
- **Task generation at enrolment:** all 30 days of `Task`s are created from the patient's `RecoveryPlan` template `PlanItem`s (not generated daily — an offline patient must still have their tasks). Cadence encoded in templates: check-in daily days 1–14, every 3rd day 15–30 (15,18,21,24,27,30); denser plan items in the days 5–10 SSI window; medication/wound-care/activity/education per the content pack's template shape.
- Idempotency keys on task completion and check-in submission (offline sync retries).
- `task_missed` fires from a **server-side** scheduled job when `window_closes_at` passes uncompleted — job built in SP2; schema (`status=missed`, `on_time`) ready in SP1.

---

## 7. Seed & demo mode

A seed script produces a fully demoable database:

- **1 clinic** — Sehat Clinic (DEMO), Asia/Tashkent, 09:00–18:00 Mon–Sat, emergency 103, escalation timings 5 min notify / 15 min ack / 30 min breach.
- **3 staff** — on-duty nurse, clinical lead, clinic head.
- **2 recovery-plan templates** — `laparoscopic_appendectomy`, `open_hernia_repair` — each generating a correct 30-day task set (medication schedule: Paracetamol 500mg 3×/day 08:00/14:00/20:00 days 1–10; Antibiotic 1×/day 09:00 days 1–7; daily wound care days 1–14; gentle movement days 1–3 then progressive walking days 4–30; education unlocks days 1/3/5/7/14/21).
- **All content keys in EN/UZ/RU**, all flagged placeholder — onboarding, core app strings, the six exact safety-critical strings, the seven check-in questions, and clinical topics (`clinical.{procedure}.{topic}`).
- **6 demo patients** (`DEMO-01..06`) at recovery days **6 / 3 / 12 / 8 / 29 / 1** covering: good adherence (~85%, routine), open URGENT unacknowledged ~20 min (ladder + breach approaching), acknowledged+contacted with outcome, disengaged 4 days (attention flag), near-completion (survey due), just-enrolled. (Escalation rows seeded directly against the SP1 schema; the live tiering engine that *creates* them is SP2.)
- **Demo clock-offset** control to advance a patient's `recovery_day` — staging/demo only, never production.

"Seeding done when": content keys present in all three languages (placeholder); both templates generate 30 days of tasks correctly; six patients at the specified states; `ALLOW_PLACEHOLDER_CONTENT=false` makes patient content fail closed (verified); `PATIENT_ENROLMENT_ENABLED=false` blocks patient creation with `CLINICAL_CONTENT_NOT_APPROVED`; dashboard shows the placeholder banner (SP4 hook).

---

## 8. API conventions

- Base path `/v1`. REST, JSON, plural nouns (`/v1/patients`, `/v1/checkins`). OpenAPI via `@nestjs/swagger` at `/v1/docs`.
- Errors: `{ "code": "MACHINE_READABLE", "message": "...", "details": {} }`. A patient client never renders `message` — it maps `code` to a content string.
- `Idempotency-Key` header required on `POST /v1/tasks/:id/complete` and `POST /v1/checkins`.
- Timestamps ISO-8601 **UTC** with a separate `local_offset` field; never a bare local time.
- Cursor-based pagination — **never** applied to the escalation queue (nothing may hide an unresolved urgent item).
- DTOs validated with class-validator/class-transformer; shared request/response types + Zod in `packages/shared-types`.

---

## 9. Testing (mandatory negative tests, ship with SP1)

- Cross-clinic read: authenticate as clinic A, attempt clinic B's data → fails.
- Patient token presented at a staff endpoint → 403.
- Unapproved / placeholder content with `ALLOW_PLACEHOLDER_CONTENT=false` → fails closed (renders/returns nothing, explicit error).
- Escalation edit/delete attempt → impossible (no method; middleware throws).
- Duplicate check-in / task-complete with the same `Idempotency-Key` → single effect.
- Unit tests on services; integration tests on auth + tenancy scoping. CI (GitHub Actions) blocks on lint, type-check, tests.

---

## 10. Definition of done (SP1)

1. Monorepo builds (`pnpm`, Turborepo); `apps/api` boots; Swagger at `/v1/docs`.
2. Prisma migration creates all 16 tables with `clinic_id`, enums, UUID v7.
3. Immutability middleware blocks mutation of the append-only models (tested).
4. Two-audience auth works; staff login + patient code/phone session; `aud` cross-use → 403 (tested); repository-layer clinic scoping (tested).
5. Production gate: enrolment blocked when content unsigned; fail-closed verified.
6. Recovery-day computed in clinic tz with day-boundary + DST tests; enrolment generates a full 30-day task set from a template.
7. Seed produces the clinic, 3 staff, 2 templates, tri-lingual placeholder content, and the 6 demo patients at the specified states; clock-offset works.
8. All negative tests green in CI.

---

## 11. Assumptions & notes

- `apps/backend` (legacy, NestJS+TypeORM) stays in-tree read-only as the porting source for the Mastra/RAG layer; removed once lifted in SP3.
- Clinic + plan-template setup is a **support/seed** function — no admin UI (clinic self-service is out of scope). The dashboard is staff-facing only.
- The spec's role model is clinic-centric (`patient`, `staff`, `clinical_lead`, plus out-of-band "support"); the legacy 4-tier SaaS hierarchy (superadmin/hospital-admin/doctor/patient) is **not** carried over.
- ADR deviations logged here: **no Docker** (local Postgres, per user) — otherwise the stack matches the ADR (Prisma, monorepo, RS256 two-audience auth, `/v1`).
