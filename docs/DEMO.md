# Hospital AI — Demo Cheat-Sheet (AI backend)

Everything below is **working and verified live** (real OpenAI + RAG over the cesarean KB).

## One-time setup
```bash
cd apps/backend
cp .env.example .env          # set DATABASE_URL (local Postgres ok) + OPENAI_API_KEY
#   local Postgres: run once ->  CREATE EXTENSION IF NOT EXISTS vector;
npm install
npm run ingest                # -> "Ingested 13 chunks ... into cesarean_kb"
```

## Run
```bash
npm run start:dev             # API:    http://localhost:3000/api/v1   (Swagger: /api/docs)
npx mastra dev                # Studio: http://localhost:4111   (agents, tools, memory, traces)
```

## The 3 AI features (curl — copy/paste during demo)

### 1) Risk scoring + confidence + auto-alert (AI-04)
```bash
curl -X POST http://localhost:3000/api/v1/ai/risk-score -H "Content-Type: application/json" \
  -d '{"painLevel":9,"temperature":38.7,"symptoms":["heavy bleeding","chills"],"recoveryDay":2}'
```
→ `{"riskLevel":"HIGH","alertDoctor":true,"confidence":0.98,"advice":"...infection or hemorrhage...","generatedByAi":true}`
**Say:** "Fever + bleeding on day 2 → the AI flags HIGH risk with 98% confidence and auto-alerts the doctor — grounded in real guidelines, not guessed."

### 2) Grounded trilingual nurse chat + memory (AI-03 / AI-05)
```bash
curl -X POST http://localhost:3000/api/v1/ai/chat -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Can I take a bath on day 4 after my c-section?"}],"surgeryType":"cesarean","recoveryDay":4}'
```
→ "shower ok, **bath not yet — infection risk** ... For emergencies, contact your doctor immediately."
**Say:** "It answers from the medical KB (avoid baths for 3 weeks), in the patient's language, and remembers them across sessions." Try the same in Russian/Uzbek to show trilingual.

### 3) AI care-plan generation (AI-02)
```bash
curl -X POST http://localhost:3000/api/v1/ai/care-plan -H "Content-Type: application/json" \
  -d '{"surgeryType":"cesarean","surgeryDate":"2026-06-01"}'
```
→ `{"generatedByAi":true,"items":[ ...17 grounded items: meds, diet, activity, check-ups, restrictions... ]}`

## The "wow" resilience demo (judges love this)
- **RAG grounding:** in Studio, run the nurse agent and show it calling `searchCesareanKB` before answering.
- **Provider fallback:** the `model` is a chain — OpenAI → Anthropic → Gemini. With only the OpenAI key set, it uses OpenAI; add the others and it survives provider outages automatically.
- **Never breaks:** rename `OPENAI_API_KEY` to a bad value and re-run the calls → risk falls back to **rule-based** scoring, care-plan to **templates**, chat to a **safe reply**. The demo still works with AI fully down.

## What's grounded by what
KB: `apps/backend/src/ai/knowledge/cesarean/` (NHS + MedlinePlus, ingested into pgvector `cesarean_kb`).
Care-plan + chat + risk agents all retrieve from it via the `searchCesareanKB` tool.
