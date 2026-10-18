import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function defaultStateDir(): string {
  if (process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, 'Weft', 'state');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Weft', 'state');
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'Weft');
}

export function openDatabase(stateDir: string = defaultStateDir()): Database.Database {
  const path = stateDir === ':memory:' ? stateDir : join(stateDir, 'weft.db');
  if (path !== ':memory:') mkdirSync(stateDir, { recursive: true });
  const db = new Database(path);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
