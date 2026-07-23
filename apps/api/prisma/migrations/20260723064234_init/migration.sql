-- CreateEnum
CREATE TYPE "Language" AS ENUM ('UZ', 'RU', 'EN');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('staff', 'clinical_lead');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('enrolled', 'active', 'completed', 'withdrawn');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('medication', 'activity', 'wound_care', 'education', 'checkin');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('emergency', 'urgent', 'routine');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('new', 'acknowledged', 'contacted', 'breached');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'approved');

-- CreateTable
CREATE TABLE "clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "emergency_number" TEXT NOT NULL,
    "working_hours" TEXT NOT NULL,
    "working_days" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "on_duty_contact" TEXT,
    "backup_contact" TEXT,
    "head_contact" TEXT,
    "notify_minutes" INTEGER NOT NULL,
    "ack_minutes" INTEGER NOT NULL,
    "breach_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'staff',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "age_band" TEXT NOT NULL,
    "procedure_type" TEXT NOT NULL,
    "discharge_date" TIMESTAMP(3) NOT NULL,
    "language" "Language" NOT NULL,
    "plan_id" TEXT,
    "status" "PatientStatus" NOT NULL DEFAULT 'enrolled',
    "enrolment_code" TEXT NOT NULL,
    "code_expires_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "consented_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "text_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_plan" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "procedure_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_item" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "recovery_day" INTEGER NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "content_ref" TEXT NOT NULL,
    "scheduled_time" TEXT NOT NULL,
    "window_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "plan_item_id" TEXT,
    "task_type" "TaskType" NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "window_closes_at" TIMESTAMP(3) NOT NULL,
    "recovery_day" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMP(3),
    "on_time" BOOLEAN,
    "completion_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "recovery_day" INTEGER NOT NULL,
    "question_set_version" TEXT NOT NULL,
    "rule_version" TEXT NOT NULL,
    "tier_assigned" "Tier",
    "within_clinic_hours" BOOLEAN NOT NULL,
    "submission_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_answer" (
    "id" TEXT NOT NULL,
    "checkin_id" TEXT NOT NULL,
    "question_ref" TEXT NOT NULL,
    "answer_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_rule" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "conditions" JSONB NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation" (
    "id" TEXT NOT NULL,
    "checkin_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'new',
    "outcome_code" TEXT,
    "clinical_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_notification" (
    "id" TEXT NOT NULL,
    "escalation_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient_role" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_item" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT,
    "category" TEXT NOT NULL,
    "content_key" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_translation" (
    "id" TEXT NOT NULL,
    "content_item_id" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "is_placeholder" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_ref" TEXT,
    "event_name" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "local_offset" TEXT NOT NULL,
    "recovery_day" INTEGER,
    "schema_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_response" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "q1_helpful" INTEGER,
    "q2_easy" INTEGER,
    "q3_adherence_support" INTEGER,
    "q4_recommend" INTEGER,
    "free_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_clinic_id_idx" ON "staff"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_enrolment_code_key" ON "patient"("enrolment_code");

-- CreateIndex
CREATE INDEX "patient_clinic_id_idx" ON "patient"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_clinic_id_patient_ref_key" ON "patient"("clinic_id", "patient_ref");

-- CreateIndex
CREATE INDEX "consent_patient_id_idx" ON "consent"("patient_id");

-- CreateIndex
CREATE INDEX "recovery_plan_clinic_id_idx" ON "recovery_plan"("clinic_id");

-- CreateIndex
CREATE INDEX "plan_item_plan_id_idx" ON "plan_item"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_completion_key_key" ON "task"("completion_key");

-- CreateIndex
CREATE INDEX "task_patient_id_idx" ON "task"("patient_id");

-- CreateIndex
CREATE INDEX "task_status_idx" ON "task"("status");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_submission_key_key" ON "check_in"("submission_key");

-- CreateIndex
CREATE INDEX "check_in_patient_id_idx" ON "check_in"("patient_id");

-- CreateIndex
CREATE INDEX "check_in_answer_checkin_id_idx" ON "check_in_answer"("checkin_id");

-- CreateIndex
CREATE INDEX "escalation_rule_clinic_id_idx" ON "escalation_rule"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_checkin_id_key" ON "escalation"("checkin_id");

-- CreateIndex
CREATE INDEX "escalation_patient_id_idx" ON "escalation"("patient_id");

-- CreateIndex
CREATE INDEX "escalation_status_idx" ON "escalation"("status");

-- CreateIndex
CREATE INDEX "escalation_notification_escalation_id_idx" ON "escalation_notification"("escalation_id");

-- CreateIndex
CREATE INDEX "content_item_content_key_idx" ON "content_item"("content_key");

-- CreateIndex
CREATE UNIQUE INDEX "content_item_clinic_id_content_key_key" ON "content_item"("clinic_id", "content_key");

-- CreateIndex
CREATE INDEX "content_translation_content_item_id_language_idx" ON "content_translation"("content_item_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "content_translation_content_item_id_language_version_key" ON "content_translation"("content_item_id", "language", "version");

-- CreateIndex
CREATE INDEX "event_clinic_id_idx" ON "event"("clinic_id");

-- CreateIndex
CREATE INDEX "event_event_name_idx" ON "event"("event_name");

-- CreateIndex
CREATE INDEX "survey_response_patient_id_idx" ON "survey_response"("patient_id");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "recovery_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_plan" ADD CONSTRAINT "recovery_plan_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_item" ADD CONSTRAINT "plan_item_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "recovery_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "plan_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_answer" ADD CONSTRAINT "check_in_answer_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "check_in"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_rule" ADD CONSTRAINT "escalation_rule_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation" ADD CONSTRAINT "escalation_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "check_in"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation" ADD CONSTRAINT "escalation_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_notification" ADD CONSTRAINT "escalation_notification_escalation_id_fkey" FOREIGN KEY ("escalation_id") REFERENCES "escalation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_response" ADD CONSTRAINT "survey_response_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
