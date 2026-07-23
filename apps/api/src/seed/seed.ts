/**
 * Tri-lingual seed + demo harness (SP1 Task 8).
 *
 * Produces a fully demoable database:
 *   - 1 clinic     — Sehat Clinic (DEMO), Asia/Tashkent, 09:00–18:00 Mon–Sat,
 *                    emergency 103, escalation ladder 5 / 15 / 30 min.
 *   - 3 staff      — on-duty nurse, clinical lead, clinic head.
 *   - 2 plan templates — laparoscopic_appendectomy, open_hernia_repair (30 days).
 *   - all content keys in EN/UZ/RU as PLACEHOLDER (is_placeholder=true,
 *     approved_by="PLACEHOLDER — NOT CLINICALLY APPROVED"), incl. the six exact
 *     safety strings and the seven check-in questions.
 *   - 6 demo patients DEMO-01..06 at recovery days 6/3/12/8/29/1 in the spec states.
 *
 * IDEMPOTENT: on every run the domain tables are truncated first (raw TRUNCATE …
 * CASCADE — this bypasses the append-only ORM guard, which only blocks
 * update/delete/upsert, so re-running the seed is always safe).
 *
 * Run: `pnpm --filter api build && pnpm --filter api seed`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, ContentStatus, StaffRole, Tier, Language } from '@prisma/client';
import { PLACEHOLDER_APPROVED_BY } from '@hospital-ai/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { TaskGenerationService } from '../plans/task-generation.service';
import { buildContentPack, SAFETY_KEYS, CHECKIN_QUESTION_KEYS } from './content-pack';
import { PLAN_TEMPLATES, buildPlanItemTemplates } from './plan-templates';
import { seedDemoPatients, DEMO_PATIENTS } from './demo-patients';

const CLINIC_TZ = 'Asia/Tashkent';
const DEMO_PASSWORD = 'demo1234';

/**
 * Minimal `.env` loader (the runtime Prisma client does not auto-load .env the
 * way the Prisma CLI does, and this script runs standalone via ts-node). Loads
 * apps/api/.env into process.env without overriding already-set vars. No external
 * dependency, so the seed has no hidden runtime requirement.
 */
