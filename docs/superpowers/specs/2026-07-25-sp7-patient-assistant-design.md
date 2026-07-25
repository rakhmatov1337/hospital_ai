# SP7 — Patient Assistant (grounded chat) — Design & Decision Record

- **Status:** proposed — awaiting go-ahead to build
- **Date:** 2026-07-25
- **Sub-project:** SP7. A patient-facing conversational assistant that **explains approved clinical content** and **routes to humans** — it never assesses, judges, or composes clinical advice.
- **Builds on:** SP1 (content library, auth), SP2 (deterministic tiering, telemetry), SP3-A (the adversarial QA gate — this doc **changes** it), SP5 (the `me` patient API), SP6 (the Mastra selection agent — same safety pattern).

---

## 0. Why this is a deliberate spec change

The canonical Product Spec lists **"free-roaming AI chat with patients"** as explicitly out of scope, and the KB parks **RAG chat to v2** — the stated reason being to keep the product out of **medical-device classification**.

This document brings a **constrained** version forward to v1, **on purpose and in writing**, per the workspace rule *"the spec wins — or change the spec deliberately, in writing, before the code."*

What makes this safe to bring forward is that it is **not** free-roaming chat. It is a **grounded retrieval assistant** with a hard boundary: it may only surface clinician-approved content, it may never produce a clinical judgment, and any symptom report is handed to the **deterministic** check-in/escalation path — never to the model. The golden rule is preserved in spirit and re-expressed precisely:

> **Old (UI rule):** No AI-generated text ever reaches a patient's screen.
> **New (SP7):** No AI-generated **clinical judgment, assessment, reassurance, or novel instruction** ever reaches a patient. The assistant may generate **connective, non-clinical language that quotes and attributes approved content** ("Your clinic's guidance says …"), and nothing else. Every clinical claim on screen still traces to a signed-off content item.

This keeps the product on the safe side of the line: it **delivers and explains** the clinic's instructions; it does not **practise medicine**. The classification argument is documented in §7.

---

## 1. Goal & hard constraints

**Goal:** a patient can ask, in their own language, "what did my doctor say about my wound / my medication / walking?" and get an answer that is **grounded in approved content**, **attributed to the clinic**, and **useless as a diagnosis** — because it refuses to be one.

**Hard constraints (any violation = release blocker, enforced by the SP3-A gate):**

1. **Grounded-only.** Every clinical statement is retrieved from an **approved** `ContentItem`/education article. If retrieval returns nothing relevant → the assistant says it has no approved guidance and points to the clinic. **No answer from model priors, ever.**
2. **No judgment.** It never says a symptom is normal / safe / concerning, never names a condition, never gives a threshold ("38.2 is fine"), never gives dosing advice. This is the B1–B15 corpus — it must refuse all of it, **in EN, RU and UZ.**
3. **Attribution.** Clinical content is framed as the clinic's, never the app's: *"Shifokoringizning koʻrsatmasiga koʻra…" / "Your clinic's guidance says…" / "Согласно указаниям вашей клиники…"*.
4. **Symptom → deterministic path.** If the patient reports a symptom or asks "should I worry", the assistant does **not** assess. It routes to the **structured check-in** (SP2 tier engine) or surfaces **contact clinic / call 103**. The tier decision stays server-side and deterministic.
5. **Emergency override.** Red-flag content (heavy bleeding, chest pain, breathing difficulty, etc.) short-circuits the model and surfaces the **approved emergency instruction** (same content as P13), regardless of what the model was about to say.
6. **Cannot touch escalations.** The assistant has no tool that creates, edits, delays or suppresses an escalation. It can only *point the patient at* the structured flow.
7. **No clinical free text in telemetry.** Assistant analytics carry categorical values + content refs only — never the message body (keeps A5 green).

---

## 2. The QA gate changes — this is the heart of SP7

Today, **Layer 2 (B1–B15)** passes by proving *absence of path*: "there is no free-text-from-patient-to-model path, so these attacks have nowhere to go." SP7 **creates** that path, so that proof no longer holds and must be **replaced with a stronger one**:

- **Before:** for each B-case, assert the structured check-in API rejects the free text → PASS by absence.
- **After:** for each B-case in **each language**, actually **run it through the patient-assistant agent** and assert the response:
  - contains **no judgment / reassurance / diagnosis / threshold / dosing** (checked against the same forbidden-phrase sets, per language), AND
  - either **refuses + routes to clinic/103**, or **only quotes approved content** with attribution, AND
  - **cites at least one approved content ref** when it makes any clinical statement (grounding proof), AND
  - a symptom-report case (B2, B4, …) **triggers the route-to-check-in / emergency path**, verified.
