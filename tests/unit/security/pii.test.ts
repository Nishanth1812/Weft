import { describe, expect, it } from 'vitest';
import { PIIVault } from '../../../src/core/security/pii.js';

describe('PIIVault', () => {
  it('masks email addresses, US phones, and SSNs', () => {
    const vault = new PIIVault();
    expect(vault.mask('jane.doe+work@example.com (212) 555-0100 and 123-45-6789'))
      .toBe('[EMAIL_1] [PHONE_1] and [SSN_1]');
  });

  it('reuses stable placeholders for repeated values and assigns by first appearance', () => {
    const vault = new PIIVault();
    expect(vault.mask('a@example.com b@example.com a@example.com'))
      .toBe('[EMAIL_1] [EMAIL_2] [EMAIL_1]');
    expect(vault.mask('a@example.com')).toBe('[EMAIL_1]');
  });

  it('restores original values and leaves unknown placeholders untouched', () => {
    const vault = new PIIVault();
    const masked = vault.mask('Call 212-555-0100 or email a@example.com');
    expect(vault.restore(masked)).toBe('Call 212-555-0100 or email a@example.com');
    expect(vault.restore('[EMAIL_99]')).toBe('[EMAIL_99]');
  });

  it('isolates mappings between vault instances and clears mappings', () => {
    const first = new PIIVault();
    const second = new PIIVault();
    const masked = first.mask('a@example.com');
    expect(second.restore(masked)).toBe(masked);
    first.clear();
    expect(first.restore(masked)).toBe(masked);
    expect(first.mask('b@example.com')).toBe('[EMAIL_1]');
  });

  it('does not mask invalid contact data', () => {
    const vault = new PIIVault();
    expect(vault.mask('not email@, 123-45-67890, 555-12')).toBe('not email@, 123-45-67890, 555-12');
  });
});
