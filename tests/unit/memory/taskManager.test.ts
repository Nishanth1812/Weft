import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { createTask, latestVerification, recordVerification, resumeTask, saveCheckpoint } from '../../../src/memory/taskManager.js';

describe('taskManager', () => {
  it('creates tasks and saves versioned checkpoints', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', '/', 'r', 'now', 'now');
      const task = createTask(db, 'r', 'Implement retrieval');
      const checkpoint = saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: 'fp1', objective: 'Implement retrieval', status: 'active', findings: [{ text: 'Storage exists', evidence: [{ path: 'src/storage/db.ts', hash: 'abc' }] }], decisions: [], verification: [{ command: 'npm test', result: 'passed', at: 'now' }], nextAction: 'Implement search' });
      expect(checkpoint.schemaVersion).toBe(1);
      expect(resumeTask(db, task.id, 'fp1')).toMatchObject({ checkpoint, isStale: false, staleEvidence: [] });
    } finally { db.close(); }
  });
  it('flags checkpoint evidence stale when the fingerprint changed', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', '/', 'r', 'now', 'now');
      const task = createTask(db, 'r', 'Implement retrieval');
      saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: 'old', objective: 'x', status: 'active', findings: [{ text: 'fact', evidence: [{ path: 'a.ts', hash: 'h' }] }], decisions: [], verification: [], nextAction: 'next' });
      expect(resumeTask(db, task.id, 'new')).toMatchObject({ isStale: true, staleEvidence: ['a.ts'] });
    } finally { db.close(); }
  });
  it('keeps verification across old checkpoint payloads and includes compact failure evidence', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', '/', 'r', 'now', 'now');
      const task = createTask(db, 'r', 'Verify');
      saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: 'fp', objective: 'x', status: 'active', findings: [], decisions: [], verification: [], nextAction: '', importedNotePayload: 'legacy' });
      const record = { command: 'npm test', exitCode: 1, durationMs: 20, outputTail: 'Expected true, received false', ranAt: 'now', changedFiles: [] };
      recordVerification(db, task.id, record);
      expect(latestVerification(db, task.id)).toEqual(record);
      saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: 'fp', objective: 'x', status: 'active', findings: [], decisions: [], verification: [], nextAction: 'continue' });
      expect(latestVerification(db, task.id)).toEqual(record);
      expect(resumeTask(db, task.id, 'fp').verificationText).toContain(record.outputTail);
      expect(resumeTask(db, task.id, 'fp').verificationText!.length).toBeLessThan(200);
    } finally { db.close(); }
  });
  it('redacts secret text before checkpoint payloads are stored or returned', () => {
    const db = openDatabase(':memory:');
    const token = 'ghp_' + 'A'.repeat(36);
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', '/', 'r', 'now', 'now');
      const task = createTask(db, 'r', 'Checkpoint');
      const checkpoint = saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: 'fp', objective: token, status: 'active', findings: [{ text: token, evidence: [] }], decisions: [token], verification: [], nextAction: token });
      expect(JSON.stringify(checkpoint)).not.toContain(token);
      expect(db.prepare('SELECT payload_json FROM checkpoints').pluck().get()).not.toContain(token);
    } finally { db.close(); }
  });
});