function loadEnvFile(): void {
  // dist/seed/seed.js and src/seed/seed.ts both sit two levels below apps/api.
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Tables to wipe on each run (children first is unnecessary with CASCADE). */
const DOMAIN_TABLES = [
  'survey_response',
  'event',
  'content_translation',
  'content_item',
  'escalation_notification',
  'escalation',
  'escalation_rule',
  'check_in_answer',
  'check_in',
  'task',
  'plan_item',
  'recovery_plan',
  'consent',
  'patient',
  'staff',
  'clinic',
];

async function truncateAll(prisma: PrismaClient): Promise<void> {
  const list = DOMAIN_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

async function seedClinic(prisma: PrismaClient) {
  return prisma.clinic.create({
    data: {
      name: 'Sehat Clinic (DEMO)',
      phone: '+998711234567',
      emergencyNumber: '103',
      workingHours: '09:00-18:00',
      workingDays: 'Mon-Sat',
      timezone: CLINIC_TZ,
      onDutyContact: '+998901112233',
      backupContact: '+998901112244',
      headContact: '+998901112255',
      notifyMinutes: 5,
      ackMinutes: 15,
      breachMinutes: 30,
    },
  });
}

async function seedStaff(prisma: PrismaClient, clinicId: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const staff = [
    { name: 'Demo Nurse (On-Duty)', email: 'nurse@sehat.demo', role: StaffRole.staff },
    { name: 'Demo Clinical Lead', email: 'lead@sehat.demo', role: StaffRole.clinical_lead },
    { name: 'Demo Clinic Head', email: 'head@sehat.demo', role: StaffRole.clinical_lead },
  ];
  for (const s of staff) {
    await prisma.staff.create({
      data: { clinicId, name: s.name, email: s.email, passwordHash, role: s.role, active: true },
    });
  }
  return staff.length;
}

async function seedPlans(
  prisma: PrismaClient,
  clinicId: string,
): Promise<Record<string, string>> {
  const planByProcedure: Record<string, string> = {};
  for (const tpl of PLAN_TEMPLATES) {
    const plan = await prisma.recoveryPlan.create({
      data: {
        clinicId,
        procedureType: tpl.procedureType,
        name: tpl.name,
        durationDays: tpl.durationDays,
      },
    });
    planByProcedure[tpl.procedureType] = plan.id;

    const items = buildPlanItemTemplates(tpl.procedureType).map((it) => ({
      planId: plan.id,
      recoveryDay: it.recoveryDay,
      taskType: it.taskType,
      contentRef: it.contentRef,
      scheduledTime: it.scheduledTime,
      windowMinutes: it.windowMinutes,
    }));
    await prisma.planItem.createMany({ data: items });
  }
  return planByProcedure;
}

async function seedContent(prisma: PrismaClient, now: Date): Promise<number> {
  const pack = buildContentPack(PLAN_TEMPLATES.map((t) => t.procedureType));
  for (const item of pack) {
    const contentItem = await prisma.contentItem.create({
      data: {
        // Global (shared) content — clinic_id null.
        clinicId: null,
        category: item.category,
        contentKey: item.contentKey,
        status: ContentStatus.approved,
      },
    });
    const langs: Array<[Language, string]> = [
      [Language.EN, item.en],
      [Language.UZ, item.uz],
      [Language.RU, item.ru],
    ];
    for (const [language, text] of langs) {
      await prisma.contentTranslation.create({
        data: {
          contentItemId: contentItem.id,
          language,
          text,
          version: 1,
          // Every seeded row is PLACEHOLDER: an approved-status row that is NOT a
          // real clinician sign-off. The production gate therefore blocks
          // enrolment, and the resolver fails closed when placeholders are off.
          status: ContentStatus.approved,
          isPlaceholder: true,
          approvedBy: PLACEHOLDER_APPROVED_BY,
          approvedAt: now,
        },
      });
    }
  }
  return pack.length;
}

async function seedEscalationRules(prisma: PrismaClient, clinicId: string, now: Date) {
  const tiers: Array<{ tier: Tier; conditions: unknown }> = [
    { tier: Tier.emergency, conditions: { anyOf: ['q2:yes_high_fever', 'q4:heavy_bleeding'] } },
    { tier: Tier.urgent, conditions: { anyOf: ['q3:very_red', 'q1:>=7', 'q5:yes'] } },
    { tier: Tier.routine, conditions: { default: true } },
  ];
  for (const t of tiers) {
    await prisma.escalationRule.create({
      data: {
        clinicId,
        version: 'v1',
        tier: t.tier,
        conditions: t.conditions as object,
        // Placeholder sign-off — the deterministic tiering engine is SP2.
        approvedBy: PLACEHOLDER_APPROVED_BY,
        approvedAt: now,
        active: true,
      },
    });
  }
  return tiers.length;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Seed assertion failed: ${message}`);
  }
}

async function main(): Promise<void> {
  loadEnvFile();

  if (process.env.NODE_ENV === 'production') {
    throw new Error('The demo seed must never run in production (NODE_ENV=production).');
  }

  const prismaService = new PrismaService();
  const prisma = prismaService as unknown as PrismaClient;
  const taskGen = new TaskGenerationService(prismaService);
  const now = new Date();

  try {
    console.log('Seeding Hospital AI demo database…');
    await truncateAll(prisma);

    const clinic = await seedClinic(prisma);
    const staffCount = await seedStaff(prisma, clinic.id);
    const planByProcedure = await seedPlans(prisma, clinic.id);
    const contentKeyCount = await seedContent(prisma, now);
    const ruleCount = await seedEscalationRules(prisma, clinic.id, now);

    const demoResults = await seedDemoPatients({
      prisma,
      taskGen,
      clinicId: clinic.id,
      timezone: CLINIC_TZ,
      planByProcedure,
      now,
    });

    // ---- Assertions (the "seeding done when" checks) -------------------------
    const patientCount = await prisma.patient.count();
    const taskCount = await prisma.task.count();
    const escalationCount = await prisma.escalation.count();
    const translationCount = await prisma.contentTranslation.count();

    assert(patientCount === 6, `expected 6 patients, got ${patientCount}`);
    assert(
      Object.keys(planByProcedure).length === 2,
      `expected 2 plan templates, got ${Object.keys(planByProcedure).length}`,
    );
    assert(SAFETY_KEYS.length === 6, `expected 6 safety strings, got ${SAFETY_KEYS.length}`);
    assert(
      CHECKIN_QUESTION_KEYS.length === 7,
      `expected 7 check-in questions, got ${CHECKIN_QUESTION_KEYS.length}`,
    );
    assert(
      translationCount === contentKeyCount * 3,
      `expected ${contentKeyCount * 3} translations (EN/UZ/RU), got ${translationCount}`,
    );
    // Each demo patient gets the same 30-day cadence (107 tasks/patient).
    const expectedPerPatient = buildPlanItemTemplates('laparoscopic_appendectomy').length;
    for (const r of demoResults) {
      assert(
        r.tasksGenerated === expectedPerPatient,
        `${r.patientRef}: expected ${expectedPerPatient} tasks, got ${r.tasksGenerated}`,
      );
    }
    // Two escalation states were seeded (open-urgent + acknowledged/contacted).
    assert(escalationCount === 2, `expected 2 escalations, got ${escalationCount}`);

    // ---- Summary -------------------------------------------------------------
    console.log('\n=== Seed complete ===');
    console.log(`Clinic:              ${clinic.name} (${CLINIC_TZ})`);
    console.log(`Staff:               ${staffCount}`);
    console.log(`Plan templates:      ${Object.keys(planByProcedure).length}`);
    console.log(`Content keys:        ${contentKeyCount}  (× 3 langs = ${translationCount} translations, all placeholder)`);
    console.log(`  safety strings:    ${SAFETY_KEYS.length}`);
    console.log(`  check-in questions:${CHECKIN_QUESTION_KEYS.length}`);
    console.log(`Escalation rules:    ${ruleCount}`);
    console.log(`Patients:            ${patientCount}`);
    console.log(`Tasks (total):       ${taskCount}  (${expectedPerPatient}/patient)`);
    console.log(`Escalations:         ${escalationCount}`);
    console.log('\nDemo patients:');
    for (const r of demoResults) {
      const spec = DEMO_PATIENTS.find((d) => d.patientRef === r.patientRef);
      console.log(
        `  ${r.patientRef}  day ${String(spec?.recoveryDay).padStart(2)}  ${r.state.padEnd(17)}  ` +
          `tasks ${r.tasksGenerated} (done ${r.tasksCompleted}, missed ${r.tasksMissed})  esc ${r.escalations}`,
      );
    }
    console.log('\nAll seed assertions passed.');
  } finally {
    await prismaService.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
