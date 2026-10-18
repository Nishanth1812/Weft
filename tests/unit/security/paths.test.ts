import { describe, expect, it } from 'vitest';
import { isSensitivePath, shouldExcludePath } from '../../../src/core/security/paths.js';

describe('sensitive paths', () => {
  it.each([
    '.env', '.env.local', 'config/.env.production', 'secrets.env',
    'id_rsa', 'id_ed25519.pub', 'a/key.pem', 'a/key.key', 'x.pkcs12', 'x.pfx',
    '.ssh/id_rsa', '.AWS/credentials', '.gnupg/private-keys-v1.d', '.docker/config.json', '.kube/config',
    'terraform.tfstate', 'terraform.tfstate.backup', 'credentials.json', 'service-account-prod.json',
    '.git/config', '.hg/store', '.svn/entries',
  ])('excludes %s', (path) => {
    expect(isSensitivePath(path)).toBe(true);
    expect(shouldExcludePath(path)).toBe(true);
  });

  it('normalizes separators and relative path segments on Windows and POSIX', () => {
    for (const path of ['.git/config', '.\\.git\\config', 'src/../.git/config', 'src\\..\\.git\\config']) {
      expect(isSensitivePath(path)).toBe(true);
    }
    expect(isSensitivePath('./src/main.ts')).toBe(false);
  });

  it('matches case-insensitively without excluding similarly named safe files', () => {
    expect(isSensitivePath('SRC/.ENV.LOCAL')).toBe(true);
    expect(isSensitivePath('src/env.ts')).toBe(false);
    expect(isSensitivePath('src/monkey.pem.ts')).toBe(false);
    expect(shouldExcludePath('src/main.ts')).toBe(false);
  });
});
