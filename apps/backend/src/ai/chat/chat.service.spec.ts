import { nurseChat, ChatAgent } from './chat.service';

describe('nurseChat', () => {
  it('returns a safe fallback reply when the agent throws', async () => {
    const agent: ChatAgent = {
      generate: jest.fn().mockRejectedValue(new Error('all providers down')),
    };
    const res = await nurseChat(agent, [{ role: 'user', content: 'hi' }]);
    expect(res.fallback).toBe(true);
    expect(res.reply.toLowerCase()).toContain('doctor');
  });

  it('passes memory keys and prepends context when provided', async () => {
    const generate = jest.fn().mockResolvedValue({ text: 'Take gentle walks.' });
    const agent: ChatAgent = { generate };
    const res = await nurseChat(
      agent,
      [{ role: 'user', content: 'can I walk?' }],
      { patientId: 'p1', threadId: 't1', surgeryType: 'cesarean', recoveryDay: 4 },
    );
    expect(res.fallback).toBe(false);
    expect(res.reply).toBe('Take gentle walks.');
    const [messages, opts] = generate.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('day 4');
    expect(opts).toEqual({ memory: { resource: 'p1', thread: 't1' } });
  });
});
