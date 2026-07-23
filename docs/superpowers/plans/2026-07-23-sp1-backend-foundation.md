# SP1 — Backend Foundation & Data Model — Implementation Plan

> **For agentic workers:** implement task-by-task. This plan is right-sized for **parallel workflow execution**: the foundation task (T1) is a single coherent scaffold that must compile+migrate; T2–T7 fill in disjoint module files against the pinned interfaces below; T8–T9 add seed + tests. Full field lists live in the design spec — read it, don't re-derive.

**Goal:** Stand up a compiling, migrating, seeded, multi-tenant NestJS+Prisma backend (`apps/api`) in a pnpm/Turbo monorepo, enforcing the spec's safety rules structurally, ready for SP2 behaviours.

**Architecture:** Fresh monorepo. Prisma owns the domain DB (Postgres 16 + pgvector, local, **no Docker**). Safety is structural — append-only models have no mutation methods + a Prisma-extension guard; clinic scoping is a Prisma-extension applied from request context; two JWT audiences (patient/staff) with `aud`-verifying guards. The legacy `apps/backend` stays in-tree read-only as the SP3 porting source.

**Tech Stack:** NestJS 10 + TypeScript (strict) · Prisma 5 · PostgreSQL 16 + pgvector · RS256 JWT (`jsonwebtoken`/`@nestjs/jwt`) · class-validator/class-transformer · @nestjs/swagger · Jest + Supertest · pnpm workspaces + Turborepo.

**Design spec:** `docs/superpowers/specs/2026-07-23-sp1-backend-foundation-design.md` (READ IT — full entity fields, tier rules, content pack, demo states).

## Global Constraints (every task inherits these)

- **DB:** `DATABASE_URL=postgresql://postgres:Sunocun20@localhost:5432/hospital_ai` (fresh DB; Prisma migrate creates it). Never commit `.env`.
- **API:** base path `/v1`; Swagger at `/v1/docs`; errors `{code,message,details}`; ISO-8601 UTC + separate `local_offset`; `Idempotency-Key` on `POST /v1/tasks/:id/complete` and `POST /v1/checkins`; cursor pagination, **never on the escalation queue**.
- **IDs** UUID v7 · **columns** snake_case (Prisma `@map`) · **enums** for every status/role/tier/task_type.
- **Auth:** two JWT audiences — `aud:"patient"` (24h/60d) and `aud:"staff"` (8h), RS256. Guards verify `aud` explicitly; patient token at staff endpoint → **403**. Every token carries `clinic_id`.
- **Tenancy:** clinic scoping applied at the **repository/Prisma-extension layer**, not controllers. Cross-clinic access impossible + tested.
- **Immutability:** `Escalation`, `EscalationNotification`, `Consent`, `Event`, approved `ContentTranslation` — no update/delete; Prisma extension throws on mutation; escalation status forward-only `new→acknowledged→contacted→breached`.
- **Production gate:** `PATIENT_ENROLMENT_ENABLED` (default false) → creating a patient while any required content lacks real sign-off returns `CLINICAL_CONTENT_NOT_APPROVED`. `ALLOW_PLACEHOLDER_CONTENT` (false in prod) → placeholder content fails closed. Placeholder rows: `is_placeholder=true`, `approved_by="PLACEHOLDER — NOT CLINICALLY APPROVED"`.
- **No patient-visible string literals**; patient-facing responses carry content ids/values only. **Nine Level-0 stop conditions** (design spec §2) are release blockers.
- **Time:** store UTC; `recovery_day = floor(now_local − discharge_date)` in the **clinic timezone**. Test a day boundary + a DST change.

---

## File structure (locked)

