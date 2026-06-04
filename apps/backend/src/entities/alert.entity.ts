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
export type AlertStatus = 'UNREAD' | 'READ' | 'DISMISSED';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Patient, { eager: true })
  @JoinColumn({ name: 'patientId' })
  patient!: Patient;
  @Column()
  patientId!: string;

  @Column({ type: 'uuid' })
  doctorId!: string;

  @Column({ type: 'uuid' })
  hospitalId!: string;

  @Column({ type: 'varchar', default: 'RISK' })
  type!: string;

  @Column({ type: 'varchar', default: 'WARNING' })
  severity!: AlertSeverity;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', nullable: true })
  actionLabel?: string | null;

  @Column({ type: 'varchar', default: 'UNREAD' })
  status!: AlertStatus;

  @CreateDateColumn()
  createdAt!: Date;
}
