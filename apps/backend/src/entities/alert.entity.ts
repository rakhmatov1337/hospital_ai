import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Patient } from './patient.entity';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Patient, { eager: true })
  @JoinColumn({ name: 'patientId' })
  patient!: Patient;
  @Column()
  patientId!: string;

  @Column({ type: 'varchar', default: 'RISK' })
  type!: string;

  @Column({ type: 'varchar', default: 'WARNING' })
  severity!: AlertSeverity;

  @Column({ type: 'text' })
  message!: string;

  @Column({ default: false })
  isRead!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
