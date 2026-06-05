✗ Failed to restart all active workflow runs: TypeError: fetch failed# Mastra AI Foundation + RAG Ingest Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use checkbox (`- [ ]`) syntax. **Verify every Mastra v1 API against the Mastra MCP docs server (`getMastraExportDetails`) or the `mastra` skill before coding — signatures changed in v1.**
> **Workflow rule (user):** after EACH task's commit, **push to GitHub** (`git push`). Non-negotiable.

**Goal:** Stand up the NestJS backend's Mastra AI core (3-provider fallback), ingest the Cesarean recovery KB into pgvector on Neon, and ship a care-plan agent grounded in that KB with a non-AI fallback.

**Architecture:** NestJS app hosts a single Mastra instance (`src/ai/mastra/`). Agents use a fallback model array (OpenAI→Anthropic→Gemini). A standalone `tsx` ingest script chunks/embeds the markdown KB into a pgvector index in Neon. A `createVectorQueryTool` (filtered by `surgeryType`) is attached to agents so answers are grounded; on any AI failure, deterministic templates/rules take over.

**Tech Stack:** NestJS · TypeORM · PostgreSQL (Neon + pgvector) · Mastra (`@mastra/core`, `@mastra/rag`, `@mastra/pg`, `@mastra/memory`, `@mastra/evals`) · Vitest · tsx · Zod

---

## Prerequisites (you provide secrets — blocks running, not building)

