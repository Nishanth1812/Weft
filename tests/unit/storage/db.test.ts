import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../../src/storage/db.js';

describe('openDatabase', () => {
  it('configures SQLite pragmas and enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    try {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('journal_mode', { simple: true })).toBe('memory');
      expect(db.pragma('synchronous', { simple: true })).toBe(1);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
      db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id INTEGER REFERENCES parent(id));');
      expect(() => db.prepare('INSERT INTO child (parent_id) VALUES (?)').run(1)).toThrow(/FOREIGN KEY/);
    } finally {
      db.close();
    }
  });

  it('uses WAL for file-backed databases', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'weft-storage-'));
    const db = openDatabase(stateDir);
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    } finally {
      db.close();
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
