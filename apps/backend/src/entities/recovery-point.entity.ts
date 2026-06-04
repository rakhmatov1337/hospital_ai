import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Daily recovery score per patient — powers the recovery-analytics chart.
@Entity('recovery_points')
@Index(['patientId', 'date'], { unique: true })
export class RecoveryPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  patientId!: string;

  @Column({ type: 'uuid' })
  hospitalId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'int' })
  score!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