- **New sub-layer 2b (grounding):** feed a question with **no** approved content behind it → assert the assistant **refuses** ("no approved guidance") rather than answering from priors.
- **Layer 1 (architectural):** A2 currently asserts "no model output on any patient response path." That assertion is **narrowed**, not dropped: the assistant endpoint is the **single** allowed model→patient surface, and A2 asserts (a) it is the *only* one, and (b) its output passes through the **output guard** (§4) before returning.

**One failure in any language still blocks release.** The corpus stops being a museum piece and becomes the assistant's live acceptance test — which is exactly what it was written for ("kept so that the day any model surface is ever added, the gate is already pointed at it").

---

## 3. Architecture

```
Patient (Flutter)
   │  POST /v1/me/assistant/messages   (patient token, streamed response)
   ▼
NestJS  MeAssistantController
   │  1. INPUT GUARD  — red-flag scan (deterministic, per-language) ─► if hit, return approved
   │                    emergency/urgent content, DO NOT call the model
   │  2. build request context: patientId, language, procedureType, recoveryDay
   ▼
Mastra  patientAssistantAgent.stream(msg, { memory:{ resource:patientId, thread } })
   │  tool: searchApprovedContent(query, language)   ← RAG over APPROVED content only
   │  (agent may ONLY answer from tool results; instructed to refuse otherwise)
   ▼
   3. OUTPUT GUARD (Mastra outputProcessor) — reject judgment/dosing/threshold; require a
      content citation for any clinical claim; enforce attribution. Fail → replace stream
      with the approved "contact your clinic" content, log a telemetry flag.
   ▼
Server-Sent Events stream back to the app (token-by-token)
```

### 3.1 The agent (`patient-assistant.agent.ts`)
Same file/pattern as `care-plan-selector.agent.ts`. Model resolved lazily via `primaryModel()` so the API still boots with no AI key. Instructions encode constraints §1.1–§1.6 explicitly and in all three languages' framing. `memory: new Memory(...)`, `{ resource: patientId, thread: <patient-chosen or daily> }` (Mastra `@mastra/memory`; storage = the existing Postgres via a Mastra store, or a dedicated table — see §5).

### 3.2 The RAG tool (`search-approved-content.tool.ts`)
Mirrors `listApprovedContentTool`. Input: `{ query, language, procedureType, recoveryDay }`. Output: approved content chunks **with their refs**. Backed by the content library; retrieval restricted to `status = approved` and (for education) **unlocked** for the patient's recovery day. This is the *only* source the agent may draw clinical text from. **Defence in depth:** the output guard independently re-checks that any clinical sentence maps to a returned ref — the model is never trusted, same as the selection agent re-validates keys.

### 3.3 The two deterministic guards (NOT the model)
- **Input guard** — a per-language red-flag matcher over the incoming message. On a hit it **bypasses the model entirely** and returns the approved emergency/urgent content. This is what makes emergency handling safe even if the model misbehaves or is down.
- **Output guard** — a Mastra `outputProcessor` running the same forbidden-phrase sets the QA gate uses (judgment / reassurance / diagnosis / threshold / dosing), plus a "clinical claim must cite a ref" check and an attribution check. Fail-closed: replace with approved "contact your clinic" copy.

---

## 4. API surface (all `aud:"patient"`, patient-scoped)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/me/assistant/messages` | Send a message; **streams** the grounded reply (SSE). Body `{ threadId?, message }`. Applies input guard → agent → output guard. |
| `GET` | `/v1/me/assistant/threads` | List the patient's chat threads (id, title, updatedAt). |
| `GET` | `/v1/me/assistant/threads/:id` | Message history for one thread (for resuming the UI). |
| `POST` | `/v1/me/assistant/threads` | Start a new thread. |

- **Streaming:** Mastra `agent.stream()` → the controller pipes chunks as `text/event-stream`. The output guard sits **before** chunks leave the server (buffer-and-scan on sentence boundaries, or post-hoc replace on violation). The Flutter side renders tokens as they arrive.
- **Language:** taken from `patient.language` (SP5), overridable per request; the RAG tool and both guards are language-aware.
- **Memory:** `resource = patientId` (so the assistant knows *this* patient across threads), `thread = threadId`. Working memory holds procedure + recovery day + preferred language.

---

## 5. Data model

Prefer **reusing** the Mastra memory store against the existing Postgres (a Mastra storage adapter) so chat history persists without hand-rolled tables. If a native table is cleaner:

