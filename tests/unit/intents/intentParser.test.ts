import { describe, expect, it } from 'vitest';
import { generateDefaultIntent, parseIntent } from '../../../src/core/intents/intentParser.js';

describe('intent parser', () => {
  it('parses bullets by section and both deadline separators', () => {
    expect(parseIntent('## Now\n- Ship\n## Next\n- Review\n## Deadlines\n- 2026-12-01 - Launch\n- 2027-01-01 — Audit\n## Someday\n- Explore')).toEqual({
      now: ['Ship'], next: ['Review'], deadlines: [{ date: '2026-12-01', goal: 'Launch' }, { date: '2027-01-01', goal: 'Audit' }], someday: ['Explore'],
    });
    expect(generateDefaultIntent()).toContain('## Deadlines');
  });
});
