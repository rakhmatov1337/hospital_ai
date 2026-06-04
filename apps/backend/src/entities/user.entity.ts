import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type UserRole = 'DOCTOR' | 'PATIENT' | 'ADMIN';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  fullName!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column({ nullable: true })
  passwordHash?: string;

  @Column({ type: 'varchar', default: 'PATIENT' })
  role!: UserRole;

  @CreateDateColumn()
  createdAt!: Date;
}
