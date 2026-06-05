import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ComplaintCategory =
  | 'DOCTOR' // Shifokor
  | 'NURSE' // Hamshira
  | 'SERVICE' // Xizmat
  | 'FACILITY' // Muassasa
  | 'MEDICATION' // Dori
  | 'OTHER'; // Boshqa

export type ComplaintUrgency = 'LOW' | 'MEDIUM' | 'HIGH'; // Past / O'rta / Yuqori
export type ComplaintStatus = 'NEW' | 'REVIEWED' | 'RESOLVED';

/**
 * Anonymous patient complaint ("Anonim shikoyat"). patientId is stored only for
 * internal routing/abuse-prevention and is NEVER exposed to staff — complaints
 * are surfaced to the hospital admin without patient identity.
 */
@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  hospitalId!: string;

  // internal only — not returned in admin/staff responses
  @Column({ type: 'uuid', nullable: true })
  patientId?: string | null;

  @Column({ type: 'varchar' })
  category!: ComplaintCategory;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', default: 'LOW' })
  urgency!: ComplaintUrgency;

  @Column({ type: 'varchar', default: 'NEW' })
  status!: ComplaintStatus;

  @CreateDateColumn()
  createdAt!: Date;
}
