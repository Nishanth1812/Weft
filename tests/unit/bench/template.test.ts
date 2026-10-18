import { describe, expect, it } from 'vitest';
import { fillTemplate, shellQuote } from '../../../src/bench/live.js';

describe('harness template filling', () => {
  it('quotes a bare placeholder and replaces an already quoted one whole', () => {
    expect(fillTemplate('run {prompt}', { prompt: 'hi there' }, )).toBe(`run ${shellQuote('hi there')}`);
    expect(fillTemplate('run "{prompt}" --x', { prompt: 'hi' })).toBe(`run ${shellQuote('hi')} --x`);
    expect(fillTemplate("run '{prompt}'", { prompt: 'hi' })).toBe(`run ${shellQuote('hi')}`);
  });

  it('keeps shell metacharacters inert on POSIX', () => {
    expect(shellQuote('`touch x` $(whoami) $HOME it\'s', 'linux')).toBe(`'\`touch x\` $(whoami) $HOME it'\\''s'`);
  });

  it('escapes double quotes for cmd.exe', () => {
    expect(shellQuote('say "hi"', 'win32')).toBe('"say \\"hi\\""');
  });
});
