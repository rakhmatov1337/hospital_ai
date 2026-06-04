import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CarePlan } from './care-plan.entity';

export type CarePlanItemType =
  | 'MEDICATION'
  | 'EXERCISE'
  | 'DIET'
  | 'RESTRICTION';

@Entity('care_plan_items')
export class CarePlanItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => CarePlan, (plan) => plan.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'carePlanId' })
  carePlan!: CarePlan;
  @Column()
  carePlanId!: string;

  @Column({ type: 'uuid' })
  patientId!: string;

  @Column({ type: 'varchar' })
  type!: CarePlanItemType;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  // daily clock times this item recurs at, e.g. ["08:00","20:00"]
  @Column({ type: 'simple-array', nullable: true })
  scheduleTimes?: string[];

  // medication-specific
  @Column({ type: 'varchar', nullable: true })
  dosage?: string | null;

  @Column({ type: 'varchar', nullable: true })
  frequency?: string | null;

  // first post-op day this item starts, and how long it runs (null = ongoing)
  @Column({ type: 'int', default: 0 })
  startDay!: number;

  @Column({ type: 'int', nullable: true })
  durationDays?: number | null;

  @Column({ default: true })
  active!: boolean;
}
