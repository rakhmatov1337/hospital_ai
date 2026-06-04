import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AiAgentKind = 'chat' | 'care-plan' | 'risk' | 'advisor';

// Every AI call is logged here so the superadmin can audit confidence,
// latency, model used, and attach eval scores (ScoreLog).
@Entity('ai_interactions')
export class AiInteraction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  agent!: AiAgentKind;

  @Column({ type: 'uuid', nullable: true })
  hospitalId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  patientId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  surgeryTypeId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  threadId?: string | null;

  @Column({ type: 'text' })
  input!: string;

  @Column({ type: 'text' })
  output!: string;

  @Column({ type: 'float', nullable: true })
  confidence?: number | null;

  @Column({ type: 'varchar', nullable: true })
  modelUsed?: string | null;

  @Column({ type: 'int', nullable: true })
  latencyMs?: number | null;

  @Column({ default: false })
  fallbackUsed!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
