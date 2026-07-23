# SP4 — Clinician Dashboard — Implementation Plan

> **For agentic workers:** READ the SP4 design spec (`docs/superpowers/specs/2026-07-23-sp4-dashboard-design.md`) — it embeds the EXACT Design System tokens + all D1–D8 requirements. No git commits (orchestrator commits after verify). Follow the design tokens precisely — do NOT invent colours/sizes/spacing.

**Goal:** Build `apps/dashboard` (React 18 + Vite + TS + Tailwind + TanStack Query + react-router) — 8 screens (D1–D8) on the SP1+SP2 backend — plus the missing backend endpoints.

**Backend routes that exist:** `POST /v1/auth/staff/login` · `GET /v1/clinics/me` · `GET /v1/escalations` · `GET /v1/escalations/:id` · `POST /v1/escalations/:id/acknowledge` · `POST /v1/escalations/:id/contact` · `GET /v1/patients` · `POST /v1/patients` · `GET /v1/patients/:id` · `GET /v1/metrics` · `GET /v1/content/:key`.

## Global constraints
- Stack per ADR; TypeScript strict; Tailwind holds the EXACT design tokens (spec §2); components consume tokens, never raw hex. Bundle **Inter**.
- Staff JWT (`aud:"staff"`, 8h) attached to every request; on 401 → clear session + redirect to `/login`. Base `/v1`, `VITE_API_BASE_URL`.
- Dashboard i18n **EN + RU only**, **namespaced per screen** (`src/locales/{en,ru}/<ns>.json`) so screens don't collide; no patient content-library strings in the dashboard.
- **The queue never reorders/collapses/paginates/hides an unresolved urgent item.** Escalations are **not editable/deletable** from the UI. Overdue = grey, never red. Tiers always carry icon + label + colour (never colour alone). Metric cards always show the denominator.
- Backend gaps: `aud:"staff"`, clinic-scoped, tested; name/phone/emergency changes audit-logged.

## File structure (`apps/dashboard`)
```
apps/dashboard/
├─ package.json · vite.config.ts · tsconfig.json · tailwind.config.ts · index.html · postcss.config.js
├─ src/main.tsx · src/App.tsx (router + providers)
├─ src/app/router.tsx            # ALL routes -> page components (foundation writes; screens fill pages)
├─ src/app/layout.tsx            # nav + topbar + placeholder banner
├─ src/lib/api-client.ts         # typed fetch + auth attach + 401 handling
├─ src/lib/query.ts              # QueryClient
├─ src/lib/auth.tsx              # session store + RequireAuth
├─ src/lib/i18n.ts               # i18next, namespace-per-screen loader
├─ src/ui/                       # design-system component library (shared)
│   Button, Card, Input, Select, StatusChip, TierBadge, QueueSectionHeader, QueueRow,
│   MetricCard, DataTable, ConnectionStatus, ConfirmDialog, Banner, Spinner, EmptyState
├─ src/features/<screen>/        # one dir per screen: page.tsx + components + api.ts (hooks) + locale ns
└─ src/locales/{en,ru}/<ns>.json
```

## Tasks

### Task BG (backend gaps) — `apps/api`, runs parallel with FF
**Add + test** (one agent, one migration if needed): (1) **Content mgmt/approval**: `GET /v1/content`, `GET /v1/content/items/:id` (3 translations + version history), `POST /v1/content/translations/:id/approve` (per language), `POST .../request-changes`, `GET /v1/content/unapproved-count`; editing approved → new Draft version. (2) **Clinic settings**: `PATCH /v1/clinics/me` (audit-log name/phone/emergency changes with actor+timestamp — add append-only `AuditLog` model + migration), `GET/POST/PATCH /v1/staff`. (3) **Patients**: enrich `GET /v1/patients` (adherence %, last_active, open_escalations, attention_flag) + `GET /v1/patients/:id` (adherence series, task history, check-ins w/ tier+outcome, escalation history, consent), `POST /v1/patients/:id/reissue-code`, `PATCH /v1/patients/:id/withdraw`. Add response types to `packages/shared-types`. Verify `pnpm --filter api build` + tests.

