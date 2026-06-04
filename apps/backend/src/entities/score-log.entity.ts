import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AiAgentKind } from './ai-interaction.entity';

// One scorer result for one AI interaction. Aggregated into the
// superadmin AI-quality dashboard (/ai/metrics).
@Entity('score_logs')
export class ScoreLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  aiInteractionId?: string | null;

  @Column({ type: 'varchar' })
  agent!: AiAgentKind;

  @Column({ type: 'uuid', nullable: true })
  surgeryTypeId?: string | null;

  // e.g. faithfulness, answer-relevancy, medical-safety, groundedness,
  // tool-call-accuracy, confidence-calibration
  @Column({ type: 'varchar' })
  scorer!: string;

  @Column({ type: 'float' })
  score!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
