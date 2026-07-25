import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EscalationStatus,
  Language,
  PatientStatus,
  StaffRole,
  Tier,
  type ContentListItem,
  type PatientListItem,
  type StaffAccount,
  type UnapprovedCountResult,
} from '@hospital-ai/shared-types';
import { AppLayout } from '../../app/layout';
import type { EscalationQueue } from '../queue/api';

/**
 * DEV-ONLY harness (route `/dev/screens`). Renders the REAL authed screens inside the
 * app shell with a React Query cache pre-seeded from mock data and fetching disabled,
 * so the screens render fully without the API/DB. Not linked from the app; safe to delete.
 */
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

const MOCK_QUEUE: EscalationQueue = {
  filter: 'unresolved',
  total: 5,
  sections: {
    [Tier.emergency]: [
      {
        id: 'e1',
        tier: Tier.emergency,
        status: EscalationStatus.new,
        patientRef: 'PT-1043',
        patientName: 'Aziza Karimova',
        recoveryDay: 3,
        createdAt: iso(8),
        elapsedMinutes: 8,
        lastUpdated: iso(8),
      },
    ],
    [Tier.urgent]: [
      {
        id: 'u1',
        tier: Tier.urgent,
        status: EscalationStatus.acknowledged,
        patientRef: 'PT-0991',
        patientName: 'Bekzod Tolipov',
        recoveryDay: 7,
        createdAt: iso(42),
        elapsedMinutes: 42,
        lastUpdated: iso(20),
      },
      {
        id: 'u2',
        tier: Tier.urgent,
        status: EscalationStatus.new,
        patientRef: 'PT-1120',
        patientName: 'Dilnoza Rustamova',
        recoveryDay: 5,
        createdAt: iso(66),
        elapsedMinutes: 66,
        lastUpdated: iso(66),
      },
    ],
    [Tier.routine]: [
      {
        id: 'r1',
        tier: Tier.routine,
        status: EscalationStatus.contacted,
        patientRef: 'PT-0777',
        patientName: 'Jasur Ergashev',
        recoveryDay: 12,
        createdAt: iso(180),
        elapsedMinutes: 180,
        lastUpdated: iso(30),
      },
      {
        id: 'r2',
        tier: Tier.routine,
        status: EscalationStatus.new,
        patientRef: 'TEST-01',
        patientName: 'Test Patient [TEST]',
        recoveryDay: 2,
        createdAt: iso(240),
        elapsedMinutes: 240,
        lastUpdated: iso(240),
      },
    ],
  },
};

const MOCK_CLINIC = {
  id: 'c1',
  name: 'Sehat Family Clinic — Tashkent',
  phone: '+998 71 200 00 00',
  emergencyNumber: '103',
  workingHours: '08:00–18:00',
  workingDays: 'Mon–Sat',
  timezone: 'Asia/Tashkent',
  onDutyContact: null,
  backupContact: null,
  headContact: null,
  notifyMinutes: 15,
  ackMinutes: 30,
  breachMinutes: 60,
};

const MOCK_CONTENT: ContentListItem[] = [
  {
    id: 'ct1',
    clinicId: 'c1',
    category: 'medication',
    contentKey: 'discharge.pain_relief',
    status: 'needs_review',
    languagesPresent: [Language.EN, Language.RU],
    missingLanguages: [Language.UZ],
    needsApproval: true,
    lastApprovedBy: 'Dr. Karimov',
    lastApprovedAt: iso(60 * 24 * 3),
  },
  {
    id: 'ct2',
    clinicId: 'c1',
    category: 'wound-care',
    contentKey: 'wound.dressing_change',
    status: 'approved',
    languagesPresent: [Language.EN, Language.UZ, Language.RU],
    missingLanguages: [],
    needsApproval: false,
    lastApprovedBy: 'Dr. Karimov',
    lastApprovedAt: iso(60 * 24),
  },
  {
    id: 'ct3',
    clinicId: 'c1',
    category: 'activity',
    contentKey: 'activity.walking_day3',
    status: 'needs_review',
    languagesPresent: [Language.EN],
    missingLanguages: [Language.UZ, Language.RU],
    needsApproval: true,
    lastApprovedBy: null,
    lastApprovedAt: null,
  },
  {
    id: 'ct4',
    clinicId: 'c1',
    category: 'diet',
    contentKey: 'diet.post_op_nutrition',
    status: 'approved',
    languagesPresent: [Language.EN, Language.UZ, Language.RU],
    missingLanguages: [],
    needsApproval: false,
    lastApprovedBy: 'Dr. Sultonova',
    lastApprovedAt: iso(60 * 24 * 7),
  },
];

