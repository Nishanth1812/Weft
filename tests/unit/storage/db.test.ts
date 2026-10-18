import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, repairCorruptDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

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
    } finally { db.close(); }
  });

  it('uses WAL for file-backed databases', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'weft-storage-'));
    const db = openDatabase(stateDir);
    try { expect(db.pragma('journal_mode', { simple: true })).toBe('wal'); }
    finally { db.close(); rmSync(stateDir, { recursive: true, force: true }); }
  });
});

describe('database repair', () => {
  it('moves an unreadable database aside and allows a fresh schema to be created', async () => {
    const state = await mkdtemp(join(tmpdir(), 'weft-db-repair-')); dirs.push(state);
    await writeFile(join(state, 'weft.db'), 'not a sqlite database');
    const result = await repairCorruptDatabase(state);
    expect(result.integrity).not.toBe('ok');
    expect(result.backup).toBeTruthy();
    expect(await readFile(result.backup!, 'utf8')).toBe('not a sqlite database');
    const db = openDatabase(state);
    try { migrate(db); expect(db.pragma('quick_check', { simple: true })).toBe('ok'); }
    finally { db.close(); }
  });
});
