import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('surgery_types')
export class SurgeryType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  nameRu?: string;

  @Column({ nullable: true })
  nameUz?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ type: 'int', default: 42 })
  avgRecoveryDays!: number;
}
