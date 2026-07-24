# SP5 — Patient App API — Implementation Plan

> **For agentic workers:** builds on SP1+SP2+SP3-A+SP4 (`apps/api`). READ the SP5 design spec (`docs/superpowers/specs/2026-07-24-sp5-patient-api-design.md`) and the real SP1/SP2 services before coding. No git commits (orchestrator commits after verify). **Every patient response carries content KEYS + categorical/numeric values only — no free text, no model output** (or the SP3-A `qa:gate` breaks).

**Goal:** a single `me` module exposing the ~10 patient-facing endpoints (`/v1/me/*`, `aud:"patient"`, patient-scoped) the Flutter app needs.

## Global constraints
- `aud:"patient"` via `PatientJwtGuard`; scope to `RequestContext.patientId`; cross-patient access impossible + tested.
- Reuse SP1/SP2 services — no new domain model, **no migration expected** (Consent/SurveyResponse/Task/Event exist; add one only if a field is genuinely missing, via `prisma migrate dev`, never reset).
- Telemetry (`patient_enrolled`, `app_opened`, `language_changed`, `patient_withdrawn`, `survey_submitted`) categorical only. Survey `free_text` write-only (never in analytics — keeps A5).
- The **`qa:gate` must still exit 0**; Swagger documents every `me` endpoint.

## Task 1 (build): the `me` module
**Files:** `src/me/me.module.ts`, `me.controller.ts`, `me.service.ts`, `dto/*` (+ reuse `CHECKIN_QUESTIONS`, `MetricsService`, content service, `TaskGenerationService`/task queries, `TelemetryService`, `Clock`). Register `MeModule` in `app.module.ts`.
Endpoints (spec §2): `POST /me/consent` (Consent + `patient_enrolled`, idempotent) · `GET /me/profile` · `GET /me/today` (tasks+meds+`checkinDue`, contentRef keys) · `GET /me/progress` (adherence + denominator) · `GET /me/checkin/questions` (structured `CHECKIN_QUESTIONS`) · `GET /me/content?category=education` (unlocked education keys for `recoveryDay`) · `POST /me/survey` (SurveyResponse; free_text write-only; `survey_submitted`; near day 30) · `PATCH /me/language` (`language_changed`) · `POST /me/leave` (withdraw, retain data, flag clinic; `patient_withdrawn`) · `POST /me/app-opened` (`app_opened`). Also confirm `POST /v1/tasks/:id/complete` is `aud:"patient"` + patient-scoped (scope it here if not).
- **Tests** (`test/me.e2e-spec.ts`): each endpoint patient-scoped; cross-patient forbidden; consent fires `patient_enrolled` once; `today` returns only content keys + categorical values (no free text); survey free_text absent from `/v1/metrics`; leave halts task generation + retains rows; language change instant. Swagger annotations on all.
- Verify: `pnpm --filter api build`.

## Task 2 (verify, authoritative, NON-destructive)
`pnpm install` → `pnpm --filter api exec prisma migrate deploy` → `pnpm --filter api build` → `pnpm --filter api test` → **`pnpm --filter api qa:gate` (must EXIT 0)**. If the gate's Layer-1 A2 patient-response scan needs the new `me` controller included, ensure the `me` responses are keys/categorical-only so it passes (do NOT weaken the scan). Report build/test/gate + first real error on any failure; fix only trivial wiring. Never drop/reset the schema.

## Self-review
Covers spec §2 (all 10 endpoints, T1), §3 reuse, §4 tests + gate-stays-green (T1+T2). One cohesive module → single build agent avoids `me.module.ts` contention; verify runs the authoritative gate.
