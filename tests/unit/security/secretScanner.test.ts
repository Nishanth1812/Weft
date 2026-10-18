import { describe, expect, it } from 'vitest';
import { containsSecret, redactSecrets, scanText } from '../../../src/core/security/secretScanner.js';

describe('secret scanner', () => {
  it.each([
    ['PEM private key', '-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END RSA PRIVATE KEY-----'],
    ['EC private key', '-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----'],
    ['DSA private key', '-----BEGIN DSA PRIVATE KEY-----\nabc\n-----END DSA PRIVATE KEY-----'],
    ['OpenSSH private key', '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----'],
    ['AWS access key', 'AKIAIOSFODNN7EXAMPLE'],
    ['AWS secret key', 'aws_secret_access_key = ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd'],
    ['GitHub classic token', `ghp_${'a'.repeat(36)}`],
    ['GitHub fine-grained token', `github_pat_${'a'.repeat(82)}`],
    ['GitLab token', `glpat-${'a'.repeat(20)}`],
    ['Slack bot token', `xoxb-${'1'.repeat(11)}`],
    ['Slack user token', `xoxp-${'1'.repeat(11)}`],
    ['Stripe secret key', `sk_live_${'a'.repeat(24)}`],
    ['Stripe restricted key', `rk_live_${'a'.repeat(24)}`],
    ['GCP service account', '{"type": "service_account"}'],
    ['GCP private key id', `{"private_key_id": "${'a'.repeat(40)}"}`],
    ['GCP private key', '{"private_key": "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----"}'],
    ['JWT', `eyJ${'a'.repeat(10)}.eyJ${'b'.repeat(10)}.${'c'.repeat(10)}`],
    ['Postgres credentials', 'postgres://user:password@db.example.com/name'],
    ['MySQL credentials', 'mysql://user:password@db.example.com/name'],
    ['MongoDB credentials', 'mongodb+srv://user:password@db.example.com/name'],
    ['Redis credentials', 'redis://user:password@cache.example.com/0'],
    ['Bearer header', 'Authorization: Bearer abc.def_ghi-123'],
    ['Google API key', `AIza${'a'.repeat(35)}`],
    ['GitHub user token', `ghu_${'a'.repeat(36)}`],
    ['GitHub app token', `ghs_${'a'.repeat(36)}`],
    ['Google service account OAuth token', `ya29.${'a'.repeat(40)}`],
    ['Azure storage key', `AccountKey=${'a'.repeat(88)}`],
    ['Vault token', `hvs.${'a'.repeat(24)}`],
    ['generic quoted credential', 'api_key = "secret-value"'],
    ['generic unquoted credential', 'password=super-secret'],
  ])('detects and redacts %s', (_name, secret) => {
    const findings = scanText(secret);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => !('match' in finding))).toBe(true);
    expect(containsSecret(secret)).toBe(true);
    expect(redactSecrets(secret)).not.toContain(secret);
    expect(redactSecrets(secret)).toContain('[REDACTED_SECRET:');
  });

  it('scans multiple findings across multiline text', () => {
    const text = `first ghp_${'a'.repeat(36)}\nsecond AKIAIOSFODNN7EXAMPLE`;
    expect(scanText(text)).toHaveLength(2);
    expect(redactSecrets(text)).not.toContain('ghp_');
    expect(redactSecrets(text)).not.toContain('AKIA');
  });

  it('detects high entropy values only when a credential hint is on the same line', () => {
    const value = 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY2zA4bC6dE8fG';
    expect(containsSecret(`api_key=${value}`)).toBe(true);
    expect(containsSecret(value)).toBe(false);
    expect(containsSecret(`description: ${value}\nordinary status`)).toBe(false);
  });

  it('redacts upstream JWTs with four segments and keeps repeated-line offsets correct', () => {
    const jwt = `eyJ${'a'.repeat(10)}.eyJ${'b'.repeat(10)}.eyJ${'c'.repeat(10)}.${'d'.repeat(10)}`;
    expect(containsSecret(jwt)).toBe(true);
    const text = `token ${'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY2zA4bC6dE8fG'}\nplain\ntoken ${'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY2zA4bC6dE8fG'}`;
    const findings = scanText(text).filter(({ type }) => type === 'high-entropy-string');
    expect(findings).toHaveLength(2);
    expect(findings[1]!.start).toBe(text.lastIndexOf('aB3d'));
    expect(redactSecrets(text)).not.toContain('aB3d');
  });

  it('does not flag ordinary examples or incomplete tokens', () => {
    for (const text of [
      'AKIA123', 'ghp_not-a-real-token', 'xoxb-short',
      'postgres://localhost/db', 'the word password is common',
      '-----BEGIN CERTIFICATE-----\nnot a private key\n-----END CERTIFICATE-----',
      `payload=${'a'.repeat(50)}`,
    ]) expect(containsSecret(text), text).toBe(false);
  });
});

