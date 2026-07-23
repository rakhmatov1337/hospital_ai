# SP2 — Safety Core — Implementation Plan

> **For agentic workers:** builds on the completed SP1 backend (`apps/api`). READ the SP2 design spec (`docs/superpowers/specs/2026-07-23-sp2-safety-core-design.md`) and the actual SP1 code for exact signatures before coding. No git commits (orchestrator commits after verify). No AI/LLM anywhere in SP2.

**Goal:** Add the live safety behaviours — deterministic tiering, check-in submission, the escalation ladder, `task_missed`, the staff queue/detail API, content interpolation, and telemetry + metrics — on top of SP1.

**Tech:** same stack as SP1 (NestJS 11 + Prisma 6 + PG16). New dep: **`@nestjs/schedule`** (for the ladder + task_missed jobs). Injected clock for deterministic time tests (reuse SP1 demo clock).

## Global constraints (inherit SP1's + these)
- **Tiering is deterministic + server-side.** No model. Tier never assigned client-side. Store `rule_version` + `tier_assigned` on the `CheckIn`.
- **Escalations append-only** (SP1 guard); status forward-only `new→acknowledged→contacted→breached` via the escalation service's single controlled path.
- **Notifications carry ZERO clinical detail** — `{ patientRef, recipientRole, attemptNumber }` only. Assert it in tests.
- **Queue never paginates/collapses/hides an unresolved urgent item.**
- **Check-in answers are categorical/numeric only** — reject free text.
- Patient endpoints return **content keys**, never text, never a judgment.
- All telemetry payloads categorical/ID only.

## Interfaces to pin (define in the spine, consumed by parallel tasks)
- `TierEngine.assign(answers, rules): { tier: Tier; ruleVersion: string }` — `src/checkins/tier-engine.ts`. `answers: Record<qref, string | string[] | number>`.
- `NotificationChannel.send({ escalationId, patientRef, recipientRole, attemptNumber }): Promise<{ delivered: boolean }>` — `src/escalations/notification-channel.ts`; MVP `InDashboardNotificationChannel` (logs + persists, no clinical detail).
- `Clock` provider (`now(): Date`, honouring the demo offset) — reuse/extend SP1's `src/seed/clock.ts` concept as an injectable `src/common/clock.ts`.
- Tier→content-key map: `emergency→emergency.headline`, `urgent(in-hours)→checkin.submitted.urgent`, `urgent/routine(out-of-hours)→checkin.submitted.out_of_hours`, `routine(in-hours)→checkin.submitted.routine` (add this key to the content pack).
- Outcome codes: `advised_at_home | attend_clinic | referred_emergency | no_action | unable_to_reach`.

---

## Tasks

