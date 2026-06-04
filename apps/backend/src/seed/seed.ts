import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { User } from '../entities/user.entity';
import { Hospital } from '../entities/hospital.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { Patient } from '../entities/patient.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { ItemCompletion } from '../entities/item-completion.entity';
import { CheckIn } from '../entities/check-in.entity';
import { RiskAssessment } from '../entities/risk-assessment.entity';
import { Alert } from '../entities/alert.entity';
import { RecoveryPoint } from '../entities/recovery-point.entity';
import { KbDocument } from '../entities/kb-document.entity';
import { AiInteraction } from '../entities/ai-interaction.entity';
import { ScoreLog } from '../entities/score-log.entity';

function isLocal(url: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
}

const hash = (p: string) => bcrypt.hashSync(p, 10);
const dateNDaysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const url = env.databaseUrl();
  const ds = new DataSource({
    type: 'postgres',
    url,
    ssl: isLocal(url) ? false : { rejectUnauthorized: false },
    synchronize: true,
    entities: [
      User,
      Hospital,
      SurgeryType,
      Patient,
      CarePlan,
      CarePlanItem,
      ItemCompletion,
      CheckIn,
      RiskAssessment,
      Alert,
      RecoveryPoint,
      KbDocument,
      AiInteraction,
      ScoreLog,
    ],
  });
  await ds.initialize();

  const users = ds.getRepository(User);
  const hospitals = ds.getRepository(Hospital);
  const surgeryTypes = ds.getRepository(SurgeryType);
  const patients = ds.getRepository(Patient);
  const plans = ds.getRepository(CarePlan);
  const items = ds.getRepository(CarePlanItem);
  const checkIns = ds.getRepository(CheckIn);
  const alerts = ds.getRepository(Alert);
  const points = ds.getRepository(RecoveryPoint);

  const findUser = (email: string) => users.findOne({ where: { email } });

  // ---- Superadmin ----
  if (!(await findUser('super@hospital.ai'))) {
    await users.save(
      users.create({
        fullName: 'Platform Superadmin',
        email: 'super@hospital.ai',
        passwordHash: hash('super123'),
        role: 'SUPERADMIN',
      }),
    );
  }

  // ---- Hospital + admin ----
  let hospital = await hospitals.findOne({
    where: { name: 'Tashkent Central Hospital' },
  });
  if (!hospital) {
    hospital = await hospitals.save(
      hospitals.create({
        name: 'Tashkent Central Hospital',
        city: 'Tashkent',
        address: 'Amir Temur Ave 1',
        status: 'ACTIVE',
      }),
    );
  }
  if (!(await findUser('hospital@hospital.ai'))) {
    await users.save(
      users.create({
        fullName: 'Hospital Admin',
        email: 'hospital@hospital.ai',
        passwordHash: hash('hospital123'),
        role: 'HOSPITAL_ADMIN',
        hospitalId: hospital.id,
      }),
    );
  }

  // ---- Doctor ----
  let doctor = await findUser('demo@hospital.ai');
  if (!doctor) {
    doctor = await users.save(
      users.create({
        fullName: 'Dr. Amir Karimov',
        email: 'demo@hospital.ai',
        passwordHash: hash('demo123'),
        role: 'DOCTOR',
        title: 'Chief Surgeon',
        hospitalId: hospital.id,
      }),
    );
  }

  // ---- Surgery types ----
  const stData = [
    { name: 'Appendectomy', nameRu: 'Аппендэктомия', nameUz: 'Appendektomiya', category: 'general', avgRecoveryDays: 21, kbIndex: 'appendectomy_kb' },
    { name: 'Knee Replacement', nameRu: 'Эндопротезирование колена', nameUz: 'Tizza protezi', category: 'orthopedic', avgRecoveryDays: 90, kbIndex: null },
    { name: 'Hip Replacement', nameRu: 'Эндопротезирование бедра', nameUz: 'Son protezi', category: 'orthopedic', avgRecoveryDays: 90, kbIndex: null },
    { name: 'Rhinoplasty', nameRu: 'Ринопластика', nameUz: 'Rinoplastika', category: 'plastic', avgRecoveryDays: 30, kbIndex: null },
  ];
  const stByName: Record<string, SurgeryType> = {};
  for (const t of stData) {
    let st = await surgeryTypes.findOne({ where: { name: t.name } });
    if (!st) st = await surgeryTypes.save(surgeryTypes.create(t));
    stByName[t.name] = st;
  }

  // ---- Patients (matching the frontend screenshots) ----
  interface SeedPatient {
    publicId: string;
    fullName: string;
    email: string;
    phone: string;
    age: number;
    surgery: string;
    surgeryDate: string;
    status: Patient['status'];
    accessCode: string;
    recoveryScore: number;
    items: Partial<CarePlanItem>[];
  }

  const med = (title: string, dosage: string, times: string[], desc: string) => ({
    type: 'MEDICATION' as const,
    title,
    dosage,
    frequency: `${times.length}x daily`,
    scheduleTimes: times,
    description: desc,
    startDay: 0,
  });

  const seedPatients: SeedPatient[] = [
    {
      publicId: 'PX-1001',
      fullName: 'Bobur Toshmatov',
      email: 'bobur@mail.ru',
      phone: '+998901112233',
      age: 43,
      surgery: 'Appendectomy',
      surgeryDate: dateNDaysAgo(4),
      status: 'AT_RISK',
      accessCode: 'HOSP-1235',
      recoveryScore: 42,
      items: [
        med('Paracetamol 1g', '1g', ['08:00', '14:00', '20:00'], 'Take for pain relief as directed.'),
        med('Ibuprofen 400mg', '400mg', ['08:00', '20:00'], 'Anti-inflammatory — take with food.'),
        { type: 'EXERCISE', title: 'Short walks', description: 'Walk a little, often, to prevent blood clots.', frequency: 'several times daily', startDay: 0 },
        { type: 'DIET', title: 'Light diet, stay hydrated', description: 'Light food, fibre, and plenty of water.', startDay: 0 },
        { type: 'RESTRICTION', title: 'No heavy lifting', description: 'Avoid lifting heavy objects for ~2 weeks.', startDay: 0, durationDays: 14 },
      ],
    },
    {
      publicId: 'PX-1000',
      fullName: 'Nodira Yusupova',
      email: 'nodira@mail.ru',
      phone: '+998901111111',
      age: 30,
      surgery: 'Knee Replacement',
      surgeryDate: '2024-05-20',
      status: 'RECOVERING',
      accessCode: 'HOSP-1234',
      recoveryScore: 88,
      items: [
        med('Ibuprofen 400mg', '400mg', ['08:00', '20:00'], 'Take with food to reduce inflammation.'),
        { type: 'EXERCISE', title: 'Ankle pumps', description: '10 repetitions every hour while awake to prevent blood clots.', frequency: 'hourly', startDay: 0 },
        { type: 'DIET', title: 'High protein diet', description: 'Aim for 1.2g protein per kg body weight to support tissue healing.', startDay: 0 },
        { type: 'RESTRICTION', title: 'No weight bearing', description: 'Use crutches for all movement — no direct weight on the operated knee.', startDay: 0 },
      ],
    },
    {
      publicId: 'PX-1002',
      fullName: 'Zulfiya Rakhimova',
      email: 'zulfiya@mail.ru',
      phone: '+998901114455',
      age: 56,
      surgery: 'Rhinoplasty',
      surgeryDate: '2024-05-15',
      status: 'RECOVERING',
      accessCode: 'HOSP-1236',
      recoveryScore: 80,
      items: [
        med('Paracetamol 500mg', '500mg', ['09:00', '21:00'], 'For mild pain relief.'),
        { type: 'RESTRICTION', title: 'Avoid glasses', description: 'Do not rest glasses on the nose bridge while healing.', startDay: 0 },
      ],
    },
    {
      publicId: 'PX-1003',
      fullName: 'Sardor Nazarov',
      email: 'sardor@mail.ru',
      phone: '+998901116677',
      age: 69,
      surgery: 'Hip Replacement',
      surgeryDate: '2024-04-10',
      status: 'RECOVERED',
      accessCode: 'HOSP-1237',
      recoveryScore: 95,
      items: [
        { type: 'EXERCISE', title: 'Daily walking', description: 'Gentle daily walks to maintain mobility.', frequency: 'daily', startDay: 0 },
      ],
    },
  ];

  for (const sp of seedPatients) {
    if (await patients.findOne({ where: { accessCode: sp.accessCode } })) continue;
    const st = stByName[sp.surgery];
    const user = await users.save(
      users.create({
        fullName: sp.fullName,
        email: sp.email,
        phone: sp.phone,
        role: 'PATIENT',
        hospitalId: hospital.id,
      }),
    );
    const patient = await patients.save(
      patients.create({
        publicId: sp.publicId,
        userId: user.id,
        hospitalId: hospital.id,
        doctorId: doctor.id,
        surgeryTypeId: st.id,
        surgeryDate: sp.surgeryDate,
        status: sp.status,
        accessCode: sp.accessCode,
        age: sp.age,
        recoveryScore: sp.recoveryScore,
      }),
    );
    const plan = await plans.save(
      plans.create({
        patientId: patient.id,
        surgeryTypeId: st.id,
        source: 'AI',
        confidence: 0.9,
        aiReasoning: 'Seeded care plan based on standard recovery guidance.',
        modelUsed: 'seed',
        status: 'ACTIVE',
        approvedByDoctorId: doctor.id,
      }),
    );
    await items.save(
      sp.items.map((i) =>
        items.create({ ...i, carePlanId: plan.id, patientId: patient.id }),
      ),
    );

    // recovery score trend for the last 7 days (analytics chart)
    const trend = [55, 62, 48, 74, 68, 58, sp.recoveryScore];
    for (let d = 6; d >= 0; d--) {
      const date = dateNDaysAgo(d);
      if (await points.findOne({ where: { patientId: patient.id, date } }))
        continue;
      await points.save(
        points.create({
          patientId: patient.id,
          hospitalId: hospital.id,
          date,
          score: trend[6 - d],
        }),
      );
    }

    // Bobur: high-risk check-in + alerts (matches the screenshots)
    if (sp.publicId === 'PX-1001') {
      await checkIns.save(
        checkIns.create({
          patientId: patient.id,
          date: dateNDaysAgo(0),
          painLevel: 7,
          temperature: 38.5,
          symptoms: ['wound redness', 'chills'],
          mood: 'anxious',
          bpm: 112,
          spo2: 94,
          source: 'MANUAL',
          riskLevel: 'HIGH',
        }),
      );
      await alerts.save([
        alerts.create({
          patientId: patient.id,
          doctorId: doctor.id,
          hospitalId: hospital.id,
          type: 'RISK',
          severity: 'CRITICAL',
          title: 'Elevated Temperature Alert',
          message: `${sp.fullName} reported temperature 38.5°C — possible infection risk.`,
          actionLabel: 'Emergency Response',
          status: 'UNREAD',
        }),
        alerts.create({
          patientId: patient.id,
          doctorId: doctor.id,
          hospitalId: hospital.id,
          type: 'RISK',
          severity: 'WARNING',
          title: 'Pain Level Escalation',
          message: `${sp.fullName} pain level 7/10 for 2 consecutive days.`,
          actionLabel: 'View Labs',
          status: 'UNREAD',
        }),
      ]);
    }
  }

  console.log('Seed complete:');
  console.log('  Superadmin: super@hospital.ai / super123');
  console.log('  Hospital admin: hospital@hospital.ai / hospital123');
  console.log('  Doctor: demo@hospital.ai / demo123');
  console.log('  Patients: HOSP-1234 (Nodira), HOSP-1235 (Bobur/appendectomy),');
  console.log('            HOSP-1236 (Zulfiya), HOSP-1237 (Sardor)');
  await ds.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
