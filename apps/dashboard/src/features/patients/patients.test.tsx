import { describe, expect, it } from 'vitest';
import { PatientStatus, Language, type PatientListItem } from '@hospital-ai/shared-types';
import { filterPatients } from './filter';

function patient(overrides: Partial<PatientListItem>): PatientListItem {
  return {
    id: 'p1',
    patientRef: 'REF-1',
    name: 'Test Patient',
    status: PatientStatus.active,
    language: Language.EN,
    procedureType: 'knee_replacement',
    dischargeDate: '2026-07-01T00:00:00.000Z',
    recoveryDay: 5,
    adherence: 0.8,
    adherenceNumerator: 4,
    adherenceDenominator: 5,
    lastActive: '2026-07-22T00:00:00.000Z',
    openEscalations: 0,
    attentionFlag: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterPatients (D4)', () => {
  const roster: PatientListItem[] = [
    patient({ id: 'a', status: PatientStatus.enrolled }),
    patient({ id: 'b', status: PatientStatus.active }),
    patient({ id: 'c', status: PatientStatus.completed }),
    patient({ id: 'd', status: PatientStatus.withdrawn }),
  ];

  it('All shows every patient (never hides a status)', () => {
    expect(filterPatients(roster, 'all')).toHaveLength(4);
  });

  it('Active includes both enrolled and active patients', () => {
    const ids = filterPatients(roster, 'active').map((p) => p.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('Completed shows only completed', () => {
    expect(filterPatients(roster, 'completed').map((p) => p.id)).toEqual(['c']);
  });

  it('Withdrawn shows only withdrawn', () => {
    expect(filterPatients(roster, 'withdrawn').map((p) => p.id)).toEqual(['d']);
  });
});

describe('attention flag (D4)', () => {
  it('is carried through server-side, unchanged by the filter', () => {
    const flagged = patient({ id: 'x', attentionFlag: true, adherence: 0.3 });
    const [only] = filterPatients([flagged], 'all');
    expect(only.attentionFlag).toBe(true);
  });
});
