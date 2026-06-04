import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { CarePlanItem } from './care-plan-item.entity';

@Entity('care_plans')
export class CarePlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientId' })
  patient!: Patient;
  @Column()
  patientId!: string;

  @Column({ default: false })
  generatedByAi!: boolean;

  @OneToMany(() => CarePlanItem, (item) => item.carePlan, { cascade: true })
  items!: CarePlanItem[];

  @CreateDateColumn()
  createdAt!: Date;
}