### Task 1 (spine): setup + tier engine
**Files:** `apps/api/package.json` (+`@nestjs/schedule`), `src/app.module.ts` (`ScheduleModule.forRoot()`), `src/common/clock.ts`, `src/checkins/tier-engine.ts`, `src/checkins/tier-engine.spec.ts`.
- Install `@nestjs/schedule`; register `ScheduleModule.forRoot()` in AppModule; add injectable `Clock` (reads the demo offset env used by SP1's clock).
- Implement the DSL evaluator (`eq/in/gte/lte/includesAny`, `anyOf/allOf/default`) and `TierEngine.assign` returning the highest tier (emergency>urgent>routine) + the deciding `rule_version`.
- Unit-test **every** placeholder-v1 clause + routine fallthrough + the `q3=worse AND q2>=6` allOf. Verify `pnpm --filter api build` + this spec pass.

### Task 2 (spine): check-in submission
**Files:** `src/checkins/checkins.service.ts`, `checkins.controller.ts`, `dto/submit-checkin.dto.ts`, `test/checkin.e2e-spec.ts`. Depends on T1.
- `POST /v1/checkins` (`aud:"patient"`, `Idempotency-Key`): validate answers against `CHECKIN_QUESTIONS` (reject unknown refs / bad codes / free text); persist `CheckIn`+`CheckInAnswer`; compute `recovery_day` + `within_clinic_hours` (clinic tz via Clock); `TierEngine.assign`; store `tier_assigned`+`rule_version`; if urgent/emergency create an append-only `Escalation`; emit `checkin_submitted`(+`escalation_created`); return the tier→content **key** (+ interpolated body via content service).
- If `CheckIn` lacks a unique idempotency column, add a Prisma migration for it. e2e: free-text rejected; duplicate key → 1 check-in + 1 escalation; tier→key correct in/out of hours.

### Task 3 (parallel): escalation ladder job
**Files:** `src/escalations/notification-channel.ts`, `in-dashboard.channel.ts`, `src/escalations/ladder.job.ts`, `ladder.job.spec.ts`. Depends on SP1 escalations repo + T2.
- `@Interval` job: for each `new` escalation, elapsed-since-`created_at` (clinic tz) drives 0/15/30 (clinic `notify/ack/breach` minutes): append `EscalationNotification` per attempt (no clinical detail), notify on-duty→backup→clinic-head, flip to `breached` at 30 min; skip acknowledged/contacted; out-of-hours → no call (dashboard only), EMERGENCY unaffected. Emit `escalation_notified`/`escalation_breached`.
- Tests drive the injected Clock: unacked→backup@15→breach@30; acknowledge halts; out-of-hours no call; **notification payload has zero symptom text**.

### Task 4 (parallel): task_missed job
**Files:** `src/tasks/task-missed.job.ts`, `task-missed.job.spec.ts`. `@Interval` marks `Task`→`missed`,`on_time=false` when `window_closes_at` passed uncompleted; emit `task_missed`. Test with injected Clock (disengaged patient surfaces).

### Task 5 (parallel): escalation queue + detail + actions API (staff)
**Files:** `src/escalations/escalations.controller.ts`, `escalations.service.ts`, `dto/*`, `test/escalation-queue.e2e-spec.ts`. Depends on SP1 repo.
- `GET /v1/escalations` (queue: tier-then-age, sections, filter unresolved/all, elapsed+status+last_updated, **no pagination/hide of unresolved urgent**); `GET /v1/escalations/:id` (detail: patient, verbatim answers, `rule_version`, notification timeline, recent history); `POST /:id/acknowledge` (forward-only, halts ladder, first-ack-wins, emit `escalation_acknowledged`); `POST /:id/contact` (`outcome_code` required, emit `escalation_patient_contacted`). No delete/dismiss-without-outcome.

### Task 6 (parallel): content interpolation + tier map + contact-clinic
**Files:** `src/content/interpolation.ts`, extend `content.service.ts`, add `checkin.submitted.routine` + confirm `contact.button`/`contact.body` in `src/seed/content-pack.ts`, tests. Interpolate `{CLINIC_NAME}/{CLINIC_PHONE}/{OPENING_TIME}` + 103 from clinic config after resolve (never stored interpolated). "Contact clinic" content resolves but creates no escalation.

### Task 7 (parallel): telemetry wiring + metrics
**Files:** `src/telemetry/metrics.service.ts`, `metrics.controller.ts` (`GET /v1/metrics`, staff), wire `TelemetryService.emit` at each event site, `metrics.service.spec.ts`. Emit the 16 events (categorical only). `MetricsService`: adherence % (`completed_on_time ÷ assigned_where_window_closed`, exclude future; overall/by-day/by-type), retention d7/14/30, check-in completion, escalation counts + median ack/contact + breaches, language split, satisfaction; **every metric returns its denominator**; readmissions raw-count only.

### Task 8: SP2 test suite consolidation
Ensure the e2e specs above run under the existing `--runInBand` config; add the escalation-end-to-end scenarios (14-case intent) and the metrics-on-simulated-patient check. All green.

### Task 9: verify (authoritative)
`pnpm install` → schema recreate (drop schema + `prisma migrate deploy`, since `migrate reset` is blocked for AI agents — see SP1) → `pnpm --filter api build` → `pnpm --filter api seed` → `pnpm --filter api test`. Report pass/fail with the first real error on any failure; fix only trivial wiring to reach green.

## Self-review
Covers spec §3 (T1), §4 (T2), §5 (T3), §6 (T4), §7 (T5), §8 (T6), §9 (T7), §10 (T8), DoD (T9). Pins TierEngine/NotificationChannel/Clock/tier-map/outcome-codes in the spine so parallel tasks don't diverge.
