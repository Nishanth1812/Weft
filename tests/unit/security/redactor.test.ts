import { describe, expect, it } from 'vitest';
import { redactDeep, redactSafe } from '../../../src/core/security/redactor.js';

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

describe('redactDeep', () => {
  it('keeps serialized JSON valid when a secret touches a quote', () => {
    const json = JSON.stringify(redactDeep({ path: 'src/ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij', note: 'password: "hunter2"', list: ['token=abc123'] }));
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).not.toContain('hunter2');
    expect(json).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
  });
});

describe('redaction idempotence', () => {
  it('leaves already redacted text unchanged', () => {
    const once = redactSafe('src/ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij.ts password=hunter2');
    expect(redactSafe(once)).toBe(once);
  });
});