### Task FF (frontend foundation) — single-writer linchpin, must `vite build` + `tsc` green
Scaffold `apps/dashboard` in the pnpm workspace. Deliver:
- Vite + TS(strict) + Tailwind config holding the EXACT tokens (spec §2: all colours incl. tier colours, Inter type scale, 4pt spacing, radii); bundle Inter.
- `src/lib/api-client.ts` — typed fetch (base `/v1`, `VITE_API_BASE_URL`), attaches staff JWT, 401 → clear+redirect; `{code}`→i18n message. `src/lib/query.ts` QueryClient. `src/lib/auth.tsx` — session store + `RequireAuth`. `src/lib/i18n.ts` — i18next EN+RU, **namespace-per-screen** loader.
- `src/app/router.tsx` — routes `/login`(D1), `/`→`/queue`(D2), `/escalations/:id`(D3), `/patients`(D4), `/patients/:id`(D5, +`/patients/new`), `/metrics`(D6), `/settings`(D7), `/content`(D8) → each a lazy page component (create placeholder `features/<screen>/page.tsx` exporting a named page so screens just fill them in). `src/app/layout.tsx` — left nav (Queue·Patients·Metrics·Settings·Content) + topbar (clinic name via `GET /v1/clinics/me`, ConnectionStatus, language switcher, sign out) + **placeholder-content banner**.
- `src/ui/*` — the shared component library per spec §2 (Button/Card/Input/Select/StatusChip/TierBadge[icon+label+colour]/QueueSectionHeader/QueueRow/MetricCard[with denominator]/DataTable/ConnectionStatus/ConfirmDialog/Banner/Spinner/EmptyState). Storybook not required; a component unit test file is.
- **D1 login page** fully (email+password → `POST /v1/auth/staff/login`, store token, redirect to `/queue`; no self-registration; forgot-password link).
**Pinned for screens (consume, don't redefine):** `apiClient.get/post/patch<T>(path, body?)`; `useAuth()`; `<RequireAuth>`; the `src/ui/*` exports; the route paths above; the tier colour/icon map in `src/ui/tier.ts`. Verify `pnpm --filter dashboard build` + `tsc` green + login renders.

### Tasks D2–D8 (parallel screens) — each owns `src/features/<screen>/*` + `src/locales/{en,ru}/<screen>.json`
Fill in the already-routed page. Use `src/ui/*` + `apiClient` + own `api.ts` query hooks (TanStack Query). Add your locale namespace. Do NOT touch router/layout/other features/shared locale files. Verify with `pnpm --filter dashboard exec tsc --noEmit` (ignore errors in other features).
- **D2 queue** (`features/queue`): `GET /v1/escalations`, `refetchInterval: 30000`, sections Emergency/Urgent/Routine (that order), QueueRow with **live elapsed counter**, breach flags at 15/30, count badges, **audible+visual alert on new urgent/emergency** (compare prev vs new ids), filter All/Unresolved(default), ConnectionStatus + last-updated, empty state, `[TEST]` styling, row→`/escalations/:id`. **Never hide an unresolved urgent.** Component test: ordering + breach flags.
- **D3 escalation detail** (`features/escalation`): `GET /v1/escalations/:id`; patient info + click-to-call `tel:`; **verbatim check-in answers**; rule + `rule_version`; timeline; last 5 check-ins + adherence; **Acknowledge** (`POST .../acknowledge`, halts ladder) + **Mark contacted** (`POST .../contact` with **outcome selector** — advised_at_home/attend_clinic/referred_emergency/no_action/unable_to_reach) + staff clinical note; nothing editable; concurrent-ack message; no delete/dismiss-without-outcome.
- **D4 patient list** (`features/patients`): enriched `GET /v1/patients` table (name·procedure·discharge·recovery day·**adherence %**·last active·open escalations·status) with **attention flags**, filter Active/Completed/Withdrawn, sort, Add patient→`/patients/new`, row→`/patients/:id`.
- **D5 patient detail + enrol** (`features/patient-detail`): view (header, adherence chart[use `src/ui` or Recharts w/ design palette], task history, check-ins w/ tier+outcome, escalation history, consent[immutable]) + Withdraw(confirm)/Reissue-code; create mode (name, phone +998, age band, procedure, discharge, language, **plan-template select filtered by procedure**) → `POST /v1/patients` → show generated **6-char code large + printable**.
- **D6 metrics** (`features/metrics`): `GET /v1/metrics`; adherence headline + trend by recovery day, retention curve d7/14/30, escalation counts/median-ack/median-contact/breach, engagement, language split, satisfaction; date-range + CSV export; **every % shows denominator**; **no readmission rate**; empty state. Charts: design palette, accessible, denominators.
- **D7 settings** (`features/settings`): `GET /v1/clinics/me` + `PATCH /v1/clinics/me`; name/phone/hours/contacts/emergency/timings; **confirm dialog + note that name/phone changes patient-facing strings**; staff accounts list (`GET/POST/PATCH /v1/staff`).
- **D8 content approval** (`features/content`): `GET /v1/content` list (id, category, status, languages, last approved by/when) + **prominent unapproved count** (`GET /v1/content/unapproved-count`); detail 3 langs side-by-side + version history; **Approve/Request-changes per item per language**; filter needs-approval/missing-translation/approved; editing approved → Draft.

### Task Verify (authoritative)
`pnpm install` → `pnpm --filter api exec prisma migrate deploy` (non-destructive; NEVER drop schema) → `pnpm --filter api build && pnpm --filter api seed && pnpm --filter api test` → `pnpm --filter dashboard build && pnpm --filter dashboard exec tsc --noEmit && pnpm --filter dashboard test`. Report pass/fail with first real error; fix only trivial wiring to reach green. (Runtime Playwright smoke against the live stack is done by the orchestrator afterward.)

## Self-review
Covers all backend gaps (BG) + foundation/D1 (FF) + D2–D8 + verify. Contention avoided: router/layout/tailwind/api-client/ui-lib written once in FF; screens own disjoint feature dirs + namespaced locales; one backend agent owns the api-side migration.
