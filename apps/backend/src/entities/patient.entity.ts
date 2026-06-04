import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { SurgeryType } from './surgery-type.entity';

export type PatientStatus = 'PRE_OP' | 'RECOVERING' | 'RECOVERED' | 'AT_RISK';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // human-friendly id shown in the UI, e.g. PX-1000
  @Column({ type: 'varchar', unique: true })
  publicId!: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user!: User;
  @Column()
  userId!: string;

  @Column({ type: 'uuid' })
  hospitalId!: string;

  @Column({ type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => SurgeryType, { eager: true })
  @JoinColumn({ name: 'surgeryTypeId' })
  surgeryType!: SurgeryType;
  @Column()
  surgeryTypeId!: string;

  @Column({ type: 'date' })
  surgeryDate!: string;

  @Column({ type: 'varchar', default: 'RECOVERING' })
  status!: PatientStatus;

  @Column({ type: 'varchar', unique: true })
  accessCode!: string;

  @Column({ type: 'int', nullable: true })
  age?: number | null;

  // 0-100 rolling recovery score (drives analytics + status)
  @Column({ type: 'int', default: 60 })
  recoveryScore!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
