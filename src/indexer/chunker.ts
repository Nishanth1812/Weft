import { hashString } from '../core/fingerprint/hasher.js';
import { estimateTokens } from '../core/estimate/tokenEstimator.js';

export interface TextChunk { ordinal: number; startLine: number; endLine: number; safeText: string; contentHash: string; tokenEstimate: number }

export function chunkText(safeText: string, chunkLines = 100, overlapLines = 15): TextChunk[] {
  const lines = safeText.split(/\r?\n/);
  if (chunkLines < 50 || chunkLines > 150 || overlapLines < 10 || overlapLines > 20 || overlapLines >= chunkLines) throw new RangeError('Chunk size must be 50–150 lines with 10–20 lines of overlap');
  const chunks: TextChunk[] = [];
  for (let start = 0; start < lines.length;) {
    const end = Math.min(start + chunkLines, lines.length);
    const text = lines.slice(start, end).join('\n');
    chunks.push({ ordinal: chunks.length, startLine: start + 1, endLine: end, safeText: text, contentHash: hashString(text), tokenEstimate: estimateTokens(text) });
    if (end === lines.length) break;
    start = end - overlapLines;
  }
  return chunks;
}
