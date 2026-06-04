# Hospital AI — Backend v2 Implementation Plan

> Full rebuild around a **4-tier multi-tenant RBAC** model with a **Mastra AI layer** (streaming chat, tool calling, workflows, confidence scoring, evals, Studio). Single surgery focus for the AI knowledge base: **Appendectomy (appendicitis surgery)**.

---

## 0. The 4 actors (RBAC hierarchy)

```
SUPERADMIN ──creates──▶ HOSPITAL (+ HOSPITAL_ADMIN user)
                              │
                  ──creates──▶ DOCTOR
                                  │
                      ──creates──▶ PATIENT
```

| Role | Scope | Can do |
|------|-------|--------|
| **SUPERADMIN** | Global | Create hospitals, upload/manage AI surgery documents (KB), see **all AI scoring/eval/confidence tracking**, manage surgery types |
| **HOSPITAL_ADMIN** | One hospital | Create & track doctors, see all hospital patients & analytics |
| **DOCTOR** | Own patients | Create patients (→ AI care plan), set medications/diet/exercises/restrictions, track patients, handle alerts, AI clinical advisor |
| **PATIENT** | Self | Dashboard, checklist, medications, diet, profile, daily check-in, **AI nurse chat (streaming)** |

Tenant scoping: every row carries `hospitalId`; a `TenantGuard` injects `hospitalId` from the JWT and filters all non-superadmin queries.

---

## 1. Data model (TypeORM, Postgres + pgvector)

| Entity | Key fields |
|--------|-----------|
| **User** | id, role (SUPERADMIN/HOSPITAL_ADMIN/DOCTOR/PATIENT), email, passwordHash, fullName, locale (EN/RU/UZ), hospitalId?, title? |
| **Hospital** | id, name, address, logoUrl, status, createdByUserId |
| **SurgeryType** | id, name, nameRu, nameUz, category, avgRecoveryDays, kbIndex (e.g. `appendectomy_kb`) |
| **Patient** | id, userId, hospitalId, doctorId, surgeryTypeId, surgeryDate, postOpDay (computed), status (PRE_OP/RECOVERING/AT_RISK/RECOVERED), accessCode, age, phone, recoveryScore (0-100) |
| **CarePlan** | id, patientId, surgeryTypeId, source (AI/MANUAL), confidence (0-1), aiReasoning, status (DRAFT/ACTIVE), approvedByDoctorId? |
| **CarePlanItem** | id, carePlanId, type (MEDICATION/EXERCISE/DIET/RESTRICTION), title, description, dayOffset, scheduleTimes (string[]), dosage?, frequency? |
| **ItemCompletion** | id, itemId, patientId, date, scheduleTime, completed, completedAt — drives checklist & medication adherence |
| **CheckIn** | id, patientId, date, painLevel, temperature, symptoms (string[]), mood, bpm?, spo2?, source (MANUAL/WEARABLE) |
| **RiskAssessment** | id, checkInId, riskLevel (LOW/MEDIUM/HIGH), advice, alertDoctor, confidence, modelUsed, latencyMs |
| **Alert** | id, patientId, doctorId, severity (CRITICAL/WARNING/INFO), type, title, message, status (UNREAD/READ/DISMISSED), actionLabel |
| **RecoveryPoint** | id, patientId, date, score — daily recovery-score trend (analytics chart) |
| **KbDocument** | id, surgeryTypeId, title, source, license, uploadedByUserId, status (PENDING/INGESTED/FAILED), chunkCount |
| **AiInteraction** | id, agent (chat/care-plan/risk/advisor), patientId?, threadId?, input, output, confidence, modelUsed, latencyMs |
| **ScoreLog** | id, aiInteractionId, scorer (faithfulness/relevancy/medical-safety/groundedness/tool-accuracy…), score (0-1), reason, sampled — feeds superadmin AI dashboard |

`synchronize: true` (hackathon, no migrations). pgvector index per surgery type.

---

## 2. Mastra AI layer (`src/ai/mastra/`)

### Providers — 3-provider fallback (unchanged, proven)
`resolveFallbackModels()` → `[openai/gpt-5.4-mini → anthropic/claude-sonnet-4-6 → google/gemini-2.5-flash]`, built only from configured keys. Embedder `text-embedding-3-small` (1536). If no AI key works → non-AI template/rule fallback (two-layer safety net).