- **Neon**: a project + `DATABASE_URL` (pooled connection string). Enable extension once: `CREATE EXTENSION IF NOT EXISTS vector;`
- **API keys**: `OPENAI_API_KEY` (required — embeddings + primary model), `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (for fallback).
- Node ≥ 22.13.

> Code is buildable without these; **ingest/agents only RUN once `.env` is filled.**

## File Structure

```
apps/backend/
├─ package.json, tsconfig.json, nest-cli.json, .env.example
├─ src/
│  ├─ main.ts                      # bootstrap, /api/v1, swagger, CORS
│  ├─ app.module.ts
│  ├─ config/env.ts                # typed env access
│  └─ ai/
│     ├─ knowledge/cesarean/*.md   # KB (already committed)
│     ├─ mastra/
│     │  ├─ providers.ts           # FALLBACK_MODELS + EMBEDDER
│     │  ├─ vectors.ts             # PgVector instance, index name/const
│     │  ├─ tools/kb-query.tool.ts # createVectorQueryTool (filter surgeryType)
│     │  ├─ agents/care-plan.agent.ts
│     │  └─ index.ts               # new Mastra({...})
│     ├─ care-plan/
│     │  ├─ care-plan.templates.ts # BE-07 deterministic fallback
│     │  └─ care-plan.types.ts     # Zod schema + TS types
│     └─ scripts/ingest-kb.ts      # tsx ingest script
└─ test/ … (vitest)
```

---

## Task 1: Scaffold NestJS backend (SETUP-02)

**Files:** Create `apps/backend/*` (Nest scaffold).

- [ ] **Step 1: Scaffold** — run in repo root:
```bash
npx -y @nestjs/cli@latest new apps/backend --package-manager npm --skip-git --strict
```
- [ ] **Step 2: Global prefix + CORS + validation** — replace `apps/backend/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const cfg = new DocumentBuilder().setTitle('Hospital AI').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, cfg));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```
- [ ] **Step 3: Verify it boots** — `cd apps/backend && npm run start:dev`, open `http://localhost:3000/api/docs`. Expected: Swagger UI loads. Ctrl-C.
- [ ] **Step 4: Commit + push**
```bash
git add apps/backend && git commit -m "feat(be): scaffold NestJS backend with /api/v1 + swagger" && git push
```

## Task 2: Install deps + config + env (SETUP-06)

**Files:** Modify `apps/backend/package.json`; Create `apps/backend/.env.example`, `apps/backend/src/config/env.ts`.

- [ ] **Step 1: Install** (in `apps/backend`):
```bash
npm i @mastra/core @mastra/rag @mastra/pg @mastra/memory @mastra/evals @mastra/loggers ai zod @nestjs/config @nestjs/swagger
npm i -D tsx vitest
```
- [ ] **Step 2: `.env.example`** (commit this; never commit `.env`):
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=change-me
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
PORT=3000
```
- [ ] **Step 3: `src/config/env.ts`**:
```ts
function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env ${k}`); return v; }
export const env = {
  databaseUrl: () => req('DATABASE_URL'),
  openaiKey: () => req('OPENAI_API_KEY'),
  port: () => Number(process.env.PORT ?? 3000),
};
```
- [ ] **Step 4: Add scripts** to `package.json`: `"ingest": "tsx src/ai/scripts/ingest-kb.ts"`, `"test": "vitest run"`.
- [ ] **Step 5: Commit + push**
```bash
git add apps/backend && git commit -m "chore(be): add Mastra + tooling deps, env config, scripts" && git push
```

## Task 3: Providers — 3-model fallback + embedder (AI-01)

**Files:** Create `apps/backend/src/ai/mastra/providers.ts`.
**Verify first:** `getMastraExportDetails` on `@mastra/core` for the fallback `model` array shape and `@mastra/core/llm` for `ModelRouterEmbeddingModel`.

- [ ] **Step 1: Implement**:
```ts
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

// Fallback chain: if a provider 500s/rate-limits/times out, Mastra tries the next.
export const FALLBACK_MODELS = [
  { model: 'openai/gpt-5.4-mini',         maxRetries: 2 },
  { model: 'anthropic/claude-sonnet-4-6', maxRetries: 1 },
  { model: 'google/gemini-2.5-flash',     maxRetries: 1 },
];

export const EMBEDDER = () => new ModelRouterEmbeddingModel('openai/text-embedding-3-small'); // 1536 dims
export const EMBED_DIM = 1536;
```
- [ ] **Step 2: Commit + push**
```bash
git add apps/backend/src/ai/mastra/providers.ts && git commit -m "feat(ai): 3-provider fallback chain + embedder (AI-01)" && git push
```

## Task 4: Vector store + KB query tool (AI-08 part 1)

**Files:** Create `apps/backend/src/ai/mastra/vectors.ts`, `apps/backend/src/ai/mastra/tools/kb-query.tool.ts`.
**Verify first:** `getMastraExportDetails` on `@mastra/pg` (`PgVector`) and `@mastra/rag` (`createVectorQueryTool`).

- [ ] **Step 1: `vectors.ts`**:
```ts
import { PgVector } from '@mastra/pg';
import { env } from '../../config/env';

export const KB_INDEX = 'cesarean_kb';
export const pgVector = new PgVector({ id: 'kb-vector', connectionString: env.databaseUrl() });
```
- [ ] **Step 2: `tools/kb-query.tool.ts`**:
```ts
import { createVectorQueryTool } from '@mastra/rag';
import { EMBEDDER } from '../providers';
import { KB_INDEX } from '../vectors';

export const kbQueryTool = createVectorQueryTool({
  id: 'searchCesareanKB',
  description: 'Search the cesarean (C-section) recovery guideline knowledge base. Use for any clinical recovery question (wound, pain, activity, warning signs).',
  vectorStoreName: 'pgVector',
  indexName: KB_INDEX,
  model: EMBEDDER(),
  enableFilter: true,     // allow metadata filter by surgeryType/section
  includeSources: true,
});
```
- [ ] **Step 3: Commit + push**
```bash
git add apps/backend/src/ai/mastra && git commit -m "feat(ai): pgvector store + cesarean KB query tool (AI-08)" && git push
```

## Task 5: Ingest script — KB → pgvector (AI-08 part 2)

**Files:** Create `apps/backend/src/ai/scripts/ingest-kb.ts`.
**Verify first:** `@mastra/rag` `MDocument` chunking API + `pgVector.createIndex/upsert` shapes via MCP.

- [ ] **Step 1: Implement** (reads md + frontmatter, chunks, embeds, upserts with metadata):
```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { embedMany } from 'ai';
import { MDocument } from '@mastra/rag';
import { EMBEDDER, EMBED_DIM } from '../mastra/providers';
import { pgVector, KB_INDEX } from '../mastra/vectors';

const KB_DIR = join(__dirname, '../knowledge/cesarean');

function parseFrontmatter(raw: string) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2] };
}

async function main() {
  const files = readdirSync(KB_DIR).filter(f => f.endsWith('.md') && !f.startsWith('00-'));
  const records: { text: string; metadata: Record<string, unknown> }[] = [];
  for (const file of files) {
    const { meta, body } = parseFrontmatter(readFileSync(join(KB_DIR, file), 'utf8'));
    const doc = MDocument.fromMarkdown(body);
    const chunks = await doc.chunk({ strategy: 'markdown', maxSize: 800, overlap: 100 });
    for (const c of chunks) {
      records.push({ text: c.text, metadata: { ...meta, surgeryType: meta.surgeryType ?? 'cesarean', file } });
    }
  }
  const { embeddings } = await embedMany({ model: EMBEDDER(), values: records.map(r => r.text) });
  await pgVector.createIndex({ indexName: KB_INDEX, dimension: EMBED_DIM });
  await pgVector.upsert({
    indexName: KB_INDEX,
    vectors: embeddings,
    metadata: records.map(r => ({ text: r.text, ...r.metadata })), // store text for retrieval
  });
  console.log(`Ingested ${records.length} chunks from ${files.length} files into ${KB_INDEX}.`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
```
- [ ] **Step 2: Smoke test** — with `.env` filled: `npm run ingest`. Expected: `Ingested N chunks ...` (N ≈ 20–40). If Mastra chunk API differs, fix per MCP and re-run.
- [ ] **Step 3: Commit + push**
```bash
git add apps/backend/src/ai/scripts/ingest-kb.ts && git commit -m "feat(ai): ingest cesarean KB into pgvector (AI-08)" && git push
```

## Task 6: Care-plan types + deterministic fallback (BE-07)

**Files:** Create `apps/backend/src/ai/care-plan/care-plan.types.ts`, `care-plan.templates.ts`, `test/care-plan.templates.spec.ts`.

- [ ] **Step 1: Write failing test** `test/care-plan.templates.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { templateCarePlan } from '../src/ai/care-plan/care-plan.templates';

describe('templateCarePlan', () => {
  it('returns valid cesarean items spanning the recovery period', () => {
    const items = templateCarePlan('cesarean', new Date('2026-06-01'));
    expect(items.length).toBeGreaterThan(3);
    expect(items.every(i => ['MEDICATION','DIET','ACTIVITY','CHECKUP','RESTRICTION'].includes(i.type))).toBe(true);
    expect(items.some(i => i.dayOffset >= 14)).toBe(true);
  });
});
```
- [ ] **Step 2: Run — expect FAIL** `npm test`. Expected: cannot find module.
- [ ] **Step 3: `care-plan.types.ts`**:
```ts
import { z } from 'zod';
export const carePlanItemSchema = z.object({
  type: z.enum(['MEDICATION','DIET','ACTIVITY','CHECKUP','RESTRICTION']),
  title: z.string(),
  description: z.string(),
  dayOffset: z.number().int().min(0),
  scheduleTime: z.string().nullable().optional(),
});
export const carePlanSchema = z.object({ items: z.array(carePlanItemSchema) });
export type CarePlanItem = z.infer<typeof carePlanItemSchema>;
```
- [ ] **Step 4: `care-plan.templates.ts`** (deterministic cesarean fallback):
```ts
import { CarePlanItem } from './care-plan.types';

export function templateCarePlan(surgeryType: string, _surgeryDate: Date): CarePlanItem[] {
  // Minimal cesarean template (grounded in KB). AI-02 replaces this when available.
  return [
    { type: 'RESTRICTION', title: 'No heavy lifting', description: 'Do not lift anything heavier than your baby for 6–8 weeks.', dayOffset: 0, scheduleTime: null },
    { type: 'MEDICATION', title: 'Pain relief', description: 'Take paracetamol/ibuprofen as advised (avoid aspirin/codeine if breastfeeding).', dayOffset: 0, scheduleTime: '08:00' },
    { type: 'ACTIVITY', title: 'Gentle walking', description: 'Short daily walks to aid healing and reduce blood-clot risk.', dayOffset: 1, scheduleTime: null },
    { type: 'CHECKUP', title: 'Wound check', description: 'Clean and dry the incision daily; watch for redness/pus.', dayOffset: 2, scheduleTime: null },
    { type: 'CHECKUP', title: 'Stitch/staple removal', description: 'Non-dissolvable stitches/staples removed by a nurse.', dayOffset: 6, scheduleTime: null },
    { type: 'RESTRICTION', title: 'No driving', description: 'Avoid driving for at least 2 weeks and never on opioid pain meds.', dayOffset: 0, scheduleTime: null },
    { type: 'CHECKUP', title: 'Postnatal check', description: 'Attend the ~6-week postnatal review.', dayOffset: 42, scheduleTime: null },
  ];
}
```
- [ ] **Step 5: Run — expect PASS** `npm test`.
- [ ] **Step 6: Commit + push**
```bash
git add apps/backend/src/ai/care-plan test/care-plan.templates.spec.ts && git commit -m "feat(ai): cesarean care-plan schema + deterministic fallback (BE-07)" && git push
```

## Task 7: Care-plan agent + Mastra instance (AI-02)

**Files:** Create `apps/backend/src/ai/mastra/agents/care-plan.agent.ts`, `apps/backend/src/ai/mastra/index.ts`.
**Verify first:** Agent `model` array + `structuredOutput` + `Mastra({ vectors })` registration via MCP.

- [ ] **Step 1: `agents/care-plan.agent.ts`**:
```ts
import { Agent } from '@mastra/core/agent';
import { FALLBACK_MODELS } from '../providers';
import { kbQueryTool } from '../tools/kb-query.tool';

export const carePlanAgent = new Agent({
  id: 'care-plan-agent',
  name: 'Care Plan Agent',
  instructions: [
    'You are a post-surgical care planner for cesarean (C-section) recovery.',
    'ALWAYS call searchCesareanKB to ground the plan in real guidelines before answering.',
    'Output a structured recovery plan covering the full period: medications, diet, activities, check-ups, restrictions.',
  ].join(' '),
  model: FALLBACK_MODELS,
  tools: { kbQuery: kbQueryTool },
});
```
- [ ] **Step 2: `mastra/index.ts`**:
```ts
import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { pgVector } from './vectors';
import { carePlanAgent } from './agents/care-plan.agent';

export const mastra = new Mastra({
  agents: { carePlanAgent },
  vectors: { pgVector },           // name 'pgVector' must match the query tool's vectorStoreName
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});
```
- [ ] **Step 3: Studio check** — `cd apps/backend && npx mastra dev` → `http://localhost:4111`. In Studio, run the care-plan agent with a cesarean prompt; confirm it calls `searchCesareanKB` and returns grounded items. (Needs `.env`.)
- [ ] **Step 4: Commit + push**
```bash
git add apps/backend/src/ai/mastra && git commit -m "feat(ai): grounded care-plan agent + Mastra instance (AI-02)" && git push
```

## Task 8: Care-plan generation service with fallback (AI-02 + BE-07 wiring)

**Files:** Create `apps/backend/src/ai/care-plan/care-plan.service.ts`, `test/care-plan.service.spec.ts`.

- [ ] **Step 1: Write failing test** (fallback path is the contract — must work with AI mocked to throw):
```ts
import { describe, it, expect, vi } from 'vitest';
import { generateCarePlan } from '../src/ai/care-plan/care-plan.service';

describe('generateCarePlan', () => {
  it('falls back to templates when the agent throws', async () => {
    const agent = { generate: vi.fn().mockRejectedValue(new Error('all providers down')) } as any;
    const res = await generateCarePlan(agent, 'cesarean', new Date('2026-06-01'));
    expect(res.generatedByAi).toBe(false);
    expect(res.items.length).toBeGreaterThan(3);
  });
});
```
- [ ] **Step 2: Run — expect FAIL** `npm test`.
- [ ] **Step 3: Implement `care-plan.service.ts`**:
```ts
import { carePlanSchema, CarePlanItem } from './care-plan.types';
import { templateCarePlan } from './care-plan.templates';

export async function generateCarePlan(agent: any, surgeryType: string, surgeryDate: Date):
  Promise<{ items: CarePlanItem[]; generatedByAi: boolean }> {
  try {
    const res = await agent.generate(
      `Create a ${surgeryType} recovery care plan. Surgery date: ${surgeryDate.toISOString().slice(0,10)}.`,
      { structuredOutput: { schema: carePlanSchema } },
    );
    const parsed = carePlanSchema.parse(res.object);
    if (!parsed.items.length) throw new Error('empty plan');
    return { items: parsed.items, generatedByAi: true };
  } catch {
    return { items: templateCarePlan(surgeryType, surgeryDate), generatedByAi: false }; // BE-07 fallback
  }
}
```
- [ ] **Step 4: Run — expect PASS** `npm test`.
- [ ] **Step 5: Commit + push**
```bash
git add apps/backend/src/ai/care-plan && git commit -m "feat(ai): care-plan generation with template fallback (AI-02)" && git push
```

---

## Out of scope (follow-up plans)
- Auth/users/patients/surgery-types/check-ins/alerts CRUD (BE-01..09) — see `BACKEND_AI_PLAN.md`.
- Nurse chat agent + Memory (AI-03, AI-05), risk agent (AI-04), confidence scorers (AI-06), Studio/observability polish (AI-07), seed (POL-01).

## Self-review notes
- Spec coverage: SETUP-02/06, AI-01, AI-08 (ingest+tool), BE-07, AI-02 covered. AI-03/04/05/06 deferred (separate plan) — intentional scope cut.
- Mastra signatures (fallback array, `MDocument.chunk`, `createVectorQueryTool`, `PgVector`, `structuredOutput`) are best-known v1 — **each carrying task says verify via MCP** because v1 moves fast.
- Name-binding: `vectors: { pgVector }` ↔ `vectorStoreName: 'pgVector'` ↔ `KB_INDEX` consistent across Tasks 4 & 7.
