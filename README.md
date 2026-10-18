# Weft — Local-First AI Coding Efficiency Layer

> **Maximize correct, verified engineering work completed per unit of AI cost.**

Weft is a fast, local-first developer productivity layer engineered to run alongside modern AI coding agents (T3 Code, OpenCode, Codex, Claude Code). It operates with **zero external or local LLM calls in its core**—delivering deterministic speed, zero recurring API cost, and offline privacy.

---

## 🚀 Key Capabilities

1. **Instant Incremental Repository Indexing (`ctx index`)**
   - High-throughput file walker respecting `.gitignore` and sensitive paths (`.env*`, `.ssh/`, `*.pem`, etc.).
   - Fast-path `mtime + size` caching reuses previously computed content hashes.
   - Deterministic symbol extraction for TypeScript, JavaScript, Python, Go, Rust, Java, and C/C++.
   - Line-bounded source text chunking automatically indexed into SQLite FTS5.

2. **Hard-Budget Context Packaging (`ctx context`)**
   - Combines 5 signals: normalized BM25 lexical rank, path/symbol exact/partial matches, symbol dependency proximity, test-to-implementation pairing, and intent matching.
   - Enforces strict token budgets (e.g. 1024, 2048, 4096 tokens) with conservative estimators to prevent prompt blowups.

3. **Task Checkpoints & Staleness Detection (`ctx task`)**
   - Compact session memory capturing objective, confirmed findings, decisions, verification test results, and next actions.
   - Automatically computes working-tree Git status fingerprints to warn agents when referenced files have drifted.

4. **Security & Redaction Ingestion Boundary**
   - Regex secret scanner covering AWS, GitHub PATs, GitLab, Slack, Stripe, JWTs, and connection strings.
   - In-memory `PIIVault` for deterministic email, phone, and SSN masking/restoration.

5. **Multi-Harness Managed Instruction Sync (`ctx instructions sync`)**
   - Automatically injects and updates guidelines into `AGENTS.md` and `CLAUDE.md` using isolated marker tags without modifying custom user instructions.

---

## 🛠️ CLI Reference

```bash
# Initialize directories and SQLite database
ctx init

# Verify runtime health and database integrity
ctx doctor

# Register a Git repository
ctx repos register . --name my-project

# Index the repository (sub-second on incremental runs)
ctx index my-project

# Query the codebase with SQLite FTS5 lexical search
ctx search "authMiddleware" my-project

# Package targeted context strictly under a token budget
ctx context "authMiddleware" --budget 2048 my-project

# Start and checkpoint an engineering task
ctx task start "Refactor user authentication" my-project
ctx task resume <taskId> my-project

# Synchronize agent instruction files (AGENTS.md, CLAUDE.md)
ctx instructions sync

# Install or remove Claude Code lifecycle hooks
ctx hooks install [--dry-run] [--global]
ctx hooks uninstall [--global]
```

## Hooks

Claude Code hooks add a compact repository and checkpoint summary at session start, then save Git-state checkpoints on stop and before compaction. Project settings are written to `.claude/settings.json`; pass `--global` to use the user settings file. `--dry-run` previews installation without writing. Hook failures are silent and never stop the agent.

---

## 📊 Economics & Savings Model

## Measuring savings

`ctx bench retrieval` compares whole-file literal-search reading with Weft's default 1500-token compact context for each query in `tests/golden/queries.json`. The report shows per-query token estimates, expected-file coverage, and mean/median tokens and ratios. It measures retrieval cost only, not end-to-end task cost. Reports are written under the Weft user state directory (`benchmarks/`); use `--repo <name>` for a registered repository and `--json` for machine-readable output.

`ctx bench run --suite tests/benchmarks/suites/example.json --harness 'claude -p "{prompt}" --output-format json'` runs each task in isolated repo copies under conditions A (baseline), B (managed instructions), and C (instructions, MCP config, and a local index). The template must contain `{prompt}`; `{repoPath}` is also available. Harness JSON usage is labeled `provider_reported` when available; otherwise tokens are estimated and labeled `estimated`. Success requires both harness and `testCommand` to exit successfully. The report includes mean successful-task cost and its population variance per condition. Replace the example tasks with real, reproducible tasks before using results as evidence. No live results exist yet.

$$\text{Efficiency Score} = \frac{\text{Verified Tasks Completed}}{\text{Total Token Cost (\$) + Latency Overhead (Hours)}}$$

- **Input Token Reduction:** Replacing raw whole-file dumping with budget-packed chunks typically reduces agent context ingestion from 15k–30k tokens down to 2k–4k tokens (**70–85% token reduction**).
- **Session Continuity:** Resuming tasks from compact checkpoints prevents re-reading full conversational history across sessions.
