import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../../config/env';
import { User } from '../../entities/user.entity';
import { Hospital } from '../../entities/hospital.entity';
import { SurgeryType } from '../../entities/surgery-type.entity';
import { Patient } from '../../entities/patient.entity';
import { CarePlan } from '../../entities/care-plan.entity';
import { CarePlanItem } from '../../entities/care-plan-item.entity';
import { ItemCompletion } from '../../entities/item-completion.entity';
import { CheckIn } from '../../entities/check-in.entity';
import { RiskAssessment } from '../../entities/risk-assessment.entity';
import { Alert } from '../../entities/alert.entity';
import { RecoveryPoint } from '../../entities/recovery-point.entity';
import { KbDocument } from '../../entities/kb-document.entity';
import { AiInteraction } from '../../entities/ai-interaction.entity';
import { ScoreLog } from '../../entities/score-log.entity';

const ENTITIES = [
  User,
  Hospital,
  SurgeryType,
  Patient,
  CarePlan,
  CarePlanItem,
  ItemCompletion,
  CheckIn,
  RiskAssessment,
  Alert,
  RecoveryPoint,
  KbDocument,
  AiInteraction,
  ScoreLog,
];

let ds: DataSource | null = null;

/**
 * Standalone read DataSource for Mastra tools/workflows. Independent of Nest DI
 * so the same agents run unchanged in Mastra Studio (`mastra dev`). Never
 * synchronizes — the Nest app owns the schema.
 */
export async function getAiDataSource(): Promise<DataSource> {
  if (ds?.isInitialized) return ds;
  const url = env.databaseUrl();
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(
    new URL(url).hostname,
  );
  ds = new DataSource({
    type: 'postgres',
    url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    synchronize: false,
    entities: ENTITIES,
  });
  await ds.initialize();
  return ds;
}
