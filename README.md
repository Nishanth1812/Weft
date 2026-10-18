# Weft — Local-First AI Coding Efficiency Layer

> **Maximize correct, verified engineering work completed per unit of AI cost.**

Weft is a fast, local-first developer productivity layer engineered to run alongside modern AI coding agents (T3 Code, OpenCode, Codex, Claude Code). It operates with **zero external or local LLM calls in its core**—delivering deterministic speed, zero recurring API cost, and offline privacy.

---

## Zero-touch setup

Run `weft setup` once to add Weft to existing Claude Code, Codex, and OpenCode user configurations and enable repository auto-onboarding. Use `--harness claude-code,codex,opencode` to select harnesses, or `--dry-run` to preview. Setup only touches harness config directories that already exist. It adds Claude Code hooks to `~/.claude/settings.json`, its user MCP server to top-level `mcpServers` in `~/.claude.json`, and managed instructions to `~/.claude/CLAUDE.md`; Codex gets `mcp_servers.weft` in `~/.codex/config.toml` and managed instructions in `~/.codex/AGENTS.md`; OpenCode gets `mcp.weft` in `~/.config/opencode/opencode.json` and managed instructions in `~/.config/opencode/AGENTS.md`. Existing unrelated settings and instruction text are preserved. Setup files are never written into repositories.

New Git workspaces are registered when a Claude Code session starts or Weft MCP starts, then indexed without delaying the session hook. Repositories with more than 20,000 tracked files are registered but indexing is skipped with a note in `weft repos status`; change `maxTrackedFiles` in Weft's user config to adjust the limit. Use `weft auto off|on|status` to control onboarding. `weft setup --uninstall` removes Weft-managed harness entries and instruction blocks and turns auto-onboarding off; it keeps the harness config files and unrelated entries.

---

## 🚀 Key Capabilities

1. **Instant Incremental Repository Indexing (`weft index`)**
   - High-throughput file walker respecting `.gitignore` and sensitive paths (`.env*`, `.ssh/`, `*.pem`, etc.).
   - Fast-path `mtime + size` caching reuses previously computed content hashes.
   - Deterministic symbol extraction for TypeScript, JavaScript, Python, Go, Rust, Java, and C/C++.
   - Line-bounded source text chunking automatically indexed into SQLite FTS5.

2. **Hard-Budget Context Packaging (`weft context`)**
   - Combines 5 signals: normalized BM25 lexical rank, path/symbol exact/partial matches, symbol dependency proximity, test-to-implementation pairing, and intent matching.
   - Enforces strict token budgets (e.g. 1024, 2048, 4096 tokens) with conservative estimators to prevent prompt blowups.

3. **Task Checkpoints & Staleness Detection (`weft task`)**
   - Compact session memory capturing objective, confirmed findings, decisions, verification test results, and next actions.
   - Automatically computes working-tree Git status fingerprints to warn agents when referenced files have drifted.

4. **Security & Redaction Ingestion Boundary**
   - Regex secret scanner covering AWS, GitHub PATs, GitLab, Slack, Stripe, JWTs, and connection strings.
   - In-memory `PIIVault` for deterministic email, phone, and SSN masking/restoration.

5. **Multi-Harness Managed Instruction Sync (`weft instructions sync`)**
   - Automatically injects and updates guidelines into `AGENTS.md` and `CLAUDE.md` using isolated marker tags without modifying custom user instructions.

---

## 🛠️ CLI Reference

```bash
# Initialize directories and SQLite database
weft init

# Verify runtime health and database integrity
weft doctor

# Register a Git repository
weft repos register . --name my-project

# Index the repository (sub-second on incremental runs)
weft index my-project

# Query the codebase with SQLite FTS5 lexical search
weft search "authMiddleware" my-project

# Package targeted context strictly under a token budget
weft context "authMiddleware" --budget 2048 my-project

# Start and checkpoint an engineering task
weft task start "Refactor user authentication" my-project
weft task resume <taskId> my-project

# Synchronize agent instruction files (AGENTS.md, CLAUDE.md)
weft instructions sync

# Install or remove Claude Code lifecycle hooks
weft hooks install [--dry-run] [--global]
weft hooks uninstall [--global]
```

## Hooks

Claude Code hooks add a compact repository and checkpoint summary at session start, then save Git-state checkpoints on stop and before compaction. Project settings are written to `.claude/settings.json`; pass `--global` to use the user settings file. `--dry-run` previews installation without writing. Hook failures are silent and never stop the agent.

## Seeing your real usage

Run `weft stats --since 7d` to ingest local Claude Code and Codex transcript usage and see token totals, estimated cost, Weft adoption, and returned-token estimates. `weft costs` and `weft sessions` include the same ingested sessions. Transcript parsing stores usage metadata and tool names only; prompt and response text are never saved. Costs depend on the models covered by Weft's local pricing table, and file baselines are available only for indexed files.

---

## 📊 Economics & Savings Model

## Measuring savings

`weft bench retrieval` compares whole-file literal-search reading with Weft's default 1500-token compact context for each query in `tests/golden/queries.json`. The report shows per-query token estimates, expected-file coverage, and mean/median tokens and ratios. It measures retrieval cost only, not end-to-end task cost. Reports are written under the Weft user state directory (`benchmarks/`); use `--repo <name>` for a registered repository and `--json` for machine-readable output.

`weft bench run --suite tests/benchmarks/suites/weft-core.json --harness 'claude -p "{prompt}" --output-format json' --repeat 3 --dry-run` prints the task × condition × repeat plan and estimated token ceiling without invoking a harness. To run the live measurement, add `--yes`:

```sh
weft bench run --suite tests/benchmarks/suites/weft-core.json --harness 'claude -p "{prompt}" --output-format json' --repeat 3 --yes
```

Each task runs in a temporary repository copy. Conditions A, B, and C measure the baseline harness, shared instructions, and Weft with MCP, lifecycle hooks, and a local index. The Markdown table reports pass rate, median cost per successful task, standard deviation of successful-task costs, and tokens used. Failed tasks are excluded from successful-task cost. Use `--json` for full machine-readable trial results and usage provenance; `--tasks id1,id2` selects a subset and `--repeat n` controls repetitions. Costs and token usage are provider-reported when available; estimated token usage is labeled `estimated`. No live result has been recorded yet.

$$\text{Efficiency Score} = \frac{\text{Verified Tasks Completed}}{\text{Total Token Cost (\$) + Latency Overhead (Hours)}}$$

- **Input Token Reduction:** Replacing raw whole-file dumping with budget-packed chunks typically reduces agent context ingestion from 15k–30k tokens down to 2k–4k tokens (**70–85% token reduction**).
- **Session Continuity:** Resuming tasks from compact checkpoints prevents re-reading full conversational history across sessions.
