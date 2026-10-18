import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeWorkingTreeFingerprint, hashBytes, hashString, orderedFingerprint } from '../../../src/core/fingerprint/hasher.js';

describe('hasher', () => {
  it('matches SHA-256 for bytes and strings', () => {
    const expected = createHash('sha256').update('weft').digest('hex');
    expect(hashBytes(Buffer.from('weft'))).toBe(expected);
    expect(hashString('weft')).toBe(expected);
  });

  it('is stable for the same ordered parts and changes when their order changes', () => {
    expect(orderedFingerprint(['a', 1, true, null])).toBe(orderedFingerprint(['a', 1, true, null]));
    expect(orderedFingerprint(['a', 1])).not.toBe(orderedFingerprint([1, 'a']));
    expect(orderedFingerprint([1])).not.toBe(orderedFingerprint(['1']));
  });

  it('fingerprints sorted staged and unstaged status with head and branch', () => {
    const first = { staged: ['b', 'a'], unstaged: ['z'], untracked: [], branch: 'main', clean: false };
    const sorted = { ...first, staged: ['a', 'b'] };
    expect(computeWorkingTreeFingerprint(first, 'sha', 'main')).toBe(computeWorkingTreeFingerprint(sorted, 'sha', 'main'));
    expect(computeWorkingTreeFingerprint(first, 'other', 'main')).not.toBe(computeWorkingTreeFingerprint(first, 'sha', 'main'));
    expect(computeWorkingTreeFingerprint({ ...first, untracked: ['new.ts'] }, 'sha', 'main'))
      .not.toBe(computeWorkingTreeFingerprint(first, 'sha', 'main'));
  });
});
