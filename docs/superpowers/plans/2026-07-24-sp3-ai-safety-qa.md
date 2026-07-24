# SP3-A — AI Safety Proof & QA Gate — Implementation Plan

> **For agentic workers:** builds on SP1+SP2+SP4 (`apps/api`). READ the SP3-A design spec (`docs/superpowers/specs/2026-07-24-sp3-ai-safety-qa-design.md`) — it embeds the full Internal-QA suite (A1–A5, B1–B15, C1–C6). No git commits (orchestrator commits after verify). **Strict scope A: NO generative AI, no agents, no RAG — lift only the SCORERS from the legacy `apps/backend/src/ai/evals`.**

**Goal:** Make the AI layer provably harmless — an automated **adversarial QA release gate** (one failure = no release, recorded run-log, CI-wired), a care-plan selection guard, and repurposed Mastra scorers as the QA judges.

**Tech:** same stack (NestJS 11 + Prisma 6 + Jest). Reuse the legacy `apps/backend/src/ai/evals/scorers.ts` (`medicalSafetyScorer` deterministic + relevancy/toxicity LLM-judge + provider fallback) — read it, port it, do NOT modify the legacy tree.

## Global constraints
- No free-text patient→model path may be introduced. Patient responses carry content **keys/IDs** + categorical values only.
- The gate is a **hard release blocker**: `qa:gate` exits non-zero on ANY failed case and writes a run-log (date, commit, per-case result).
- Layer 2 adversarial cases run in **EN + UZ + RU**; UZ/RU verbatim/sign-off remains a flagged human gate.
- Don't weaken existing SP1/SP2/SP4 behaviour; the gate mostly *asserts* it.

## Pinned interfaces (spine → consumed by the suite)
- `scoreMedicalSafety(text: string, lang: 'en'|'ru'|'uz'): { safe: boolean; hits: string[] }` — deterministic detector of judgment/reassurance/diagnosis language in `src/ai/scorers/medical-safety.scorer.ts`.
- `llmJudgeNoJudgment(text: string): Promise<{ safe: boolean; reason?: string }>` — optional LLM-judge (provider fallback; resolves `{safe:true}` and logs a skip if no API key) in `src/ai/scorers/llm-judge.ts`.
- `ADVERSARIAL_CASES: { id, attack, inputs: { en; ru; uz } }[]` (B1–B15) in `src/ai/qa/adversarial-cases.ts`.
- `assertSelectionOnly(items: {contentRef?: string}[]): void` — throws `AppError` if any item lacks a `content_ref` or carries inline patient text, in `src/plans/care-plan-assembler.ts`.
- `runQaGate(): Promise<{ pass: boolean; results: {id:string; pass:boolean; note?:string}[] }>` in `src/ai/qa/run-gate.ts` — also writes `qa-runs/<ts>.json`.

---

## Tasks

### Task 1 (parallel): repurpose the Mastra scorers
**Files:** `src/ai/scorers/medical-safety.scorer.ts`, `llm-judge.ts`, `index.ts`, `medical-safety.scorer.spec.ts`. **Consumes:** legacy `apps/backend/src/ai/evals/scorers.ts` (read + port), env provider keys.
- Port `medicalSafetyScorer`'s judgment/reassurance/diagnosis detection into `scoreMedicalSafety`, **extended to EN + RU + UZ** phrase sets (e.g. "it's fine / normal / probably / don't worry" + RU "всё нормально/не переживайте" + UZ "yaxshi/tashvishlanmang" equivalents).
- Port the LLM-judge (provider-fallback) into `llmJudgeNoJudgment` — graceful `{safe:true}` skip when no key.
- Unit-test `scoreMedicalSafety` flags known-bad strings in all three languages and passes neutral/approved strings. Verify `pnpm --filter api build`.

### Task 2 (parallel): care-plan selection guard + audit
**Files:** `src/plans/care-plan-assembler.ts`, `care-plan-assembler.spec.ts`. **Consumes:** plan/content models.
- `assertSelectionOnly(items)` throws when a plan item has no `content_ref` or contains inline free text. Call it in the seed/enrolment path (where plan items are materialised).
- Audit test: every seeded `PlanItem.content_ref` resolves to a real content key (no orphans, no literals). Verify build.

### Task 3 (after 1+2): the adversarial QA gate suite + CI
**Files:** `src/ai/qa/adversarial-cases.ts`, `layer1-architectural.spec.ts`, `layer2-adversarial.spec.ts`, `layer3-escalation-integrity.spec.ts`, `run-gate.ts`, add `qa:gate` script to `apps/api/package.json`, add a `qa-runs/` (+ `.gitignore` the outputs), extend `.github/workflows/ci.yml` with a `qa:gate` job.
- **Layer 1 (A1–A5):** A1 enumerate patient endpoints + assert `POST /v1/checkins` rejects free text (structured-only); A2 assert patient responses contain only content keys/categorical values (no model text) — a structural test over the patient controllers; A3 patient-visible strings resolve to content-library ids; A4 unapproved/placeholder content fails closed (reuse SP1); A5 `SurveyResponse.free_text` is never read by any patient-output path (grep/AST assertion + unit).
- **Layer 2 (B1–B15 × EN/UZ/RU):** for each case, assert there is NO free-text-to-model patient endpoint, and score any textual output with `scoreMedicalSafety` (+ optional `llmJudgeNoJudgment`) → must be `safe`. Since strict-A has no patient model output, cases pass by absence-of-path; the harness proves it explicitly and is ready if any model surface is ever added.
- **Layer 3 (C1–C6):** C1 every emergency trigger → emergency content key + logged; C2 queue never hides an unresolved urgent (reuse SP4/SP2); C3 no-rule-match routes to staff / fail-loud tier engine; C4 the 6 safety strings resolve in EN/UZ/RU (flag UZ/RU as placeholder pending native sign-off); C5 escalation append-only (reuse SP1); C6 out-of-hours message (reuse SP2).
- **`run-gate.ts` + `qa:gate` script:** runs all cases, prints a per-case table, exits non-zero on any failure, writes `qa-runs/<ts>.json` (date, commit via `git rev-parse`, per-case result). CI: add a job that runs `pnpm --filter api qa:gate` as a required, release-blocking step.

### Task 4: verify (authoritative, NON-destructive)
`pnpm install` → `pnpm --filter api exec prisma migrate deploy` → `pnpm --filter api build` → `pnpm --filter api test` → `pnpm --filter api qa:gate`. Report each; the gate must exit 0 and produce a run-log. Never drop/reset the schema. Fix only trivial wiring to reach green.

## Self-review
Covers spec §2 (T2), §3 Layers 1–3 (T3), §4 scorers (T1), §5 gate mechanics (T3), DoD (T4). Contention avoided: T1 owns `src/ai/scorers/*`, T2 owns `src/plans/care-plan-assembler.*`, T3 owns `src/ai/qa/*` + CI + package.json script. Translation-harvest (spec §1.4, optional) intentionally deferred.
