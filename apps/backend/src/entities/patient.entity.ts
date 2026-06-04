import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { SurgeryType } from './surgery-type.entity';

export type PatientStatus = 'PRE_OP' | 'RECOVERING' | 'RECOVERED' | 'AT_RISK';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user!: User;
  @Column()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'doctorId' })
  doctor!: User;
  @Column()
  doctorId!: string;

  @ManyToOne(() => SurgeryType, { eager: true })
  @JoinColumn({ name: 'surgeryTypeId' })
  surgeryType!: SurgeryType;
  @Column()
  surgeryTypeId!: string;

  @Column({ type: 'date' })
  surgeryDate!: string;

  @Column({ type: 'varchar', default: 'PRE_OP' })
  status!: PatientStatus;

  @Column({ unique: true })
  accessCode!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
