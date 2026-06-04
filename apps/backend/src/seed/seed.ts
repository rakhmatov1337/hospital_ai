import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { User } from '../entities/user.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { Patient } from '../entities/patient.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { CheckIn } from '../entities/check-in.entity';
import { Alert } from '../entities/alert.entity';

function isLocal(url: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
}

async function main() {
  const url = env.databaseUrl();
  const ds = new DataSource({
    type: 'postgres',
    url,
    ssl: isLocal(url) ? false : { rejectUnauthorized: false },
    synchronize: true,
    entities: [User, SurgeryType, Patient, CarePlan, CarePlanItem, CheckIn, Alert],
  });
  await ds.initialize();

  const types = [
    { name: 'Cesarean section', nameRu: 'Кесарево сечение', nameUz: 'Kesar kesish', category: 'obstetric', avgRecoveryDays: 42 },
    { name: 'Appendectomy', nameRu: 'Аппендэктомия', nameUz: 'Appendektomiya', category: 'general', avgRecoveryDays: 21 },
    { name: 'Cholecystectomy', nameRu: 'Холецистэктомия', nameUz: 'Xolesistektomiya', category: 'general', avgRecoveryDays: 21 },
    { name: 'Total Knee Replacement', nameRu: 'Эндопротезирование колена', nameUz: 'Tizza protezi', category: 'orthopedic', avgRecoveryDays: 90 },
  ];
  const stRepo = ds.getRepository(SurgeryType);
  for (const t of types) {
    if (!(await stRepo.findOne({ where: { name: t.name } }))) {
      await stRepo.save(stRepo.create(t));
    }
  }

  const userRepo = ds.getRepository(User);
  let doctor = await userRepo.findOne({ where: { email: 'demo@hospital.ai' } });
  if (!doctor) {
    doctor = await userRepo.save(
      userRepo.create({
        fullName: 'Dr. Demo',
        email: 'demo@hospital.ai',
        passwordHash: bcrypt.hashSync('demo123', 10),
        role: 'DOCTOR',
      }),
    );
  }

  console.log(
    `Seeded ${types.length} surgery types + doctor demo@hospital.ai / demo123`,
  );
  await ds.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
