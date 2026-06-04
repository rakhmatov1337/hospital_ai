import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Patient } from './patient.entity';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CheckInSource = 'MANUAL' | 'WEARABLE';

@Entity('check_ins')
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientId' })
  patient!: Patient;
  @Column()
  patientId!: string;

  // date-only for per-day grouping; createdAt holds the timestamp
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'int' })
  painLevel!: number;

  @Column({ type: 'float', nullable: true })
  temperature?: number | null;

  @Column({ type: 'simple-array', nullable: true })
  symptoms?: string[];

  @Column({ type: 'varchar', nullable: true })
  mood?: string | null;

  @Column({ type: 'int', nullable: true })
  bpm?: number | null;

  @Column({ type: 'int', nullable: true })
  spo2?: number | null;

  @Column({ type: 'varchar', default: 'MANUAL' })
  source!: CheckInSource;

  @Column({ type: 'varchar', nullable: true })
  riskLevel?: RiskLevel | null;

  @CreateDateColumn()
  createdAt!: Date;
}
