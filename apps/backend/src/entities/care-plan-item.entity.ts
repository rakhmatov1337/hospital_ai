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
  | 'DIET'
  | 'ACTIVITY'
  | 'CHECKUP'
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

  @Column({ type: 'varchar' })
  type!: CarePlanItemType;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ nullable: true })
  scheduleTime?: string;

  @Column({ type: 'int' })
  dayOffset!: number;

  @Column({ default: false })
  isCompleted!: boolean;
}
