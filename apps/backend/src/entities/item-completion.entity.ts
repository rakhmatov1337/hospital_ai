import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// One row per (care-plan item, date, scheduled time) the patient ticks off.
// Drives the daily checklist + medication adherence views.
@Entity('item_completions')
@Index(['itemId', 'date', 'scheduleTime'], { unique: true })
export class ItemCompletion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  itemId!: string;

  @Column({ type: 'uuid' })
  patientId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', default: '' })
  scheduleTime!: string;

  @Column({ default: true })
  completed!: boolean;

  @CreateDateColumn()
  completedAt!: Date;
}
