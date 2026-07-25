-- CreateEnum
CREATE TYPE "AssistantRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "assistant_thread" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_message" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "role" "AssistantRole" NOT NULL,
    "content" TEXT NOT NULL,
    "content_refs" JSONB NOT NULL DEFAULT '[]',
    "guard_verdict" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_thread_clinic_id_idx" ON "assistant_thread"("clinic_id");

-- CreateIndex
CREATE INDEX "assistant_thread_patient_id_idx" ON "assistant_thread"("patient_id");

-- CreateIndex
CREATE INDEX "assistant_message_thread_id_idx" ON "assistant_message"("thread_id");

-- AddForeignKey
ALTER TABLE "assistant_thread" ADD CONSTRAINT "assistant_thread_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_thread" ADD CONSTRAINT "assistant_thread_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "assistant_thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
