import { templateCarePlan } from './care-plan.templates';

describe('templateCarePlan', () => {
  it('returns valid cesarean items spanning the recovery period', () => {
    const items = templateCarePlan('cesarean', new Date('2026-06-01'));
    expect(items.length).toBeGreaterThan(3);
    expect(
      items.every((i) =>
        ['MEDICATION', 'DIET', 'ACTIVITY', 'CHECKUP', 'RESTRICTION'].includes(
          i.type,
        ),
      ),
    ).toBe(true);
    // covers beyond the first two weeks (e.g. ~6-week postnatal check)
    expect(items.some((i) => i.dayOffset >= 14)).toBe(true);
  });
});
