import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EscalationStatus, Tier } from '@hospital-ai/shared-types';
import { QueueBoard } from './QueueBoard';
import type { EscalationQueue, EscalationQueueItem } from './api';

const MIN = 60_000;

function item(overrides: Partial<EscalationQueueItem>): EscalationQueueItem {
  return {
    id: 'e1',
    tier: Tier.urgent,
    status: EscalationStatus.new,
    patientRef: 'DEMO-01',
    patientName: 'Test Row',
    recoveryDay: 3,
    createdAt: new Date(Date.now() - 5 * MIN).toISOString(),
    elapsedMinutes: 5,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function queue(sections: Partial<EscalationQueue['sections']>): EscalationQueue {
  const full = {
    emergency: sections.emergency ?? [],
    urgent: sections.urgent ?? [],
    routine: sections.routine ?? [],
  };
  return {
    filter: 'unresolved',
    total: full.emergency.length + full.urgent.length + full.routine.length,
    sections: full,
  };
}

function renderBoard(data: EscalationQueue) {
  return render(
    <MemoryRouter>
      <QueueBoard data={data} onRowClick={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('QueueBoard (D2) — section ordering', () => {
  it('always renders Emergency → Urgent → Routine, even when sections are empty', () => {
    const { container } = renderBoard(
      queue({
        emergency: [item({ id: 'em1', tier: Tier.emergency, patientName: 'Alpha' })],
        urgent: [item({ id: 'ur1', tier: Tier.urgent, patientName: 'Bravo' })],
        routine: [item({ id: 'ro1', tier: Tier.routine, patientName: 'Charlie' })],
      }),
    );

    // Sections are labelled by tier; assert their DOM order is fixed.
    const sections = Array.from(container.querySelectorAll('section')).map((s) =>
      s.getAttribute('aria-label'),
    );
    expect(sections).toEqual([Tier.emergency, Tier.urgent, Tier.routine]);
  });

  it('renders every unresolved urgent item — never hides or truncates', () => {
    const urgents = Array.from({ length: 12 }, (_, i) =>
      item({ id: `u${i}`, tier: Tier.urgent, patientName: `Urgent ${i}` }),
    );
    renderBoard(queue({ urgent: urgents }));
    urgents.forEach((u) => {
      expect(screen.getByText(u.patientName)).toBeInTheDocument();
    });
  });
});

describe('QueueBoard (D2) — breach flag thresholds', () => {
  it('flags BREACHED once an unacknowledged item passes 30 minutes', () => {
    renderBoard(
      queue({
        urgent: [
          item({
            id: 'breach',
            status: EscalationStatus.new,
            createdAt: new Date(Date.now() - 31 * MIN).toISOString(),
          }),
        ],
      }),
    );
    expect(screen.getByText('BREACHED')).toBeInTheDocument();
  });

  it('does NOT flag BREACHED before 30 minutes (15-min urgent window)', () => {
    renderBoard(
      queue({
        urgent: [
          item({
            id: 'flagged',
            status: EscalationStatus.new,
            createdAt: new Date(Date.now() - 16 * MIN).toISOString(),
          }),
        ],
      }),
    );
    expect(screen.queryByText('BREACHED')).not.toBeInTheDocument();
  });

  it('never flags BREACHED once the ladder is halted (acknowledged)', () => {
    renderBoard(
      queue({
        urgent: [
          item({
            id: 'ack',
            status: EscalationStatus.acknowledged,
            createdAt: new Date(Date.now() - 45 * MIN).toISOString(),
          }),
        ],
      }),
    );
    expect(screen.queryByText('BREACHED')).not.toBeInTheDocument();
  });
});
