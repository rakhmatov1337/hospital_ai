import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MetricsReport } from './api';
import { denomText, formatPct, formatScore } from './format';
import { metricsToCsv } from './csv';

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const denom = (numerator: number, denominator: number) => ({
  value: denominator === 0 ? null : numerator / denominator,
  numerator,
  denominator,
});

const FIXTURE: MetricsReport = {
  clinicId: 'c1',
  generatedAt: '2026-07-24T10:00:00.000Z',
  adherence: {
    overall: denom(4, 5),
    byRecoveryDay: { 1: denom(2, 2), 3: denom(1, 2) },
    byTaskType: { medication: denom(4, 5) },
  },
  retention: { day7: denom(3, 4), day14: denom(2, 3), day30: denom(1, 2) },
  checkInCompletion: denom(4, 5),
  escalations: {
    countByTier: { emergency: 1, urgent: 2, routine: 3 },
    total: 6,
    timeToAcknowledge: { medianMs: 250_000, denominator: 4 },
    timeToContact: { medianMs: 600_000, denominator: 3 },
    breachCount: 1,
  },
  language: {
    patientsByLanguage: { uz: 3, ru: 2 },
    patientPopulation: 5,
    adherenceByLanguage: { uz: denom(2, 3), ru: denom(2, 2) },
  },
  satisfaction: {
    q1Helpful: denom(21, 5),
    q2Easy: denom(20, 5),
    q3AdherenceSupport: denom(19, 5),
    q4Recommend: denom(22, 5),
    responseCount: 5,
  },
  engagement: { avgAppOpensPerPatientPerWeek: denom(17, 5) },
  readmissions: { count: 0, patientPopulation: 5, neverARate: true },
};

// Mock the data hook so the page renders the fixture without a live backend.
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    useMetrics: () => ({
      data: FIXTURE,
      isLoading: false,
      isError: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
    }),
  };
});

describe('metrics format helpers', () => {
  it('renders a percentage and ALWAYS carries its denominator', () => {
    expect(formatPct(denom(4, 5))).toBe('80%');
    expect(denomText(denom(4, 5), 'tasks on time')).toBe('4 of 5 tasks on time');
  });

  it('shows an em-dash (never a bare percentage) when the denominator is 0', () => {
    expect(formatPct(denom(0, 0))).toBe('—');
    expect(denomText(denom(0, 0), 'tasks')).toBe('0 of 0 tasks');
  });

  it('formats satisfaction as a 1–5 score, not a percentage', () => {
    expect(formatScore(denom(21, 5))).toBe('4.2');
  });
});

describe('metrics CSV export', () => {
  it('is anonymised and never emits a readmission rate', () => {
    const csv = metricsToCsv(FIXTURE);
    expect(csv.toLowerCase()).not.toContain('readmission');
    // Ratio rows keep their numerator + denominator columns.
    expect(csv).toContain('numerator,denominator');
    expect(csv).toContain('Overall on-time,80%,4,5');
  });
});

describe('MetricsPage (D6)', () => {
  it('shows headline percentages with denominators and no readmission/outcome claim', async () => {
    const { MetricsPage } = await import('./page');
    const { container } = render(
      <MemoryRouter>
        <MetricsPage />
      </MemoryRouter>,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('80%'); // adherence headline
    expect(text).toContain('4 of 5'); // its denominator, always shown
    expect(text.toLowerCase()).not.toContain('readmission');
  });
});
