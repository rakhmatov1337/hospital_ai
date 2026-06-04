/**
 * Conventional entry point for the Mastra CLI / Studio (`mastra dev` looks for
 * `src/mastra/index.ts`). The real instance lives next to the AI code in
 * `src/ai/mastra` and is shared with the NestJS app; we just re-export it so
 * Studio loads the exact same agents, workflows, vectors, and scorers.
 */
export { mastra } from '../ai/mastra';