```
hospital-ai/
├─ package.json                 # workspace root, scripts (turbo), devDeps
├─ pnpm-workspace.yaml          # apps/*, packages/*
├─ turbo.json                   # build/lint/test pipeline
├─ tsconfig.base.json
├─ packages/shared-types/
│  ├─ package.json · tsconfig.json
│  └─ src/index.ts              # enums, DTO/response types, ERROR_CODES, content-key constants
├─ apps/api/
│  ├─ package.json · tsconfig.json · nest-cli.json · .env.example
│  ├─ prisma/schema.prisma      # 16 models + enums (T1)
│  ├─ prisma/migrations/…       # generated (T1)
│  ├─ src/main.ts               # /v1 prefix, swagger, validation pipe
│  ├─ src/app.module.ts         # imports ALL feature modules (written in T1, filled T2–T7)
│  ├─ src/prisma/{prisma.service.ts, prisma.module.ts, tenancy.extension.ts, immutability.extension.ts}
│  ├─ src/common/{request-context.ts, errors.ts, dto helpers}
│  ├─ src/config/{config.module.ts, env.validation.ts, production-gate.service.ts}
│  ├─ src/auth/{auth.module.ts, auth.service.ts, auth.controller.ts, guards.ts, jwt.ts, dto/}
│  ├─ src/clinics/{clinics.module.ts, clinics.service.ts, clinics.controller.ts}
│  ├─ src/patients/{patients.module.ts, patients.service.ts, patients.controller.ts, enrolment.service.ts, dto/}
│  ├─ src/plans/{plans.module.ts, plans.service.ts, recovery-day.ts, task-generation.service.ts}
│  ├─ src/tasks/{tasks.module.ts, tasks.service.ts, tasks.controller.ts}
│  ├─ src/checkins/{checkins.module.ts, …}   # schema-backed skeleton; behaviour SP2
│  ├─ src/escalations/{escalations.module.ts, escalations.repository.ts}  # append-only repo; ladder SP2
│  ├─ src/content/{content.module.ts, content.service.ts, content.controller.ts}
│  ├─ src/telemetry/{telemetry.module.ts, telemetry.service.ts}  # Event append-only writer
│  ├─ src/seed/seed.ts · src/seed/content-pack.ts · src/seed/plan-templates.ts · src/seed/demo-patients.ts · src/seed/clock.ts
│  └─ test/… (e2e negative tests)
```

---

## Tasks

### Task 1: Monorepo scaffold + Prisma schema + core infra (FOUNDATION — must compile & migrate)
**Single-writer.** Produces a booting `apps/api` with the full schema migrated and empty-but-wired feature modules.

**Files:** all root config, `packages/shared-types/*`, `apps/api` skeleton, `prisma/schema.prisma`, `src/prisma/*`, `src/common/*`, `src/main.ts`, `src/app.module.ts`, and **empty module skeletons** for auth/clinics/patients/plans/tasks/checkins/escalations/content/telemetry (correct class names, `@Module`, imported into `app.module.ts`).

**Interfaces produced (pinned — later tasks depend on these EXACT names):**
- `packages/shared-types`: enums `Language {UZ,RU,EN}`, `StaffRole {staff,clinical_lead}`, `PatientStatus`, `TaskType {medication,activity,wound_care,education,checkin}`, `TaskStatus`, `Tier {emergency,urgent,routine}`, `EscalationStatus`, `ContentStatus`; `ERROR_CODES` incl. `CLINICAL_CONTENT_NOT_APPROVED`, `CONTENT_NOT_APPROVED`, `CROSS_CLINIC_FORBIDDEN`, `WRONG_TOKEN_AUDIENCE`, `DUPLICATE_REQUEST`.
- `PrismaService extends PrismaClient` with `forClinic(clinicId: string)` → returns a client scoped by `tenancy.extension`; base client has `immutability.extension` applied globally.
- `RequestContext` (nestjs-cls or AsyncLocalStorage): `{ clinicId?: string; audience?: 'patient'|'staff'; staffId?: string; patientId?: string }`.
- `AppError(code, message?, details?)` mapping to the `{code,message,details}` HTTP body.
- `schema.prisma`: 16 models per design spec §3 with the exact field/enum names above; append-only models flagged in a comment block consumed by `immutability.extension`.

