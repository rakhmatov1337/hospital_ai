# SP4 — Clinician Dashboard (Design)

- **Status:** approved to build
- **Date:** 2026-07-23
- **Sub-project:** SP4 of 4. Consumes the SP1+SP2 backend (complete, green). Adds the missing backend endpoints + the full React dashboard.
- **Self-contained:** the Design System tokens and D1–D8 requirements are embedded here verbatim (build agents can't reach Notion).

## 1. Goal & stack

The **clinician web dashboard** (`apps/dashboard`): staff log in, work the check-in queue, handle escalations, manage patients, watch live metrics, configure the clinic, and approve content. Desktop-first, must work on a tablet.

**Stack (ADR — do not deviate):** React 18 + TypeScript (strict) · **Vite** · **TanStack Query** · **Tailwind CSS** · **react-router** · **zod** (validation) · dashboard i18n **EN + RU** (staff-facing, standard i18n files — NOT the patient content library) · Playwright for e2e. Auth = `aud:"staff"` JWT (8h), attached to every request; clinic scoping enforced server-side.

**Golden rules that still apply here:** the dashboard is staff-facing (lower-risk copy, standard i18n is fine) — but it must never let a staff action **edit/delete/hide** an escalation, and D8 is the surface that makes the content-approval safety line real. The queue must never paginate/collapse/hide an unresolved urgent item.

## 2. Design System (EXACT — do not invent values)

**Colours:** `primary #0F5F6B` · `primary-dark #0A464F` · `primary-light #EDF4F5` · `text #1A2430` · `text-muted #5B6673` · `border #C9DBDE` · `surface #FFFFFF` · `background #F7FAFB`.
**Tier colours (fixed, reserved — NEVER reuse for anything else):** `emergency #B3261E` (tier-1 only) · `urgent #B36B00` · `routine #7A6A00` · `success #1B7F5A` (completed) · `neutral-overdue #5B6673` (overdue = grey, **never red**).
**Type:** Inter (bundle it). Display 28/700 · H1 22/700 · H2 18/600 · Body-L 18/400 · Body 16/400 · Caption 14/400 · Button 18/600. Line-height 1.5.
**Spacing:** 4pt grid — only {4,8,12,16,24,32,48,64}. Dashboard screen padding 24. Card padding 16, radius 12, gap 12. Section gap 24. Input height 56, radius 8.
**Dashboard components:**
- **Queue section header** — coloured bar in the tier colour, white text, count badge; always ordered Emergency → Urgent → Routine.
- **Queue row** — height 64: patient name (H2) · recovery day · submitted time · **live elapsed counter** · status chip. Unacknowledged past 15 min → urgent left border 4px; past 30 min → emergency left border + **BREACHED** chip. `[TEST]` rows → dashed border, 60% opacity.
- **Status chips** — New (primary-light bg) · Acknowledged (success) · Contacted (success filled) · Breached (emergency).
- **Metric card** — large number (Display), label (Caption), **denominator always shown beneath** in text-muted (e.g. `80% / 4 of 5 patients`).
**Accessibility (non-negotiable):** WCAG AA contrast; **never colour alone** — tiers carry an icon + text label as well as colour; semantic labels for screen readers; works at 200% font scale; no animation required to understand state.
**Responsive:** desktop-first (1280+), must work at 768 (tablet). The queue is the priority at every width — if something must collapse, it is never an unresolved urgent item.

## 3. Backend gaps to add (in `apps/api`, all `aud:"staff"`, clinic-scoped, tested)

- **Content management (D8):** `GET /v1/content` (list items: id, category, content_key, status, languages present, last approved_by/at) · `GET /v1/content/items/:id` (3 translations side-by-side + version history) · `POST /v1/content/translations/:id/approve` (per item **per language**; records approver + version + timestamp) · `POST /v1/content/translations/:id/request-changes`. Editing an approved translation creates a **new Draft version** and reverts status (SP1 immutability preserves approved rows). A `GET /v1/content/unapproved-count` for the launch-blocker badge.
- **Clinic settings (D7):** `PATCH /v1/clinics/me` (name, phone, hours/days, on-duty/backup/head, emergency number, escalation timings) — **name/phone/emergency changes are audit-logged with actor + timestamp**; add an `AuditLog` (append-only) or reuse `Event`. Staff accounts: `GET /v1/staff`, `POST /v1/staff`, `PATCH /v1/staff/:id`.
- **Patient actions + detail (D4/D5):** enrich `GET /v1/patients` (adherence %, last_active, open_escalations count, attention_flag = adherence<50% or no activity 3+ days) · enrich `GET /v1/patients/:id` (adherence-over-time series, task-completion history, check-ins with tier+outcome, escalation history, consent record) · `POST /v1/patients/:id/reissue-code` (invalidates old, single-use, 14-day) · `PATCH /v1/patients/:id/withdraw` (stops tasks/reminders, retains data, flags clinic).

## 4. Screens (D1–D8)

**D1 · Staff login** — clinic branding, email + password, sign in, forgot password. **No self-registration.** 8h session; on 401 → login. Clinic-scoped (all data from the token's clinic).

**D2 · Check-in queue — THE MAIN SCREEN (default landing).** Three sections Emergency · Urgent · Routine (always that order). Row: patient name, recovery day, time submitted, **elapsed-since-submission (live)**, tier, status. Unacked urgent >15 min flagged; >30 min **BREACHED**. Live count badges per section. **Audible + visual alert on a new urgent/emergency arrival.** Filter All / **Unresolved (default)**. **Connection status indicator + explicit last-updated time.** **Auto-refresh every 30 s** (TanStack Query `refetchInterval`). Empty → clear "nothing needs attention" state with last-updated. `[TEST]` items visibly labelled. Ordering tier-then-age; **nothing may reorder/collapse/paginate/hide an unresolved urgent item.** Readable from ~2 m. Click row → D3.

**D3 · Escalation detail.** Patient: name, age_band, procedure, discharge, recovery day, phone (**click to call**). The check-in **answers in full — every question + the patient's exact answer**. Which rule triggered the tier + `rule_version`. Timeline: submitted → notified (each attempt) → acknowledged → contacted. Recent history: last 5 check-ins + adherence. Two actions: **Acknowledge** (→ timestamp, **halts the ladder**) and **Mark patient contacted** (→ timestamp + **outcome selector**: advised at home · asked to attend clinic · referred to emergency · no action needed · unable to reach). Staff-only free-text **clinical note** (never shown to patient). Nothing editable after the fact (corrections append). Concurrent acknowledge → first wins, second told who acknowledged. **No delete; no dismiss without an outcome.**

**D4 · Patient list.** Table: name · procedure · discharge · recovery day · **adherence %** · last active · open escalations · status. **Attention flags** (adherence <50%, or no activity 3+ days) computed server-side + visible. Filter Active / Completed / Withdrawn; sort any column. Add patient → D5 create mode. Click row → D5. Clinic-scoped.

**D5 · Patient detail & enrolment.** *View:* header (name, age, phone, procedure, discharge, recovery day, language); adherence-over-time chart; task-completion history by day; all check-ins with tier + outcome; escalation history; consent record (version + timestamp, **immutable**). Actions: **Withdraw** (confirm) · **Reissue enrolment code**. *Create:* name, phone (+998), age band, procedure type, discharge date, language; recovery-plan **template selector (filtered by procedure)**; on save → generate a **6-char code (no O/0, I/1)** displayed **large + printable**. (`patient_enrolled` fires at the patient's consent, not here.) Reissue invalidates the old code; phone unique per active patient per clinic.

**D6 · Metrics (live).** Headline **recovery-plan adherence %** + trend by recovery day. Retention curve (% active at day 7/14/30). Escalations: counts by tier, **median time-to-acknowledge**, median time-to-contact, breach count. Engagement: check-in completion rate, avg app opens/week. Language split (patients per language + adherence per language). Satisfaction (from day-30 survey). Date-range selector + CSV export (anonymised). **Every percentage shows its denominator** (`80% / 4 of 5`). **No readmission rate / no outcome claim anywhere.** Empty state before data. Charts use the design-system colours, are accessible (never colour alone), and show denominators.

**D7 · Clinic settings.** Clinic name + phone (**injected into patient-facing strings — confirm on change**), working hours/days, on-duty/backup/head contacts, local emergency number, escalation timings (5/15/30, adjustable), staff accounts list. **Name/phone/emergency changes require explicit confirmation + are audit-logged (actor + timestamp).** Hours changes take effect immediately for tier routing.

**D8 · Content approval (clinical lead).** List of all content items: id, category, status (Draft / Approved / Needs review), languages present, last approved by + when. Detail: text in **all three languages side by side** + version history. Actions: **Approve · Request changes · Add note** — **per item per language** (approving EN does not approve UZ). Filter: needs approval / missing translation / approved. **Prominent count of unapproved items** (the launch blocker). Editing approved text → reverts to Draft + removes from patient view. Approvals are **permanent, immutable** records.

## 5. Cross-cutting

- **API client:** a typed fetch layer (TanStack Query) using `packages/shared-types`; attaches the staff JWT; on 401 → clear session + redirect to D1; base `/v1`, `API_BASE_URL` from Vite env. Error bodies map `{code}` → an i18n staff message.
- **Auth/session:** login stores the token (memory + refresh-safe), `RequireAuth` wrapper on all non-login routes, 8h expiry handled.
- **i18n:** react-i18next, EN + RU JSON resource files; a language switcher. **No patient content-library strings here** — those come from the API already resolved.
- **Layout:** left nav (Queue · Patients · Metrics · Settings · Content) + top bar (clinic name, connection status, language, sign out); the **placeholder-content banner** shows whenever placeholder content is active.
- **Design tokens** live in the Tailwind config (the exact hex/type/spacing above) — components consume tokens, never raw values.

## 6. Testing & DoD

- Backend gap endpoints: unit + integration (clinic-scoped, audit-logged, content approve-per-language, reissue/withdraw), all green with the existing suite.
- Dashboard: component/unit tests (queue ordering never hides urgent; breach flags at 15/30; metric card shows denominator; status chips; auth redirect on 401); `vite build` + `tsc` green; a Playwright smoke of D1→D2→D3 (login, queue renders sections, open an escalation, acknowledge).
- **DoD:** all 8 screens meet the requirements above; the queue never hides an unresolved urgent; escalations are un-editable from the UI; D8 approves per-item-per-language and shows the unapproved count; D6 shows denominators and no readmission rate; the app builds, typechecks, and the smoke path passes against the running backend.

## 7. Scope notes

- If time-boxed, **D2 + D3 are last to compromise** (staff live in them); D1→D6 are the core demo; D7/D8 complete the admin + the safety-line story.
- Charts: a lightweight lib (e.g. Recharts) is acceptable; keep to the design-system palette + denominators.
- SP3 (AI) remains after SP4, pending its design conversation.
