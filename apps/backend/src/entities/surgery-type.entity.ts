import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('surgery_types')
export class SurgeryType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  nameRu?: string | null;

  @Column({ type: 'varchar', nullable: true })
  nameUz?: string | null;

  @Column({ type: 'varchar', nullable: true })
  category?: string | null;

  @Column({ type: 'int', default: 42 })
  avgRecoveryDays!: number;

  // pgvector index name backing this surgery's RAG knowledge base.
  // Only Appendectomy is wired to a real KB for the hackathon.
  @Column({ type: 'varchar', nullable: true })
  kbIndex?: string | null;
}
