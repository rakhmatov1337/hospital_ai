import 'reflect-metadata';
import 'dotenv/config';
import { runEvals } from '@mastra/core/evals';
import { mastra } from '../mastra';
import { nurseChatAgent } from '../mastra/agents/nurse-chat.agent';
import {
  medicalSafetyScorer,
  answerRelevancyScorer,
  toxicityScorer,
} from './scorers';
import { appendectomyEvalSet } from './dataset';
import { getAiDataSource } from '../mastra/db';
import { ScoreLog } from '../../entities/score-log.entity';

/**
 * CI / batch evaluation of the nurse chat agent over the golden appendectomy
 * dataset. Writes per-item scores to ScoreLog (superadmin AI dashboard) and
 * fails the process if relevancy falls below threshold.
 *   Build first:  npm run build && npm run eval
 */
const THRESHOLD = 0.6;

async function main() {
  void mastra;
  const scorers = [
    answerRelevancyScorer(),
    toxicityScorer(),
    medicalSafetyScorer,
  ];
  const ds = await getAiDataSource();
  const logRepo = ds.getRepository(ScoreLog);

  console.log(`Running evals over ${appendectomyEvalSet.length} questions...`);
  const result = await runEvals({
    data: appendectomyEvalSet,
    scorers,
    target: nurseChatAgent,
    concurrency: 2,
    onItemComplete: async ({ scorerResults }) => {
      for (const [scorer, r] of Object.entries(scorerResults)) {
        const score = typeof r?.score === 'number' ? r.score : null;
        if (score == null) continue;
        try {
          await logRepo.save(
            logRepo.create({
              agent: 'chat',
              scorer,
              score,
              reason: r?.reason ?? null,
            }),
          );
        } catch {
          /* score_logs table may not exist before first app boot/seed */
        }
      }
    },
  });

  console.log('\nAggregate scores:');
  for (const [scorer, v] of Object.entries(result.scores)) {
    console.log(` - ${scorer}:`, JSON.stringify(v));
  }

  const rel = result.scores['answer-relevancy'];
  const avg =
    typeof rel === 'number' ? rel : (rel?.average ?? rel?.score ?? null);
  if (typeof avg === 'number' && avg < THRESHOLD) {
    console.error(`\n❌ answer-relevancy ${avg} < ${THRESHOLD}`);
    process.exit(1);
  }
  console.log('\n✅ Evals passed. Scores written to ScoreLog.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Eval run failed:', e);
  process.exit(1);
});
