import type { CandidateChunk, RankedChunk, SelectionReason } from './types.js';

const words = (text: string): string[] => text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
const isTest = (path: string) => /(?:^|[/_.-])(?:test|tests|spec|specs)(?:[/_.-]|$)/i.test(path);
const isIntent = (path: string) => /(?:^|\/)(?:intent|plans?)(?:\/|\.|$)/i.test(path);
const testStem = (path: string) => path.split('/').at(-1)!.replace(/\.(?:test|spec)\.[^.]+$/i, '').replace(/\.[^.]+$/, '').toLocaleLowerCase();

export function rankCandidates(candidates: CandidateChunk[], query: string): RankedChunk[] {
  const queryWords = [...new Set(words(query))];
  const hasTestTerm = queryWords.some(word => /test|spec/.test(word));
  const ranked = candidates.map(candidate => {
    const path = candidate.path.toLocaleLowerCase();
    const symbols = candidate.symbols ?? [];
    const symbolNames = symbols.map(name => name.toLocaleLowerCase());
    const searchable = [path, ...symbolNames];
    const exactPath = queryWords.length > 0 && path.split(/[\/_.-]/).some(part => queryWords.includes(part));
    const exactSymbol = queryWords.length > 0 && symbolNames.some(name => queryWords.includes(name));
    const partial = queryWords.length > 0 && queryWords.some(word => searchable.some(value => value.includes(word)));
    const pathScore = exactPath || exactSymbol ? 1 : partial ? 0.5 : 0;
    const graphScore = Math.max(0, Math.min(1, candidate.graphProximity ?? 0));
    const stem = testStem(candidate.path);
    const pairedTest = isTest(candidate.path) && candidates.some(other => !isTest(other.path) && testStem(other.path) === stem);
    const pairedSource = !isTest(candidate.path) && candidates.some(other => isTest(other.path) && testStem(other.path) === stem);
    const testScore = (pairedTest || pairedSource || (isTest(candidate.path) && hasTestTerm)) ? 1 : 0;
    const intentScore = isIntent(candidate.path) && queryWords.some(word => words(candidate.safeText).includes(word)) ? 1 : 0;
    const signals: Array<[SelectionReason, number]> = [
      ['lexical', candidate.normalizedBM25], [exactSymbol ? 'symbol' : 'path', pathScore], ['dependency', graphScore], ['path', testScore], ['intent', intentScore],
    ];
    const score = 0.45 * candidate.normalizedBM25 + 0.20 * pathScore + 0.15 * graphScore + 0.10 * testScore + 0.10 * intentScore;
    const selectionReason = signals.reduce((best, current) => current[1] > best[1] ? current : best)[0];
    return { ...candidate, score, selectionReason };
  });
  return ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine);
}
