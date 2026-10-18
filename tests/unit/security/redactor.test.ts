import { describe, expect, it } from 'vitest';
import { redactSafe } from '../../../src/core/security/redactor.js';

describe('redactSafe', () => {
  it('redacts secrets and masks PII in one pass', () => {
    const value = `Contact person@example.com with password=secret123 or call (212) 555-0100`;
    const redacted = redactSafe(value);
    expect(redacted).not.toContain('person@example.com');
    expect(redacted).not.toContain('secret123');
    expect(redacted).not.toContain('212) 555-0100');
    expect(redacted).toContain('[REDACTED_SECRET:');
    expect(redacted).toContain('[EMAIL_1]');
    expect(redacted).toContain('[PHONE_1]');
  });
});
