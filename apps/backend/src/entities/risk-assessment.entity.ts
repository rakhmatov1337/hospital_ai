import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { RiskLevel } from './check-in.entity';

@Entity('risk_assessments')
export class RiskAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  checkInId!: string;

  @Column({ type: 'uuid' })
  patientId!: string;

  @Column({ type: 'varchar' })
  riskLevel!: RiskLevel;

  @Column({ type: 'text' })
  advice!: string;

  @Column({ default: false })
  alertDoctor!: boolean;

  // 0-1 confidence reported by the risk agent
  @Column({ type: 'float', default: 0 })
  confidence!: number;

  @Column({ type: 'varchar', nullable: true })
  modelUsed?: string | null;

  @Column({ type: 'int', nullable: true })
  latencyMs?: number | null;

  // true when produced by the deterministic rule fallback, not the LLM
  @Column({ default: false })
  fallbackUsed!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
