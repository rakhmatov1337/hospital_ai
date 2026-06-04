import { assessRisk, ruleRisk, RiskAgent } from './risk.service';

describe('ruleRisk (fallback)', () => {
  it('flags fever as HIGH risk with a doctor alert', () => {
    const r = ruleRisk({ painLevel: 4, temperature: 38.6, symptoms: [] });
    expect(r.riskLevel).toBe('HIGH');
    expect(r.alertDoctor).toBe(true);
  });

  it('treats mild check-in as LOW', () => {
    const r = ruleRisk({ painLevel: 2, temperature: 36.8, symptoms: ['tired'] });
    expect(r.riskLevel).toBe('LOW');
    expect(r.alertDoctor).toBe(false);
  });
});

describe('assessRisk', () => {
  it('falls back to rules when the agent throws', async () => {
    const agent: RiskAgent = {
      generate: jest.fn().mockRejectedValue(new Error('down')),
    };
    const r = await assessRisk(agent, {
      painLevel: 9,
      temperature: 39,
      symptoms: ['heavy bleeding'],
    });
    expect(r.generatedByAi).toBe(false);
    expect(r.riskLevel).toBe('HIGH');
    expect(r.alertDoctor).toBe(true);
  });

  it('uses AI output and only alerts on HIGH', async () => {
    const agent: RiskAgent = {
      generate: jest.fn().mockResolvedValue({
        object: {
          riskLevel: 'LOW',
          advice: 'All good.',
          alertDoctor: true, // should be overridden to false (not HIGH)
          confidence: 0.9,
        },
      }),
    };
    const r = await assessRisk(agent, { painLevel: 2 });
    expect(r.generatedByAi).toBe(true);
    expect(r.alertDoctor).toBe(false);
    expect(r.confidence).toBe(0.9);
  });
});
