# SP2 — Safety Core (Design)

- **Status:** approved (design), ready to plan/build
- **Date:** 2026-07-23
- **Sub-project:** SP2 of 4. Builds on **SP1** (`docs/superpowers/specs/2026-07-23-sp1-backend-foundation-design.md`), which is complete + verified.
- **Sources confirmed via Notion:** Data Model, Escalation-path KB, AI-safety-line KB, Pilot-metrics KB, Dashboard D1–D3/D4–D8.

## 1. Goal

Turn the SP1 foundation into the *live safety behaviours*: deterministic check-in tiering, append-only escalations with the notification ladder, `task_missed`, the staff queue/detail API, content resolution with clinic-token interpolation, and the telemetry + metrics that judge the pilot. **No AI anywhere in SP2** — tiering is deterministic clinic rules; the app routes to humans and never judges (AI-safety-line policy).

**Non-goals (deferred):** clinician-side AI (content/template assistant, staff summaries) → SP3; the React dashboard screens → SP4.

## 2. The escalation model (from the escalation-path KB — verbatim intent)

Three tiers, evaluated server-side on every check-in against the active `EscalationRule` version:

- **EMERGENCY** — patient is told to **call 103 now**; the app does **not** wait for staff (works 24/7 with no rota). In parallel: escalation logged, and *during clinic hours* an on-duty notification is placed (a heads-up, not the patient's safety net).
- **URGENT** — patient told their answers were sent to the care team + to call 103 if worse. Escalation created; on-duty notified **within 5 min** with **no clinical detail** ("Urgent check-in for patient [ref], open the dashboard"). Targets: acknowledge ≤15 min, patient contacted ≤2 h.
- **ROUTINE** — dashboard queue, next working day. No call.

**Unacknowledged URGENT ladder:** `0 min` notify on-duty → `15 min` unacked: repeat + notify **backup** → `30 min` unacked: notify **clinic head** + mark **BREACHED**. Every step timestamped + logged (append-only `EscalationNotification`, incl. failures). Acknowledge halts the ladder.

**Out of hours** (clinic-local): EMERGENCY unchanged (self-directs to 103). URGENT/ROUTINE accepted but the confirmation content changes to `checkin.submitted.out_of_hours`; **no staff call is placed**. `within_clinic_hours` is computed at submission in the clinic timezone; EMERGENCY ignores it.

**Escalation log (the liability record + metrics source):** submitted → tier_assigned → acknowledged → patient_contacted → outcome. Append-only; corrections are new rows.

## 3. Deterministic tiering engine

Pure, no I/O. Evaluates the `EscalationRule.conditions` DSL (seeded in SP1) against a check-in's answers:

- **DSL:** leaf `{ q, op, value | values }` with `op ∈ {eq, in, gte, lte, includesAny}`; combinators `{ anyOf: [...] }` / `{ allOf: [...] }`; `{ default: true }`. Answers are the `CHECKIN_QUESTIONS` codes (SP1 `content-pack.ts`).
- **Result:** the highest matching tier (`emergency > urgent > routine`). Store the deciding `rule_version` + `tier_assigned` on the `CheckIn`.
- **Interface:** `TierEngine.assign(answers: Record<ref, string | string[] | number>, rules: EscalationRule[]): { tier: Tier; ruleVersion: string }`.
- Placeholder-v1 rules (already seeded) are the test fixtures; unit-test **every** clause (each emergency/urgent trigger → correct tier; the `q3=worse AND q2>=6` allOf; routine fallthrough).

## 4. Check-in submission flow

`POST /v1/checkins` (`aud:"patient"`, idempotent via `Idempotency-Key`):
1. Validate the answer set against `CHECKIN_QUESTIONS` (known refs, valid codes / numeric-in-range; **reject any free text** — categorical/numeric only).
2. Persist `CheckIn` + `CheckInAnswer` rows; compute `recovery_day` + `within_clinic_hours` (clinic tz).
3. `TierEngine.assign(...)` → store `tier_assigned` + `rule_version`.
4. If `urgent | emergency`: create an append-only `Escalation` (status `new`); the ladder job picks it up.
5. Emit `checkin_submitted` (+ `escalation_created` when applicable) telemetry — categorical only.
6. **Return a content *key***, not text: `emergency.headline` (emergency) · `checkin.submitted.urgent` (urgent, in-hours) · `checkin.submitted.out_of_hours` (out-of-hours) · a routine confirmation key. The client resolves + interpolates via the content API. **No model, no judgment, ever.**

## 5. Escalation ladder — scheduled job + NotificationChannel

- **Decision (approved):** a plain **deterministic scheduled job** (a NestJS interval/cron poller), not Mastra — the safety ladder must be maximally reliable, testable, and dependency-free. Mastra is reserved for SP3.
- Job runs each minute: for every `Escalation` still `new`, compute elapsed since `created_at` in clinic tz and apply the due ladder step (0/15/30 using the clinic's `notify/ack/breach` minutes), appending an `EscalationNotification` per attempt and flipping to `breached` at 30 min. Acknowledged/contacted escalations are skipped (ladder halted).
- **`NotificationChannel` interface** — `send({ escalationId, patientRef, recipientRole, attemptNumber }): Promise<{ delivered: boolean }>`. MVP adapter = **in-dashboard + logged** (a human places the actual call); the payload **carries no clinical detail**. Automated telephony is a later adapter swap, not a rewrite.
- Out-of-hours: the job creates/queues but places **no call** (dashboard only); EMERGENCY notifications are unaffected.
- **Injectable clock** so tests can advance time deterministically (reuse SP1's demo clock-offset).

## 6. `task_missed` job

A scheduled server-side job marks `Task`s `missed` (and `on_time=false`) once `window_closes_at` passes uncompleted, and emits `task_missed`. Server-side is essential — a disengaged patient emits no client events, and they are the one who matters most (drives the D4 attention flag: no activity 3+ days / adherence <50%).

## 7. Escalation queue + detail API (staff — powers D2/D3)

- `GET /v1/escalations` — the queue: ordered **tier then age**, sections emergency/urgent/routine, filter `unresolved`(default)/`all`, includes elapsed + status + `last_updated`. **Never paginates, collapses, or hides an unresolved urgent item.**
- `GET /v1/escalations/:id` — detail: patient (name, age_band, procedure, discharge, recovery_day, phone), the check-in **answers verbatim**, the deciding `rule_version`, the notification timeline, recent history (last 5 check-ins, adherence). `clinical_note` is staff-only.
- `POST /v1/escalations/:id/acknowledge` — forward-only → `acknowledged` (halts ladder); first-ack-wins on concurrency (second caller told who acknowledged). Emits `escalation_acknowledged`.
- `POST /v1/escalations/:id/contact` — → `contacted`, **`outcome_code` required** (`advised_at_home | attend_clinic | referred_emergency | no_action | unable_to_reach`); optional `clinical_note`. Emits `escalation_patient_contacted`. **No delete, no dismiss without an outcome.**

## 8. Content resolution + interpolation

SP1 has the fail-closed resolver. SP2 adds:
- **Token interpolation** from clinic config: `{CLINIC_NAME}`, `{CLINIC_PHONE}`, `{OPENING_TIME}`, and the literal emergency number, applied *after* an approved string is resolved (never stored interpolated).
- A **tier → content-key** map used by the check-in response + the (future) patient surfaces.
- The patient-initiated **"Contact clinic"** action content (`contact.button`/`contact.body`) — opens the clinic number; **does not** create an escalation (per MVP scope).

## 9. Telemetry (the 16 events) + metrics

`TelemetryService.emit` (append-only, categorical payload only — enforced) fires across the flows. Event catalogue (derived to compute the pilot metrics; reconcile against the KB entry — the metric *formulas* are confirmed):

`patient_enrolled · app_opened · language_changed · patient_withdrawn · programme_completed · task_completed · task_uncompleted · task_missed · checkin_submitted{tier,within_hours} · escalation_created{tier} · escalation_notified{attempt,recipient_role} · escalation_acknowledged · escalation_patient_contacted{outcome} · escalation_breached · contact_clinic_tapped · survey_submitted`

**`MetricsService`** computes (denominators always returned, per D6):
- **Adherence % = tasks/medication completed on time ÷ assigned where the window has closed** (exclude future) — overall, by recovery_day, by task_type.
- Retention: % still checking in at day 7 / 14 / 30.
- Check-in completion rate; engagement (avg `app_opened`/patient/week).
- Escalations: count by tier, **median time-to-acknowledge**, median time-to-contact, breach count.
- Language split (patients per language + adherence per language).
- Satisfaction (from `SurveyResponse`). Readmissions/ED: **raw count only, never a rate**.

No clinical free text in any event (`SurveyResponse.free_text` stays out of analytics).

## 10. Testing

- **Tier engine:** every placeholder-v1 clause → expected tier; routine fallthrough; the `allOf` case.
- **Escalation end-to-end (the 14-case intent):** new→ack halts ladder; unacked → 15 min backup → 30 min breach; out-of-hours no call but queued; concurrent acknowledge (first wins); contact requires outcome; **notification payload contains zero symptom text** (asserted); edit/delete impossible (SP1 guard).
- **Check-in:** free-text answer rejected; duplicate `Idempotency-Key` → single check-in + single escalation; tier→content-key correct in/out of hours.
- **`task_missed`:** fires server-side at window close; disengaged patient surfaces.
- **Metrics:** adherence matches the formula on a simulated patient, excludes future tasks, shows denominators.
- Clock is injected so time-based tests are deterministic.

## 11. Definition of done (SP2)

1. `POST /v1/checkins` assigns a tier deterministically, stores `rule_version`, creates escalations for urgent/emergency, returns a content key (never text).
2. The ladder job advances 0/15/30 correctly, appends notifications with no clinical detail, halts on acknowledge, and respects clinic hours — tested with the injected clock.
3. `task_missed` fires server-side.
4. Staff queue/detail/acknowledge/contact endpoints match D2/D3 (queue never hides an unresolved urgent; outcome required to close).
5. Content resolution interpolates clinic tokens; "Contact clinic" content present.
6. All 16 events emit (categorical only); `MetricsService` returns the pilot metrics with denominators.
7. The SP2 test suite (tier clauses, escalation end-to-end, out-of-hours, no-clinical-detail, idempotency, task_missed, metrics) is green; existing SP1 tests stay green.

## 12. Notes / carry-forward

- **SP3 reshaped by the AI-safety-line KB:** the MVP AI is deliberately *non-generative* to patients; RAG chat is explicitly a **v2** upgrade. SP3's realistic scope is clinician-side, human-gated LLM assistance (content/translation drafting for the library, recovery-plan template drafting, non-judgmental queue summaries) — to be designed with the user before building, given the tension with the "AI Award" framing.
- Escalation forward-status still uses SP1's single controlled `$executeRaw` path; keep it encapsulated in the escalation service.