### Agents
| Agent | Output | Memory | Tools | Grounding |
|-------|--------|--------|-------|-----------|
| **carePlanAgent** | `structuredOutput` (items[] + `confidence` + `reasoning`) | — | searchSurgeryKB, getPatientProfile | RAG appendectomy_kb |
| **nurseChatAgent** | **streaming** text | per-patient (`scope: 'resource'`, semanticRecall) | getPatientProfile, getCarePlan, getMedicationSchedule, getRecentCheckIns, searchSurgeryKB | RAG, trilingual EN/RU/UZ |
| **riskAgent** | `structuredOutput` (riskLevel, advice, alertDoctor, `confidence`) | — | searchSurgeryKB | RAG red-flags |
| **clinicalAdvisorAgent** | `structuredOutput` (smartAlerts[], optimizations[]) | — | getRecentCheckIns, getCarePlan | check-in trends |

### Tools (`createTool`, Zod-typed) — the "tool calling to see user profile and other things"
- `getPatientProfile(patientId)` → demographics, surgery, postOpDay, status
- `getCarePlan(patientId)` → grouped items
- `getMedicationSchedule(patientId)` → meds + today's adherence
- `getRecentCheckIns(patientId, n)` → vitals/pain trend
- `searchSurgeryKB` → `createVectorQueryTool` (enableFilter: true) over appendectomy_kb
- `escalateToDoctor(patientId, reason)` → creates CRITICAL alert (gated / approval)

### Streaming (verified v1 API)
```ts
// nurseChatAgent over HTTP (SSE) — NestJS controller
const stream = await nurseChatAgent.stream(messages, {
  memory: { thread: patientId, resource: patientId },
  scorers: { faithfulness: { scorer: 'faithfulness', sampling: { type: 'ratio', rate: 1 } } },
})
// AI SDK v5 transport for the React app:
return createUIMessageStreamResponse({ stream: toAISdkStream(stream, { from: 'agent' }) })
// (or raw: for await (const c of stream.textStream) res.write(`data: ${c}\n\n`))
```

### Workflows (`createWorkflow`/`createStep`/`.commit()`, durable + resumable)
1. **patientOnboardingWorkflow** — create patient → `searchKB` → `carePlanAgent` generates plan → score plan → **suspend for doctor approval (HITL)** → on resume persist items+meds, set baseline RecoveryPoint.
2. **dailyCheckInWorkflow** — check-in → `riskAgent` → branch: HIGH→CRITICAL alert + status AT_RISK (+escalate); MEDIUM→WARNING → recompute recoveryScore → log risk+scores.
3. **recoveryAnalyticsWorkflow** (scheduled) — nightly aggregate check-ins+adherence → RecoveryPoint trend → `clinicalAdvisorAgent` smart alerts/optimizations.
4. **kbIngestionWorkflow** — superadmin upload → chunk (`MDocument.fromMarkdown`) → embed → upsert pgvector → mark INGESTED + chunkCount.

### Confidence scoring
- **Structured agents** (care-plan, risk, advisor): Zod schema includes `confidence: z.number().min(0).max(1)` + `reasoning` — model self-reports, persisted on the entity.
- **Chat**: post-hoc **groundedness scorer** → confidence proxy.
- Surfaced to superadmin via `ScoreLog` + `GET /ai/metrics`.

### Evals / Scorers (`@mastra/evals/scorers/prebuilt` + custom `createScorer`)
- **Prebuilt**: Faithfulness, Answer Relevancy, Hallucination, Toxicity, Tone Consistency, Tool-Call Accuracy.
- **Custom (4-step pipeline)**: `medicalSafetyScorer` (LLM judge — flags unsafe advice / missing "see a doctor"), `groundednessScorer` (answer supported by retrieved KB), `confidenceCalibrationScorer` (stated confidence vs correctness, risk agent).
- Attached to agents with **sampling** (`ratio` rate 1.0 demo / 0.3 prod); results → `ScoreLog`.
- `runEvals` in CI against a golden appendectomy Q&A dataset (`src/ai/evals/appendectomy.dataset.ts`).

### Mastra Studio
Everything registered in `src/ai/mastra/index.ts` → `npx mastra dev` → playground at `http://localhost:4111` to test agents, run workflows step-by-step, and inspect scorer output live.

---

## 3. API design (`/api/v1`, role-guarded)

**Auth** — `POST /auth/login` · `POST /auth/patient-login` (access code) · `GET /auth/me`

**Superadmin** — `POST/GET /hospitals` · `GET/PATCH /hospitals/:id` · `POST/GET/DELETE /kb/documents` (multipart upload → ingestion workflow) · `GET /kb/documents/:id` · `GET/POST /surgery-types` · `GET /ai/metrics` · `GET /ai/interactions` · `GET /ai/scores`

