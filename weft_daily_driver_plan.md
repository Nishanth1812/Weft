# Weft — Phase 8: Daily-Driver Plan

Goal: agents use Weft automatically, spend fewer tokens, and finish more work, with the saving *measured* rather than assumed.
Baseline: Phases 0–7 of `weft_master_implementation_plan.md` are done (31 test files / 122 tests pass, CLI builds, indexing 74 files takes 0.45s).

## Dogfooding findings (2026-10-18, run on this repo)

| # | Finding | Impact |
|---|---|---|
| F1 | `ctx` is not on PATH (`which ctx` fails) | Agents in T3 Code cannot call it at all |
| F2 | No MCP server; only prose in `CLAUDE.md`/`AGENTS.md` | Models routinely ignore instructions about unfamiliar CLIs; tool calls are far more reliable |
| F3 | `ctx search` ranks `tests/…instructions.test.ts` above `src/integrations/instructions.ts` for "instructions sync managed block" | Wrong file first = wasted tokens |
| F4 | Chunks are fixed 100-line windows (`src/indexer/chunker.ts`), not symbol-aligned | Returns 680 tokens where a 15-line function would do |
| F5 | Symbol extractor emits `catch`, `if` as symbols | Pollutes ranking and `symbols` output |
| F6 | Output is pretty-printed JSON with escaped `\n` code | JSON overhead and escaping inflate the tokens the tool is meant to save |
| F7 | `search` returns full chunk text for every hit | No cheap "list locations first, fetch on demand" step |
| F8 | Instruction sync only touches this repo; no per-repo onboarding | Weft only helps where it was manually set up |
| F9 | Benchmark runner exists but no real task suite or recorded result | The savings number is still unknown |

## Milestones (ordered by value per effort)

### M1 — Get agents calling it (F1, F2, F8). ~1–2 days
- `npm link` / documented install so `ctx` is on PATH; `ctx doctor` reports whether `ctx` resolves from a clean shell.
- `src/mcp/server.ts`: stdio MCP server, no new heavy dependency (JSON-RPC over stdio is small; use `@modelcontextprotocol/sdk` only if hand-rolling costs more). Tools:
  `weft_search` (locations + 1-line snippets), `weft_context` (budgeted pack), `weft_read` (exact line range by chunk id), `weft_checkpoint`, `weft_resume`, `weft_health`.
- `ctx mcp install --harness claude-code|codex|opencode|t3` writes the harness MCP config idempotently (managed-block approach already used for instructions).
- `ctx onboard [path]`: register repo, index, sync instructions, install MCP config in one command.
- Exit: a fresh Claude Code session in a new repo calls `weft_context` unprompted in ≥80% of exploration turns (check via telemetry tool-call counts).

### M2 — Retrieval quality (F3, F4, F5). ~2–3 days
- Symbol-aligned chunking: split at function/class boundaries from the extractor, fall back to 60-line windows; keep the 50–150 line guard only for the fallback.
- Fix extractor keyword false positives (`if`, `catch`, `for`, `while`, `switch`).
- Ranking: symbol-name match boost, path-match boost, penalty for `tests/`/fixtures/generated files unless the query contains "test"; keep BM25 as base.
- Golden-query test set (`tests/golden/queries.json`, ~30 queries over this repo with expected top-3 files). Gate: top-1 ≥ 70%, top-3 ≥ 90%.

### M3 — Cheaper output (F6, F7). ~1 day
- Compact text format as the default for agent-facing commands: `path:start-end  symbol` header then raw code, no JSON escaping. `--json` stays for scripts.
- Two-step retrieval: `search` returns ranked locations + signature only; `read` fetches the lines. Default `context` budget 1500 tokens.
- Dedupe overlapping chunks from the same file before packing (the dogfood run returned the same test file twice).
- Exit: median `context` output for golden queries ≤ 900 tokens at equal top-3 accuracy.

### M4 — Make the workflow stick. ~2 days
- Claude Code `SessionStart` hook: injects `ctx task resume` summary plus `git` staleness (uses existing `runHookSafely`, <500ms budget).
- `Stop`/`PreCompact` hook: auto-checkpoint, so continuity doesn't depend on the model remembering.
- Background `ctx watch` (or index-on-demand with a fast no-change path, already <1s) so the index is never stale.
- `ctx portfolio` as a morning command: dirty trees, stale branches, tasks with checkpoints.

### M5 — Measure it (F9). ~2 days, run alongside M2–M4
- Build the benchmark suite: 10 real tasks from your own repos (bugfix/refactor/feature) with test commands; conditions A/B/C already defined in `src/bench/types.ts`.
- Capture provider-reported tokens per run (provenance separation already in telemetry). Report cost per *successful* task with variance, per master plan §Phase 6.
- Re-run after each milestone; publish the table in `README.md` replacing the unmeasured claims.
- Exit: documented, reproducible number. If the saving is under ~15% on your real tasks, re-prioritise toward checkpoints/continuity instead of retrieval.

## Order of work
M1 → M2 + M3 in parallel (shared golden test set) → M5 first real measurement → M4. Rationale: nothing else matters until agents call the tool; retrieval quality and output size determine whether calling it saves tokens; hooks come last because they amplify a tool that must already be good.

## Risks
- Hooks that add latency or noise can cost more tokens than they save: keep injected context ≤ 400 tokens and measure.
- Redaction (`src/core/security`) must apply to MCP output the same as CLI output; add a test with a planted secret.
- MCP tool descriptions cost tokens on every turn; keep six tools, terse descriptions.

## Superseded plans
`contextforge_*_plan.md` (3 files) were removed in commit `66c99ff`; they are recoverable with `git show 66c99ff^:contextforge_implementation_plan.md` and are fully merged into `weft_master_implementation_plan.md`. This Phase 8 plan supersedes their remaining roadmap.
