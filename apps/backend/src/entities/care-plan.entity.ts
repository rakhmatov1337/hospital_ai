import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { CarePlanItem } from './care-plan-item.entity';

export type CarePlanSource = 'AI' | 'MANUAL';
export type CarePlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

@Entity('care_plans')
export class CarePlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientId' })
  patient!: Patient;
  @Column()
  patientId!: string;

  @Column({ type: 'uuid' })
  surgeryTypeId!: string;

  @Column({ type: 'varchar', default: 'AI' })
  source!: CarePlanSource;

  // 0-1 confidence reported by the care-plan agent (null for manual)
  @Column({ type: 'float', nullable: true })
  confidence?: number | null;

  @Column({ type: 'text', nullable: true })
  aiReasoning?: string | null;

  @Column({ type: 'varchar', nullable: true })
  modelUsed?: string | null;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status!: CarePlanStatus;

  // doctor who approved the AI draft (HITL)
  @Column({ type: 'uuid', nullable: true })
  approvedByDoctorId?: string | null;

  @OneToMany(() => CarePlanItem, (item) => item.carePlan, { cascade: true })
  items!: CarePlanItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