**Hospital admin** — `GET /hospital/overview` · `POST/GET /doctors` · `GET/PATCH /doctors/:id` · `GET /patients` · `GET /hospital/analytics`

**Doctor** — `GET /doctor/dashboard` · `POST /patients` (→ onboarding workflow, returns accessCode) · `GET /patients?status=` · `GET/PATCH /patients/:id` · `GET /patients/:id/care-plan` · `POST /patients/:id/care-plan/items` · `PATCH/DELETE /care-plan-items/:id` · `GET /patients/:id/check-ins` · `GET /patients/:id/risk-history` · `GET /alerts` · `PATCH /alerts/:id/read` · `PATCH /alerts/:id/dismiss` · `GET /doctor/analytics` · `POST /care-plan/:id/approve` (HITL resume)

**Patient** — `GET /me/dashboard` · `GET /me/checklist?date=` · `PATCH /me/checklist/items/:id/complete` · `GET /me/medications?date=` · `PATCH /me/medications/:id/taken` · `GET /me/diet` · `GET /me/profile` · `POST /me/check-in` (→ daily workflow) · `POST /me/chat` (**SSE stream**) · `GET /me/chat/history`

**AI standalone (Studio parity / testing)** — `POST /ai/chat` (stream) · `POST /ai/care-plan` · `POST /ai/risk-score`

---

## 4. Seed data (matches the live frontend screenshots)

- **Superadmin**: `super@hospital.ai` / `super123`
- **Hospital**: "Tashkent Central Hospital" + admin `hospital@hospital.ai` / `hospital123`
- **Doctor**: Dr. Amir Karimov (Chief Oncologist) `demo@hospital.ai` / `demo123`
- **Surgery types**: Knee Replacement, **Appendectomy** (AI KB), Hip Replacement, Rhinoplasty
- **Patients** (access codes `HOSP-1234`…): Nodira Yusupova (PX-1000, Knee, Recovering), Bobur Toshmatov (PX-1001, Appendectomy, **At Risk**), Zulfiya Rakhimova (PX-1002, Rhinoplasty, Recovering), Sardor Nazarov (PX-1003, Hip, Recovered)
- **Care items**: Ibuprofen 400mg @08:00/20:00, Ankle pumps (10 reps/hr), High protein diet (1.2 g/kg), No weight bearing
- **Check-ins + alerts**: pain trend; CRITICAL "Elevated Temperature 38.5°C" + WARNING "Pain 7/10 ×2 days" (Bobur); dismissed "Missed Medication" (Nodira)
- **RecoveryPoints**: Mon–Sun 55/62/48/74/68/58/82 (analytics chart)

---

## 5. AI training data — Appendectomy KB

Curated markdown `src/ai/kb/appendectomy-recovery.md` from **open-licensed** sources (paraphrased + cited):
- **MedlinePlus** (US NLM, public domain) — appendectomy discharge instructions
- **NHS** (Open Government Licence) — appendicitis recovery
- **StatPearls / NCBI Bookshelf** (CC BY) — post-appendectomy management
- **ERAS / ACS** patient education — diet & activity progression

Sections: overview · day-by-day post-op timeline · wound care · pain management & meds · diet progression · activity restrictions · **red flags** (fever >38°C, worsening pain, wound discharge/redness, no bowel movement, vomiting) · when to call the doctor · FAQ (EN/RU/UZ).
→ chunked → embedded → pgvector index `appendectomy_kb`. Golden eval Q&A derived from the same doc.

---

## 6. Build order (each phase = commit + push)

| Phase | Deliverable |
|-------|-------------|
| 0 | Schema + entities + 4-role auth + TenantGuard |
| 1 | Mastra foundation (providers, vectors, memory, index, Studio) |
| 2 | Appendectomy KB doc + kbIngestionWorkflow |
| 3 | carePlanAgent + onboardingWorkflow + confidence |
| 4 | Patient endpoints (dashboard/checklist/meds/diet/profile/check-in) |
| 5 | riskAgent + dailyCheckInWorkflow + alerts |
| 6 | nurseChatAgent streaming + tools + memory |
| 7 | Doctor dashboard + analytics + clinicalAdvisor + HITL approve |
| 8 | Hospital + Superadmin (hospitals, doctors, KB upload, AI scores) |
| 9 | Scorers/evals + ScoreLog + runEvals CI + `/ai/metrics` |
| 10 | Seed + Swagger + Postman + final push |

Reuse from v1: providers/fallback, vectors, memory, RAG ingest, JWT/guards pattern, Swagger/Postman tooling. Rewrite: entities (multi-tenant), all controllers/services, agents (add tools + streaming + advisor), workflows (new), scorers (new).
