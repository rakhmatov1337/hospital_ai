# SP5 — Patient App API (Design)

- **Status:** approved to build
- **Date:** 2026-07-24
- **Sub-project:** SP5. Completes the patient-facing API the **Flutter app** (built by another developer) needs — the P1–P17 read/write surface beyond the safety-critical slice already built.
- **Builds on:** SP1 (task engine, content library, auth), SP2 (tiering, metrics, telemetry), SP3-A (must keep passing the QA gate).

## 1. Goal & hard constraint

Expose the ~9 patient endpoints the Flutter app calls, as a single `me` module (`aud:"patient"`, scoped to the token's `patientId`).

**Non-negotiable (or it breaks the SP3-A gate):** every patient response carries **content KEYS + categorical/numeric values only — never free text, never a model output, never a judgment.** The app resolves keys via `GET /v1/content/:key`. This keeps A1/A2/A3 green.

## 2. Endpoints (all `aud:"patient"`, patient-scoped, `/v1/me/*`)

| # | Endpoint | Purpose (P-screen) | Returns |
|---|---|---|---|
| 1 | `POST /v1/me/consent` | Record patient consent (P4) | Confirms/creates `Consent` (version + `text_snapshot` from the approved `onboarding.consent.body`), sets patient `active`, **fires `patient_enrolled`** (per spec, at consent — idempotent). |
| 2 | `GET /v1/me/profile` | Header + settings + contact (P5/P16) | `firstName`, `recoveryDay`, `programmeDay` (N of 30), `language`, `procedureType`, and clinic `name`/`phone`/`emergencyNumber`/`workingHours`/`workingDays` (for "contact clinic" + cover-hours). |
| 3 | `GET /v1/me/today` | Today's tasks + med times + check-in prompt (P6–P8) | Today's `Task`s (id, `taskType`, **`contentRef` key**, `scheduledFor`, `windowClosesAt`, `status`, `onTime`), grouped by type; a `checkinDue` flag for today per the cadence. |
| 4 | `GET /v1/me/progress` | My recovery (P9) | Adherence % (via `MetricsService`, patient-scoped, denominator included), `daysCompleted`/30, per-day completion series. |
| 5 | `GET /v1/me/checkin/questions` | Check-in form (P10) | The `CHECKIN_QUESTIONS`: `[{ ref, questionContentKey, type, options:[{code,label}] }]` (structured; submit is the existing `POST /v1/checkins`). |
| 6 | `GET /v1/me/content?category=education` | Learn (P14–P15) | Educational content **keys** unlocked for the patient's `recoveryDay` (day 1/3/5/7/14/21), with category + procedure. Article body via `GET /v1/content/:key`. |
| 7 | `POST /v1/me/survey` | Day-30 survey (P17) | Stores `SurveyResponse` (q1–q4 + `free_text` **write-only**, excluded from analytics — keeps A5 green); fires `survey_submitted`; allowed only near day 30. Idempotent. |
| 8 | `PATCH /v1/me/language` | Change language (P16) | Updates `patient.language` (any time, instant, per MVP scope); fires `language_changed`. |
| 9 | `POST /v1/me/leave` | Leave programme (P16) | Patient self-withdraw: status `withdrawn`, stops task/reminder generation, **retains all data**, flags the clinic; fires `patient_withdrawn`. |
| 10 | `POST /v1/me/app-opened` | Engagement telemetry | Fires `app_opened` (categorical) — feeds the D6 engagement metric. |

Also: confirm the existing **`POST /v1/tasks/:id/complete`** is `aud:"patient"` + scoped to the caller's patient (the Today screen completes tasks through it); if not, scope it here.

## 3. Reuse (no new domain model)

- Tasks/today ← SP1 `Task`s + `recoveryDay` (clinic tz); educational unlocks ← the plan-template education days.
- Adherence ← SP2 `MetricsService` (patient-scoped variant).
- Content resolution/interpolation ← SP1/SP2 content service.
- Telemetry ← SP2 `TelemetryService.emit` (categorical only) for `patient_enrolled`, `app_opened`, `language_changed`, `patient_withdrawn`, `survey_submitted`.
- Auth/scoping ← SP1 `PatientJwtGuard` + `RequestContext.patientId`; the tenancy extension keeps it clinic-scoped.

The data model already supports all of this — **no Prisma migration expected** (SurveyResponse, Consent, Task, Event all exist). If `SurveyResponse`/consent need a field, add a migration (`prisma migrate dev`), never reset.

## 4. Testing & DoD

- e2e per endpoint (patient-scoped; cross-patient access forbidden; consent fires `patient_enrolled` once; survey `free_text` never surfaces in analytics; leave halts tasks + retains data; language change instant).
- **The SP3-A `qa:gate` must still exit 0** — add the new `me` endpoints to Layer-1 A2's patient-response scan (assert they carry only keys/categorical values). Existing SP1/SP2/SP4/SP3-A suites stay green.
- Swagger documents all `me` endpoints (the Flutter dev's contract).
- DoD: all 10 endpoints built + tested; QA gate green; OpenAPI updated.

## 5. Notes
- This is the last backend piece; after SP5 the backend is a **complete Flutter-app backend** + the clinician dashboard.
- Deploy (CI/CD to the Uzbek server + `dashboard.hospital-ai.uz` nginx) follows SP5, on `main`.