const MOCK_UNAPPROVED: UnapprovedCountResult = { unapprovedItems: 2, totalItems: 4 };

const MOCK_PATIENTS: PatientListItem[] = [
  {
    id: 'p1',
    patientRef: 'PT-1043',
    name: 'Aziza Karimova',
    status: PatientStatus.active,
    language: Language.UZ,
    procedureType: 'appendectomy',
    dischargeDate: iso(60 * 24 * 3),
    recoveryDay: 3,
    adherence: 0.8,
    adherenceNumerator: 4,
    adherenceDenominator: 5,
    lastActive: iso(120),
    openEscalations: 1,
    attentionFlag: false,
    createdAt: iso(60 * 24 * 3),
  },
  {
    id: 'p2',
    patientRef: 'PT-0991',
    name: 'Bekzod Tolipov',
    status: PatientStatus.active,
    language: Language.RU,
    procedureType: 'cholecystectomy',
    dischargeDate: iso(60 * 24 * 7),
    recoveryDay: 7,
    adherence: 0.4,
    adherenceNumerator: 2,
    adherenceDenominator: 5,
    lastActive: iso(60 * 24 * 4),
    openEscalations: 0,
    attentionFlag: true,
    createdAt: iso(60 * 24 * 7),
  },
  {
    id: 'p3',
    patientRef: 'PT-1120',
    name: 'Dilnoza Rustamova',
    status: PatientStatus.enrolled,
    language: Language.UZ,
    procedureType: 'hernia repair',
    dischargeDate: iso(60 * 24),
    recoveryDay: 1,
    adherence: null,
    adherenceNumerator: 0,
    adherenceDenominator: 0,
    lastActive: null,
    openEscalations: 0,
    attentionFlag: false,
    createdAt: iso(60 * 24),
  },
];

const MOCK_STAFF: StaffAccount[] = [
  {
    id: 's1',
    name: 'Demo Clinical Lead',
    email: 'lead@sehat.demo',
    role: StaffRole.clinical_lead,
    active: true,
    createdAt: iso(60 * 24 * 30),
  },
  {
    id: 's2',
    name: 'Demo Nurse (On-Duty)',
    email: 'nurse@sehat.demo',
    role: StaffRole.staff,
    active: true,
    createdAt: iso(60 * 24 * 20),
  },
  {
    id: 's3',
    name: 'Former Staff',
    email: 'old@sehat.demo',
    role: StaffRole.staff,
    active: false,
    createdAt: iso(60 * 24 * 90),
  },
];

function makeDevClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['escalations', 'unresolved'], MOCK_QUEUE);
  client.setQueryData(['escalations', 'all'], MOCK_QUEUE);
  client.setQueryData(['clinics', 'me'], MOCK_CLINIC);
  client.setQueryData(['content', 'list'], MOCK_CONTENT);
  client.setQueryData(['content', 'unapproved-count'], MOCK_UNAPPROVED);
  client.setQueryData(['patients', 'list'], MOCK_PATIENTS);
  client.setQueryData(['settings', 'clinic'], MOCK_CLINIC);
  client.setQueryData(['settings', 'staff'], MOCK_STAFF);
  return client;
}

export function ScreensPreview() {
  const [client] = useState(makeDevClient);
  return (
    <QueryClientProvider client={client}>
      <AppLayout />
    </QueryClientProvider>
  );
}