**Steps:**
- [ ] Write root `package.json`/`pnpm-workspace.yaml`/`turbo.json`/`tsconfig.base.json`; `apps/api` package.json with all deps (nest, prisma, @prisma/client, class-validator, class-transformer, @nestjs/swagger, @nestjs/jwt, nestjs-cls, jsonwebtoken, uuid v7 via `@napi-rs/uuid` or `crypto.randomUUID`→ use `uuidv7` pkg, jest, supertest, ts-jest).
- [ ] `pnpm install` at root — must succeed.
- [ ] Author `prisma/schema.prisma` (16 models + enums). `DATABASE_URL` from env. Add `previewFeatures` none required.
- [ ] `pnpm --filter api exec prisma migrate dev --name init` — must create `hospital_ai` and apply. If DB missing, Prisma creates it.
- [ ] `prisma.service.ts` (immutability extension applied), `tenancy.extension.ts`, `immutability.extension.ts`, `request-context.ts`, `errors.ts`.
- [ ] Empty feature-module skeletons + `app.module.ts` wiring + `main.ts` (`app.setGlobalPrefix('v1')`, ValidationPipe, Swagger at `/v1/docs`).
- [ ] `pnpm --filter api build` — must compile. `pnpm --filter api start` boots and `/v1/docs` serves.
- [ ] **Commit:** `feat(api): scaffold monorepo + prisma schema + core infra (compiles+migrates)`

**Acceptance:** `pnpm install`, `prisma migrate dev`, `pnpm --filter api build` all green; app boots; 16 tables exist; immutability extension unit-tested to throw on `escalation.update`.

