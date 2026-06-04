import { generateCarePlan, CarePlanAgent } from './care-plan.service';

describe('generateCarePlan', () => {
  it('falls back to templates when the agent throws (all providers down)', async () => {
    const agent: CarePlanAgent = {
      generate: jest.fn().mockRejectedValue(new Error('all providers down')),
    };
    const res = await generateCarePlan(agent, 'cesarean', new Date('2026-06-01'));
    expect(res.generatedByAi).toBe(false);
    expect(res.items.length).toBeGreaterThan(3);
  });

  it('uses the AI plan when the agent returns valid structured output', async () => {
    const agent: CarePlanAgent = {
      generate: jest.fn().mockResolvedValue({
        object: {
          items: [
            {
              type: 'ACTIVITY',
              title: 'Walk',
              description: 'Short daily walks.',
              dayOffset: 1,
              scheduleTime: null,
            },
          ],
        },
      }),
    };
    const res = await generateCarePlan(agent, 'cesarean', new Date('2026-06-01'));
    expect(res.generatedByAi).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].title).toBe('Walk');
  });
});
