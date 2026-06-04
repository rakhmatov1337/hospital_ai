import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type KbDocumentStatus = 'PENDING' | 'INGESTING' | 'INGESTED' | 'FAILED';

// AI training document uploaded by a superadmin and ingested into a
// surgery-specific pgvector index for RAG grounding.
@Entity('kb_documents')
export class KbDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  surgeryTypeId!: string;

  @Column({ type: 'varchar' })
  indexName!: string;

  @Column()
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  source?: string | null;

  @Column({ type: 'varchar', nullable: true })
  license?: string | null;

  @Column({ type: 'varchar', nullable: true })
  fileName?: string | null;

  @Column({ type: 'uuid' })
  uploadedByUserId!: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status!: KbDocumentStatus;

  @Column({ type: 'int', default: 0 })
  chunkCount!: number;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
