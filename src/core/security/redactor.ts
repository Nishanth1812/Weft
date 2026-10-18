import { redactSecrets } from './secretScanner.js';
import { PIIVault } from './pii.js';

export function redactSafe(text: string): string {
  return new PIIVault().mask(redactSecrets(text));
}
