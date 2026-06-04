import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'SUPERADMIN' | 'HOSPITAL_ADMIN' | 'DOCTOR' | 'PATIENT';
export const USER_ROLES: UserRole[] = [
  'SUPERADMIN',
  'HOSPITAL_ADMIN',
  'DOCTOR',
  'PATIENT',
];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  fullName!: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  email?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  passwordHash?: string | null;

  @Column({ type: 'varchar' })
  role!: UserRole;

  @Column({ type: 'varchar', default: 'EN' })
  locale!: string;

  // null for SUPERADMIN; set for HOSPITAL_ADMIN / DOCTOR / PATIENT
  @Column({ type: 'uuid', nullable: true })
  hospitalId?: string | null;

  // e.g. "Chief Oncologist" for doctors
  @Column({ type: 'varchar', nullable: true })
  title?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
