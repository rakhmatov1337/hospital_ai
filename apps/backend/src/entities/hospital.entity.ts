import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type HospitalStatus = 'ACTIVE' | 'INACTIVE';

@Entity('hospitals')
export class Hospital {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', nullable: true })
  logoUrl?: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: HospitalStatus;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