### Task 2: Auth — two audiences + guards (depends T1)
**Files:** `src/auth/*`, `test/auth.e2e-spec.ts`. **Consumes:** PrismaService, RequestContext, ERROR_CODES. **Produces:** `StaffJwtGuard`, `PatientJwtGuard`, `@Audience()` metadata; `AuthService.staffLogin(email,pw)`, `AuthService.patientSession(code,phone)`; RS256 keypair loaded from `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (generate a dev pair into `.env.example` instructions).
- [ ] Failing test: staff token at a patient-guarded route → 403 `WRONG_TOKEN_AUDIENCE`; patient token at staff route → 403.
- [ ] Implement JWT sign/verify (aud, clinic_id, exp per constraints), bcrypt staff pw, patient code+phone lookup (single-use code, 14-day expiry check).
- [ ] Middleware/interceptor populates RequestContext (clinicId, audience, ids) from the verified token.
- [ ] Tests pass. **Commit** `feat(api): two-audience RS256 auth + aud guards`.

### Task 3: Production gate + config (depends T1)
**Files:** `src/config/*`. **Produces:** `EnvConfig` (validated), `ProductionGateService.assertEnrolmentAllowed(clinicId, language)` → throws `AppError(CLINICAL_CONTENT_NOT_APPROVED)` when `!PATIENT_ENROLMENT_ENABLED` or required content unsigned; `ProductionGateService.isPlaceholderActive()`.
- [ ] Failing test: with `PATIENT_ENROLMENT_ENABLED=false`, `assertEnrolmentAllowed` throws the code.
- [ ] Implement env validation (class-validator schema) + gate logic (queries ContentTranslation sign-off state). **Commit** `feat(api): production gate + env validation`.

### Task 4: Content module (depends T1)
**Files:** `src/content/*`. **Produces:** `ContentService.resolve(contentKey, language)` → returns only `status=approved` (+ not placeholder when `ALLOW_PLACEHOLDER_CONTENT=false`); missing/unapproved → `AppError(CONTENT_NOT_APPROVED)` (**no fallback language/text**). `ContentController` GET `/v1/content/:key` (patient+staff).
- [ ] Failing test: unapproved key → error; approved → text; placeholder with flag off → fails closed.
- [ ] Implement resolver + controller. **Commit** `feat(api): content-library resolver (fail-closed)`.

### Task 5: Recovery-day + task generation (depends T1)
**Files:** `src/plans/recovery-day.ts`, `src/plans/task-generation.service.ts`, unit tests. **Produces:** `recoveryDay(dischargeDate, now, clinicTz): number`; `TaskGenerationService.generateForPatient(patientId): Promise<number>` (creates all 30 days of Tasks from the patient's plan template; cadence per spec — checkin daily 1–14 then 15/18/21/24/27/30; wound_care 1–14; activity 1–3 gentle then 4–30 walking; education day 1/3/5/7/14/21; meds per schedule).
- [ ] Failing tests: recovery_day across a day boundary and a DST change; generation yields the expected task count/shape for `laparoscopic_appendectomy`.
- [ ] Implement (use `Intl`/`date-fns-tz` or Luxon for clinic-tz math). **Commit** `feat(api): recovery-day engine + 30-day task generation`.

### Task 6: Clinics + Patients + enrolment (depends T2,T3,T5)
**Files:** `src/clinics/*`, `src/patients/*`. **Produces:** `ClinicsService.get(clinicId)`, staff `GET /v1/clinics/me`; `EnrolmentService.enrol(dto)` → gate check → create Patient (status `enrolled`, unique 6-char code excl. O0I1, 14-day expiry) + Consent + `generateForPatient`; `POST /v1/patients` (staff), `GET /v1/patients` (staff, clinic-scoped), `GET /v1/patients/:id`.
- [ ] Failing tests: enrolment blocked by gate; cross-clinic patient read forbidden; enrolment generates tasks.
- [ ] Implement. **Commit** `feat(api): clinics + patient enrolment (gated, task-generating)`.

### Task 7: Tasks + escalation repo + telemetry writers (depends T1)
**Files:** `src/tasks/*`, `src/escalations/escalations.repository.ts`, `src/telemetry/*`. **Produces:** `TasksService.complete(taskId, idempotencyKey)` (idempotent; un-complete logged as new Event, original never mutated); `EscalationsRepository.create()/appendNotification()/advanceStatus()` (append-only, forward-only, no update of prior rows); `TelemetryService.emit(eventName, {categorical payload})` (append-only). Escalation *creation from check-ins* and the ladder timers are SP2 — here only the repository contract + immutability tests.
- [ ] Failing tests: duplicate `Idempotency-Key` on complete → single effect; `escalationsRepository.advanceStatus` rejects a backward transition; direct `prisma.escalation.update` throws.
- [ ] Implement. **Commit** `feat(api): task completion (idempotent) + append-only escalation repo + telemetry`.

### Task 8: Seed + content pack + demo (depends T4,T5,T6,T7)
**Files:** `src/seed/*`. **Produces:** `pnpm --filter api seed` → Sehat Clinic (DEMO), 3 staff, 2 plan templates, **all content keys in EN/UZ/RU (placeholder)** incl. the six exact safety strings + 7 check-in questions, 6 demo patients `DEMO-01..06` at days 6/3/12/8/29/1 with the specified states (seed escalation rows directly), + clock-offset helper.
- [ ] Author content pack (EN verbatim from spec; UZ/RU placeholder translations, all `is_placeholder=true`).
- [ ] Author templates + demo patients + escalation/notification seed rows (open-urgent, acknowledged+contacted, disengaged, near-completion, just-enrolled).
- [ ] Run seed; assert 6 patients + task counts + fail-closed + enrolment-block. **Commit** `feat(api): tri-lingual seed + demo patients + clock-offset`.

### Task 9: Negative-test suite + CI (depends T2,T4,T6,T7)
**Files:** `test/*.e2e-spec.ts`, `.github/workflows/ci.yml`. **Produces:** the five mandatory negative tests (cross-clinic, patient-token-at-staff, unapproved-content-fail-closed, escalation-edit-impossible, duplicate-idempotency) + GitHub Actions (lint, typecheck, test).
- [ ] Write the five e2e tests against a test DB; all green. Add CI. **Commit** `test(api): mandatory negative tests + CI`.

### Task 10: Integration verify (depends all)
- [ ] `pnpm install && pnpm --filter api exec prisma migrate reset -f && pnpm --filter api build && pnpm --filter api seed && pnpm --filter api test` — all green. Fix drift. **Commit** `chore(api): SP1 integration verified`.

---

## Self-review notes
- Spec coverage: architecture spine (T1) · 16 entities (T1) · immutability (T1,T7) · two-audience auth (T2) · production gate (T3) · content fail-closed (T4) · recovery-day+task-gen (T5) · enrolment (T6) · append-only escalation/telemetry (T7) · seed/demo (T8) · negative tests (T9) · DoD (T10). All design-spec §s mapped.
- Interfaces pinned in T1 so parallel tasks don't diverge (PrismaService.forClinic, RequestContext, AppError, ERROR_CODES, enum names).
- Deferred correctly to SP2: tiering engine, escalation ladder timers, task_missed job, content-resolution for the (absent) patient app beyond the resolver contract, 16 telemetry event catalogue.
