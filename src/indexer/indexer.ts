import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { orderedFingerprint } from '../core/fingerprint/hasher.js';
import { detectLanguage, extractSymbols } from './symbols.js';
import { chunkText } from './chunker.js';
import { walkRepository, type PreviousFile } from './walker.js';

export interface IndexSummary {
  generationId: number; files: number; symbols: number; chunks: number; reusedFiles: number;
}

export async function indexRepository(
  db: Database.Database, repoId: string, repoRoot: string, options: { force?: boolean } = {},
): Promise<IndexSummary> {
  const now = new Date().toISOString();
  const state = db.prepare('SELECT active_generation FROM repo_index_state WHERE repo_id = ?').get(repoId) as { active_generation: number | null } | undefined;
  const activeId = state?.active_generation ?? null;
  const previousRows = activeId === null ? [] : db.prepare('SELECT id, path, content_hash, mtime_ms, size_bytes FROM files WHERE generation_id = ?').all(activeId) as Array<{ id: number; path: string; content_hash: string; mtime_ms: number; size_bytes: number }>;
  const previousByPath = new Map(previousRows.map((file) => [file.path, file]));
  const previous = new Map<string, PreviousFile>(previousRows.map((file) => [file.path, { mtimeMs: file.mtime_ms, sizeBytes: file.size_bytes, hash: file.content_hash }]));
  const candidates = await walkRepository(repoRoot, options.force ? new Map() : previous);
  const fingerprintParts = candidates.flatMap(({ path, contentHash }) => [path, contentHash]);
  const fingerprint = orderedFingerprint(options.force ? [...fingerprintParts, randomUUID()] : fingerprintParts);
  if (!options.force && state && activeId !== null) {
    const current = db.prepare('SELECT fingerprint FROM index_generations WHERE id = ?').get(activeId) as { fingerprint: string } | undefined;
    if (current?.fingerprint === fingerprint) {
      const counts = db.prepare('SELECT (SELECT COUNT(*) FROM files WHERE generation_id = ?) files, (SELECT COUNT(*) FROM symbols s JOIN files f ON f.id = s.file_id WHERE f.generation_id = ?) symbols, (SELECT COUNT(*) FROM chunks c JOIN files f ON f.id = c.file_id WHERE f.generation_id = ?) chunks').get(activeId, activeId, activeId) as { files: number; symbols: number; chunks: number };
      return { generationId: activeId, ...counts, reusedFiles: candidates.length };
    }
  }

  db.prepare('DELETE FROM index_generations WHERE repo_id = ? AND status IN (\'building\', \'failed\') AND id != COALESCE(?, -1)').run(repoId, activeId);
  const generationId = Number(db.prepare('INSERT INTO index_generations (repo_id, fingerprint, status, started_at) VALUES (?, ?, \'building\', ?)').run(repoId, fingerprint, now).lastInsertRowid);
  const insertFile = db.prepare('INSERT INTO files (repo_id, generation_id, path, content_hash, mtime_ms, size_bytes, language, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertSymbol = db.prepare('INSERT INTO symbols (file_id, name, kind, start_line, end_line) VALUES (?, ?, ?, ?, ?)');
  const insertChunk = db.prepare('INSERT INTO chunks (file_id, ordinal, start_line, end_line, content_hash, safe_text, token_estimate) VALUES (?, ?, ?, ?, ?, ?, ?)');
  let symbolCount = 0;
  let chunkCount = 0;
  try {
    db.transaction(() => {
      for (const file of candidates) {
        const language = file.language ?? detectLanguage(file.path);
        const fileId = Number(insertFile.run(repoId, generationId, file.path, file.contentHash, Math.round(file.mtimeMs), file.sizeBytes, language ?? null, now).lastInsertRowid);
        if (file.unchanged) {
          const old = previousByPath.get(file.path)!;
          const symbols = db.prepare('SELECT name, kind, start_line, end_line FROM symbols WHERE file_id = ?').all(old.id) as Array<{ name: string; kind: string; start_line: number; end_line: number }>;
          const chunks = db.prepare('SELECT ordinal, start_line, end_line, content_hash, safe_text, token_estimate FROM chunks WHERE file_id = ?').all(old.id) as Array<{ ordinal: number; start_line: number; end_line: number; content_hash: string; safe_text: string; token_estimate: number }>;
          for (const symbol of symbols) insertSymbol.run(fileId, symbol.name, symbol.kind, symbol.start_line, symbol.end_line);
          for (const chunk of chunks) insertChunk.run(fileId, chunk.ordinal, chunk.start_line, chunk.end_line, chunk.content_hash, chunk.safe_text, chunk.token_estimate);
          symbolCount += symbols.length;
          chunkCount += chunks.length;
        } else {
          const symbols = extractSymbols(file.content, file.path);
          for (const symbol of symbols) insertSymbol.run(fileId, symbol.name, symbol.kind, symbol.startLine, symbol.endLine);
          const chunks = chunkText(file.content);
          for (const chunk of chunks) insertChunk.run(fileId, chunk.ordinal, chunk.startLine, chunk.endLine, chunk.contentHash, chunk.safeText, chunk.tokenEstimate);
          symbolCount += symbols.length;
          chunkCount += chunks.length;
        }
      }
      db.prepare('UPDATE index_generations SET status = \'ready\', completed_at = ? WHERE id = ?').run(new Date().toISOString(), generationId);
      db.prepare('INSERT INTO repo_index_state (repo_id, active_generation, schema_version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(repo_id) DO UPDATE SET active_generation = excluded.active_generation, updated_at = excluded.updated_at').run(repoId, generationId, new Date().toISOString());
    })();
  } catch (error) {
    db.prepare('DELETE FROM index_generations WHERE id = ?').run(generationId);
    throw error;
  }
  return { generationId, files: candidates.length, symbols: symbolCount, chunks: chunkCount, reusedFiles: candidates.filter(({ unchanged }) => unchanged).length };
}
