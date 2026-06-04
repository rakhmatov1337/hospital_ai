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

@Entity('check_ins')
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientId' })
  patient!: Patient;
  @Column()
  patientId!: string;

  @CreateDateColumn()
  date!: Date;

  @Column({ type: 'int' })
  painLevel!: number;

  @Column({ type: 'float', nullable: true })
  temperature?: number;

  @Column({ type: 'simple-array', nullable: true })
  symptoms?: string[];

  @Column({ nullable: true })
  mood?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', nullable: true })
  riskLevel?: RiskLevel;
}