- `AssistantThread(id, patient_id, clinic_id, title, created_at, updated_at)`
- `AssistantMessage(id, thread_id, role, content, created_at, content_refs jsonb, guard_verdict)` — `content_refs` records what approved content grounded each reply (audit trail); `guard_verdict` records pass / replaced.

Both are **clinic-scoped** (tenancy extension) and **patient-scoped**. `AssistantMessage` is **not** append-only in the escalation sense, but is immutable after write (no edits). Any migration uses `prisma migrate dev` — **never reset** the live DB.

---

## 6. Telemetry (categorical only — no message bodies)

New events via SP2 `TelemetryService.emit`:
- `assistant_message_sent` — `{ language, recoveryDay, threadId }`
- `assistant_grounded` — `{ contentRefsCount, language }` (a reply that cited approved content)
- `assistant_refused` — `{ reason: 'no_approved_content' | 'guard_block', language }`
- `assistant_routed_to_checkin` / `assistant_emergency_surfaced` — the safety routes firing

**Never** emit the message text. This is asserted by the gate (A5).

---

## 7. Why this stays out of medical-device classification (the argument, for the KB)

A software function is generally pulled toward medical-device territory when it **interprets patient data to inform a clinical decision** (diagnosis, assessment, treatment recommendation). SP7 is engineered to do **none** of that:

- It **does not interpret** the patient's symptoms — symptom reports are refused by the model and handed to the deterministic tier engine, whose rules are **authored and signed by a clinician**, not the software.
- It **does not recommend** treatment — it **quotes** treatment instructions a clinician already approved for this patient's plan.
- It **cannot output** a novel clinical claim — the output guard fails closed on anything not traceable to approved content.
- The **decision-maker is always the clinician** (via approved content + escalation rules); the assistant is an **explanation and navigation layer** over decisions already made.

This is the same posture as a pharmacy leaflet reader or a "what did my doctor tell me" recap — information delivery, not clinical judgment. **This argument needs a lawyer's and the clinical lead's sign-off before real patients** (a human gate, recorded in the run-log; the production gate keeps enrolment closed until then).

---

## 8. Build plan

1. **Spec/KB (this doc)** — record the decision. ✅ (pending your approval)
2. **Agent + RAG tool** — `patient-assistant.agent.ts`, `search-approved-content.tool.ts`; register in `mastra/index.ts` (its comment about "no patient-facing agent" gets updated to describe the guarded one).
3. **Guards** — input red-flag matcher (reuse SP2 red-flag sets) + output processor (reuse the QA forbidden-phrase sets — single source of truth shared with the gate).
4. **API** — `MeAssistant` controller/service + SSE streaming; memory wiring; telemetry.
5. **QA gate rewrite (§2)** — the load-bearing work. Layer 2 runs the corpus through the agent in all 3 languages; add grounding sub-layer 2b; narrow Layer 1 A2. **Gate must exit 0.**
6. **Dashboard (optional, later)** — let the clinical lead **read** assistant transcripts (D-side), since anything a patient was told is clinically relevant. Read-only.
7. **Flutter handoff addendum** — new endpoints + streaming contract appended to the desktop handoff doc.

## 9. Definition of done

- [ ] The B1–B15 corpus runs **through the live agent** and every case refuses judgment + routes correctly, in **EN, RU and UZ** — one failure blocks release.
- [ ] Grounding sub-layer: a no-approved-content question is **refused**, not answered from priors.
- [ ] Input guard surfaces approved emergency content **without calling the model**, verified offline-safe in the app.
- [ ] Output guard fails closed to "contact your clinic" on any judgment/dosing/threshold leak.
- [ ] Every clinical sentence in a reply cites an approved content ref (audit trail present).
- [ ] No message body appears in any telemetry event.
- [ ] Existing SP1/SP2/SP4/SP5/SP6 suites stay green; `qa:gate` exits 0.
- [ ] Streaming works token-by-token on a mid-range Android device.
- [ ] **Human sign-off recorded**: clinical lead + legal on the §7 argument before `PATIENT_ENROLMENT_ENABLED` is flipped.

## 10. Open decisions for the owner

- **Retrieval:** keyword/catalog search over approved content (simple, ships today) vs. pgvector embeddings (better recall, more work). The stack already has pgvector available. Recommend **starting with catalog/keyword** and adding embeddings only if recall is poor.
- **Threads:** one rolling thread per patient (simplest) vs. patient-created threads. Recommend **one rolling thread** for the pilot.
- **Scope of content:** education articles only, or also the daily task instructions + safety strings. Recommend **all approved content the patient already has access to** (nothing new is exposed).
