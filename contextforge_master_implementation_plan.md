# ContextForge — Master Implementation Plan & Engineering Specification

**Document Version:** 2.0 (Unified Master Blueprint)  
**Date:** 18 October 2026  
**Status:** Approved Master Engineering Plan  
**Working Name:** ContextForge (Absorbing DevPulse)  
**Supersedes:** `contextforge_implementation_plan.md` (v1.0) and `contextforge_transition_plan.md` (v1.0)  
**Primary Environment:** T3 Code, OpenCode, Codex CLI, Claude Code  
**Deployment Model:** Local-first, cross-platform (Node LTS, Linux / macOS / Windows), zero recurring service cost  
**License:** GNU General Public License v3.0 (GPL-3.0)  

---

## 1. Executive Summary & Strategic Objectives

ContextForge is a lightweight, local-first developer productivity layer engineered to maximize **correct, verified engineering work per unit of AI cost**. It acts as a companion and accelerator to existing coding harnesses (T3 Code, OpenCode, Codex, Claude Code) rather than competing with them or introducing another autonomous agent runtime.

By absorbing the deterministic assets of **DevPulse** (regex secret scanner, sensitive path definitions, PII redaction vault, multi-repo registry, and deterministic repository health checks) and merging them into ContextForge's deterministic architecture (incremental lexical indexing, SQLite FTS5 search, hard-budget context retrieval, evidence-backed checkpoints, and cache/cost telemetry), ContextForge provides a single, cohesive developer tool (`ctx`).

### 1.1 The Core Formula
$$\text{Productivity Efficiency} = \frac{\text{Correct, Verified Engineering Tasks Completed}}{\text{Total AI Costs (Provider API Charges + Token Spend + Engineering Latency)}}$$

### 1.2 Core Architectural Principles
1. **Zero LLM Core Guarantee:** The core CLI, indexer, search engine, context packager, checkpoint manager, and telemetry subsystem require **zero external or local LLM calls**. All operations are 100% deterministic, offline-capable, and cost-free.
2. **Memory is Not Truth:** The filesystem, current Git working tree, and real-time tool outputs remain the absolute source of truth. SQLite stores only derived indices, structured task memory, and telemetry.
3. **Explicit Provenance:** Every metric, cost figure, and context token must declare its origin: `provider_reported`, `harness_reported`, `local_parsed`, `estimated`, or `unavailable`. Estimates are never conflated with billed dollars.
4. **Non-Invasive Adapter Isolation:** Coding harness adapters are strictly non-blocking. If ContextForge is disabled, uninstalled, or encounters an internal fault, the host harness continues normal operation without disruption.
5. **Security as an Ingestion Boundary:** Security filters and sensitive-path rules run *before* file metadata, chunks, or tokens are persisted in storage or emitted to logs.
6. **Local Concurrency & Integrity:** Multi-repository support via a centralized SQLite database operating in Write-Ahead Logging (WAL) mode with bounded busy timeouts and foreign key integrity.

### 1.3 Non-Goals (Strict MVP Guardrails)
- No local or remote LLM calls for indexing, ranking, or briefing generation.
- No vector databases, semantic embeddings, or neural search models.
- No proxy server, network gateway, or man-in-the-middle HTTP interception.
- No autonomous code modification, automatic git commits, pushes, or external deployments.
- No local web server, UI dashboard daemon, or background resident service.

---

## 2. Harmonized System Architecture & Boundaries

ContextForge is structured into clear separation-of-concerns layers to ensure testability, portability, and zero runtime bloat.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Host Coding Harnesses                           │
│              (T3 Code  │  OpenCode  │  Codex CLI  │  Claude Code)           │
└──────────────┬──────────────────┬─────────────────┬─────────────────────────┘
               │                  │                 │
       [MCP / Tool Bridge]   [AGENTS.md]     [CLAUDE.md / Hooks]
               │                  │                 │
┌──────────────▼──────────────────▼─────────────────▼─────────────────────────┐
│                            Native Adapters Layer                            │
│           (src/integrations/opencode, codex, claude-code)                   │
│   • Non-blocking translation   • Isolated error boundaries                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                              CLI Interface (`ctx`)                          │
│                            (src/cli/commands/*)                             │
│   • Command taxonomy           • Exit codes (0–6)     • JSON envelope       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                                 Core Layer                                  │
│                                 (src/core/*)                                │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌───────────────┐  │
│  │     Security Engine     │ │   Repo Registry Engine  │ │  Git State    │  │
│  │ • Secret Regex Corpus   │ │ • Git root discovery    │ │ • Porcelain   │  │
│  │ • Sensitive Paths       │ │ • Multi-repo index      │ │ • Working tree│  │
│  │ • PII Placeholder Vault │ │ • Fuzzy candidate match │ │   fingerprint │  │
│  └─────────────────────────┘ └─────────────────────────┘ └───────────────┘  │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌───────────────┐  │
│  │     Indexer Engine      │ │    Retrieval Engine     │ │ Task Memory   │  │
│  │ • Fast-path (mtime+size)│ │ • SQLite FTS5 (BM25)    │ │ • Checkpoints │  │
│  │ • SHA-256 chunking      │ │ • Multi-signal ranking  │ │ • Staleness   │  │
│  │ • Regex/AST symbols     │ │ • Hard-budget packer    │ │ • Compaction  │  │
│  └─────────────────────────┘ └─────────────────────────┘ └───────────────┘  │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌───────────────┐  │
│  │     Telemetry Core      │ │     Health & Audit      │ │ Intent Engine │  │
│  │ • Provenance tracking   │ │ • Unmerged branch scan  │ │ • Sectional   │  │
│  │ • Pricing snapshot sync │ │ • Staleness & TODO scan │ │   Markdown    │  │
│  └─────────────────────────┘ └─────────────────────────┘ └───────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                               Storage Layer                                 │
│                               (src/storage)                                 │
│  • SQLite (WAL Mode, Busy Timeout 5000ms) • Checksummed Migrations          │
│  • Bounded Chunks & FTS5 Index            • Relational Cascades             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Core TypeScript Interfaces
All module boundaries are governed by explicit TypeScript interfaces (`src/core/types.ts`):

```typescript
export interface RepositoryRef {
  readonly id: string;
  readonly rootPath: string; // Canonical absolute path
  readonly displayName: string;
  readonly registeredAt: string;
}

export interface BoundedContextRequest {
  readonly repo: RepositoryRef;
  readonly query: string;
  readonly maxTokens: number; // Hard budget: 2048, 4096, 8192
  readonly includePlans?: boolean;
}

export interface BoundedContextPackage {
  readonly query: string;
  readonly estimatedTokens: number;
  readonly budget: number;
  readonly isTruncated: boolean;
  readonly items: ReadonlyArray<{
    readonly path: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly score: number;
    readonly selectionReason: 'lexical' | 'path' | 'symbol' | 'dependency' | 'intent';
    readonly safeText: string;
  }>;
  readonly omittedCount: number;
}

export interface TaskCheckpoint {
  readonly id: string;
  readonly taskId: string;
  readonly schemaVersion: number;
  readonly revision: string; // Git commit SHA
  readonly workingTreeFingerprint: string;
  readonly objective: string;
  readonly status: 'active' | 'blocked' | 'complete';
  readonly findings: ReadonlyArray<{
    readonly text: string;
    readonly evidence: ReadonlyArray<{ path: string; startLine?: number; endLine?: number; hash: string }>;
    readonly verifiedAt?: string;
  }>;
  readonly decisions: ReadonlyArray<string>;
  readonly verification: ReadonlyArray<{ command: string; result: string; at: string }>;
  readonly nextAction: string;
  readonly importedNotePayload?: string; // Absorbed from DevPulse (capped at 16KB)
  readonly createdAt: string;
}
```

---

## 3. Storage Architecture & Unified SQLite Data Model

The persistence layer uses a single user-level SQLite database located at:
- **Windows:** `%LOCALAPPDATA%\ContextForge\state\contextforge.db`
- **Linux:** `~/.local/state/contextforge/contextforge.db` (or `$XDG_STATE_HOME/contextforge/contextforge.db`)
- **macOS:** `~/Library/Application Support/ContextForge/state/contextforge.db`

### 3.1 SQLite DDL Specification (Migration V1)
```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

-- Migration ledger
CREATE TABLE schema_migrations (
  version       INTEGER PRIMARY KEY,
  applied_at    TEXT NOT NULL,
  checksum      TEXT NOT NULL
);

-- Registered repositories (DevPulse absorption)
CREATE TABLE repositories (
  id            TEXT PRIMARY KEY,
  root_path     TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  config_json   TEXT NOT NULL DEFAULT '{}'
);

-- Per-repo config overrides
CREATE TABLE repo_config_overrides (
  repo_id       TEXT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
  config_json   TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Index generation management (Atomic generation publication)
CREATE TABLE index_generations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id       TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  fingerprint   TEXT NOT NULL,
  status        TEXT NOT NULL CHECK(status IN ('building', 'ready', 'failed')),
  started_at    TEXT NOT NULL,
  completed_at  TEXT,
  UNIQUE(repo_id, fingerprint)
);

CREATE TABLE repo_index_state (
  repo_id           TEXT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
  active_generation INTEGER REFERENCES index_generations(id),
  schema_version    INTEGER NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Indexed files
CREATE TABLE files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id       TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation_id INTEGER NOT NULL REFERENCES index_generations(id) ON DELETE CASCADE,
  path          TEXT NOT NULL, -- Normalized relative forward-slash path
  content_hash  TEXT NOT NULL, -- SHA-256
  mtime_ms      INTEGER NOT NULL,
  size_bytes    INTEGER NOT NULL,
  language      TEXT,
  parser_id     TEXT,
  indexed_at    TEXT NOT NULL,
  UNIQUE(generation_id, path)
);

CREATE INDEX idx_files_lookup ON files(repo_id, path);

-- Extracted code symbols
CREATE TABLE symbols (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL, -- function, class, interface, type, variable
  start_line    INTEGER NOT NULL,
  end_line      INTEGER NOT NULL,
  parent_id     INTEGER REFERENCES symbols(id) ON DELETE CASCADE
);

CREATE INDEX idx_symbols_name ON symbols(name);

-- Extracted symbol reference graph
CREATE TABLE edges (
  source_symbol_id INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  target_symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
  target_text      TEXT,
  kind             TEXT NOT NULL, -- calls, implements, extends, imports
  confidence       REAL NOT NULL,
  PRIMARY KEY(source_symbol_id, target_symbol_id, target_text, kind)
);

-- Chunks for lexical search
CREATE TABLE chunks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  start_line     INTEGER NOT NULL,
  end_line       INTEGER NOT NULL,
  content_hash   TEXT NOT NULL,
  safe_text      TEXT NOT NULL, -- Redacted source text
  token_estimate INTEGER NOT NULL,
  UNIQUE(file_id, ordinal)
);

-- Full-Text Search virtual table over safe chunks
CREATE VIRTUAL TABLE chunk_fts USING fts5(
  safe_text,
  content='chunks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- Triggers to maintain FTS5 synchronization
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunk_fts(rowid, safe_text) VALUES (new.id, new.safe_text);
END;

CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunk_fts(chunk_fts, rowid, safe_text) VALUES('delete', old.id, old.safe_text);
END;

CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunk_fts(chunk_fts, rowid, safe_text) VALUES('delete', old.id, old.safe_text);
  INSERT INTO chunk_fts(rowid, safe_text) VALUES (new.id, new.safe_text);
END;

-- Task state & versioned checkpoints
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  repo_id       TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK(status IN ('active', 'blocked', 'complete')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE checkpoints (
  id                       TEXT PRIMARY KEY,
  task_id                  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  schema_version           INTEGER NOT NULL,
  revision                 TEXT, -- Git commit SHA
  working_tree_fingerprint TEXT NOT NULL,
  payload_json             TEXT NOT NULL,
  created_at               TEXT NOT NULL
);

-- Telemetry & cache intelligence
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  repo_id       TEXT REFERENCES repositories(id) ON DELETE SET NULL,
  harness       TEXT NOT NULL,
  model         TEXT,
  started_at    TEXT NOT NULL,
  ended_at      TEXT
);

CREATE TABLE usage_events (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  source              TEXT NOT NULL,
  provenance          TEXT NOT NULL CHECK(provenance IN ('provider_reported', 'harness_reported', 'local_parsed', 'estimated')),
  observed_at         TEXT NOT NULL,
  model               TEXT,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  reasoning_tokens    INTEGER,
  cached_input_tokens INTEGER,
  cache_write_tokens  INTEGER,
  cost_micros         INTEGER, -- Stored as integer micro-dollars ($1 = 1,000,000)
  pricing_snapshot_id TEXT,
  confidence          REAL,
  raw_metadata_json   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE cache_diagnostics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  observed_at   TEXT NOT NULL,
  cache_kind    TEXT NOT NULL, -- prompt_cache, semantic_prefix, local_index
  hit_tokens    INTEGER,
  miss_tokens   INTEGER,
  provenance    TEXT NOT NULL,
  details_json  TEXT NOT NULL DEFAULT '{}'
);

-- Migration import ledger (DevPulse absorption)
CREATE TABLE migration_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type   TEXT NOT NULL, -- devpulse
  source_key    TEXT NOT NULL UNIQUE,
  imported_at   TEXT NOT NULL,
  target_table  TEXT NOT NULL,
  target_id     TEXT NOT NULL
);
```

### 3.2 Concurrency, Atomic Generations & Retention
- **Single-Writer Constraint:** Writes use short-lived transactions wrapped in immediate write locks. Reading processes query existing `ready` index generations concurrently via WAL mode.
- **Atomic Index Swaps:** An indexing pass stages all files, symbols, and chunks under a new `building` generation. Only upon complete, error-free parsing does a transaction set `status = 'ready'` and update `repo_index_state.active_generation`. Failed or aborted index passes leave the previous generation untouched.
- **Retention Rules:**
  - Inactive index generations older than 7 days are automatically pruned during `ctx clean`.
  - Usage events are retained for 90 days by default.
  - Checkpoints are retained indefinitely unless deleted explicitly by the user.

---

## 4. Security & Redaction Subsystem (DevPulse Absorption)

The security subsystem is implemented in `src/core/security/` and acts as the strict ingestion filter across all indexing, search output, and logging pipelines.

### 4.1 Secret Scanner (`secretScanner.ts`)
Ported from DevPulse (`internal/security/scanner.go`), the scanner compiles an optimized regex suite executing against every candidate chunk:
- **Private Keys & Certificates:** PEM header/footers (`BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY`).
- **Cloud & Service Credentials:**
  - AWS Access Key (`AKIA[0-9A-Z]{16}`) and Secret Key patterns.
  - GitHub Personal Access Tokens (`ghp_[a-zA-Z0-9]{36}`, `github_pat_...`).
  - GitLab Personal Access Tokens (`glpat-[a-zA-Z0-9\-=_]{20,}`).
  - Slack Bot/User Tokens (`xoxb-[0-9]{11,}`, `xoxp-[0-9]{11,}`).
  - Stripe Secret & Restricted Keys (`sk_live_[0-9a-zA-Z]{24}`, `rk_live_[0-9a-zA-Z]{24}`).
  - Google Cloud Service Account JSON keys.
  - JSON Web Tokens (`eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}`).
- **Database & Auth Strings:** `postgres://`, `mysql://`, `mongodb+srv://`, `redis://` with inline credentials; `Authorization: Bearer <token>`.
- **High-Entropy Heuristics:** Shannon entropy calculation ($\ge 4.5$) applied only when keywords like `secret`, `token`, `password`, or `api_key` are present within the same line.

### 4.2 Sensitive Path Guard (`paths.ts`)
Ported from DevPulse (`internal/security/paths.go`), the default file discovery immediately skips paths matching:
- Environment and credential files: `.env*`, `*.pem`, `*.key`, `*.pkcs12`, `*.pfx`.
- Cloud/infra configuration directories: `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.docker`, `~/.kube`.
- Infrastructure state: `*.tfstate*`, `credentials.json`, `service-account*.json`.
- Version control internals: `.git/`, `.hg/`, `.svn/`.

### 4.3 PII Placeholder Vault (`pii.ts`)
Ported from DevPulse (`internal/security/pii.go`):
- Detects emails, US phone numbers, and Social Security Numbers within candidate context.
- Replaces matches with deterministic, stable placeholders (`[EMAIL_1]`, `[PHONE_1]`).
- **Privacy Rule:** The PII mapping vault is maintained purely in-memory during single-command execution. No cleartext PII maps are written to SQLite or disk.

### 4.4 Redacted Logging
All internal logging calls pass through a centralized redaction filter. Even under `--verbose`, detected secrets are masked as `[REDACTED_SECRET:<type>]`.

---

## 5. Incremental Repository Indexing & Invalidation

The indexing subsystem (`src/indexer/`) guarantees near-instant re-indexing on medium-to-large codebases through a layered caching strategy.

```
[Candidate File Walk]
       │
       ▼
[Exclusion Check: .gitignore + sensitive paths + user config] ──(Match)──► [Skip]
       │
       ▼
[Stat Check: (mtime_ms, size_bytes) == Previous Record?]
       │
       ├────(Equal)──► [Verify content_hash via fast cache] ──► [Reuse Chunks & Symbols]
       │
       ▼ (Modified or New)
[Read Bounded File Buffer (Cap: 2 MB)]
       │
       ▼
[Secret Scanner & PII Sanitization] ──(Secret Found)──► [Reject File or Redact Chunks]
       │
       ▼
[Language Detection & Symbol Extraction (AST / Regex)]
       │
       ▼
[Line-Bounded Chunking (100–300 lines with overlap)]
       │
       ▼
[Stage Rows in Index Generation Transaction]
```

### 5.1 Invalidation Fingerprints
1. **File Content Hash:** Pure SHA-256 of the raw file bytes.
2. **Repository Working-Tree Fingerprint:**
   $$\text{WTP} = \text{SHA-256}(\text{HEAD SHA} \parallel \text{Branch Name} \parallel \text{Sorted Staged Changes} \parallel \text{Sorted Unstaged Diff Hashes})$$
3. **Index Generation Fingerprint:**
   $$\text{IGP} = \text{SHA-256}(\text{ContextForge Version} \parallel \text{Exclusion Rules Hash} \parallel \text{Sorted } \langle\text{path}, \text{content\_hash}\rangle)$$

### 5.2 Symbol Extraction Hierarchy
- **Tier 1 (Universal Fallback):** Optimized line-based regex extractors for functions, classes, interfaces, types, and imports across TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, and C#.
- **Tier 2 (Selective Tree-Sitter Parsers):** When compiled native bindings are available, Tree-sitter provides deep syntax tree parsing for AST-accurate symbol boundary detection.
- **Resilience Policy:** If an AST parser fails or throws on malformed syntax, the indexer silently falls back to Tier 1 regex extraction without aborting the indexing pass.

---

## 6. Lexical Search & Hard-Budget Context Packaging

The context retrieval engine (`src/context/`) provides deterministic, evidence-backed context chunks fitting strictly within an AI model's prompt budget.

### 6.1 Multi-Signal Scoring Function
Each candidate code chunk $c$ against query $q$ is ranked by:
$$S(c, q) = 0.45 \cdot L(c, q) + 0.20 \cdot P(c, q) + 0.15 \cdot G(c, q) + 0.10 \cdot T(c, q) + 0.10 \cdot I(c, q)$$

Where:
- $L(c, q) \in [0, 1]$: SQLite FTS5 BM25 score, normalized: $L = \frac{1}{1 + \text{bm25}(c)}$.
- $P(c, q) \in [0, 1]$: Path and symbol match score (exact match on file name or symbol name = 1.0; partial match = 0.5).
- $G(c, q) \in [0, 1]$: Graph proximity (edges connecting symbols in $c$ to already selected chunks).
- $T(c, q) \in [0, 1]$: Test relevance boost (matches between implementation code and associated test files).
- $I(c, q) \in [0, 1]$: Project intent relevance (matches with `intent.md` goals and plan files).

### 6.2 Hard-Budget Greedy Packing Algorithm
```typescript
export function packContext(
  candidates: RankedChunk[],
  tokenBudget: number
): BoundedContextPackage {
  let usedTokens = 0;
  const selected: SelectedChunk[] = [];
  let omittedCount = 0;

  // Deterministic tie-breaker: score desc, path asc, startLine asc
  candidates.sort((a, b) => 
    b.score - a.score || 
    a.path.localeCompare(b.path) || 
    a.startLine - b.startLine
  );

  for (const chunk of candidates) {
    // Conservative token estimation: ceil(chars / 4) with 10% safety margin
    const estimatedTokens = Math.ceil((chunk.safeText.length / 4) * 1.10);
    
    if (usedTokens + estimatedTokens <= tokenBudget) {
      selected.push({ ...chunk, estimatedTokens });
      usedTokens += estimatedTokens;
    } else {
      omittedCount++;
    }
  }

  return {
    query: queryText,
    estimatedTokens: usedTokens,
    budget: tokenBudget,
    isTruncated: omittedCount > 0,
    items: selected,
    omittedCount
  };
}
```

---

## 7. Task Memory & Checkpoint Continuity

ContextForge preserves development flow across sessions without polluting model context with thousands of lines of historical chat transcripts.

### 7.1 Structured Checkpoint Schema
Checkpoints are stored in `tasks` and `checkpoints` tables. A checkpoint contains:
1. **Objective:** Clean, one-sentence statement of what is being built or fixed.
2. **Confirmed Findings:** Concrete code paths, lines, and verified facts.
3. **Decisions Made:** Architectural choices agreed upon during the session.
4. **Verification Evidence:** Exact test commands and stdout exit codes validating the changes.
5. **Next Action:** Single, unambiguous next step for the subsequent session.
6. **Working Tree Fingerprint:** Hash of Git status at the time of checkpointing.

### 7.2 Staleness Detection
When `ctx task resume <id>` is called:
1. The current working-tree fingerprint is computed.
2. If the current Git commit or dirty file hashes differ from the checkpoint:
   - Checkpoint evidence matching modified files is flagged as `STALE_EVIDENCE`.
   - The CLI issues a non-blocking diagnostic indicating which referenced files have drifted since the checkpoint was saved.

### 7.3 Intent Layer (`intent.md`)
Ported from DevPulse (`goals.md`), ContextForge establishes a durable, user-owned intent file at `<user config dir>/contextforge/instructions/intent.md` with sections:
- `## Now` (Current milestone goals)
- `## Next` (Immediate backlog)
- `## Deadlines` (Time-sensitive target dates, parsing `-` and `—` separators)
- `## Someday` (Future conceptual backlog)

---

## 8. CLI Contract & UX Taxonomy

The public CLI command is `ctx`. The CLI implements a unified taxonomy resolving all naming drift between ContextForge and DevPulse specifications.

### 8.1 Command Taxonomy Table

| Command Group | Command | Description | Key Flags |
|---|---|---|---|
| **System** | `ctx init` | Initialize global directories, config, and SQLite migrations | `--force` |
| | `ctx doctor` | Check runtime, database integrity, git, and adapters | `--repair` |
| **Instructions** | `ctx instructions sync` | Synchronize managed instruction blocks across harnesses | `--dry-run` |
| | `ctx instructions check`| Read-only check for configuration drift in harnesses | `--json` |
| **Repositories** | `ctx repos register` | Register a Git repository in the local registry | `[path]`, `--name <NAME>` |
| | `ctx repos unregister` | Unregister a repository from the registry | `<repo>`, `--force`, `--keep-data` |
| | `ctx repos list` | List all registered repositories | `--json` |
| | `ctx repos status` | Display Git branch, dirty files, and index generation | `[repo]` |
| | `ctx repos fuzzy` | Inspectable fuzzy resolution for repository names | `<query>` |
| **Index & Search** | `ctx index` | Incrementally index repository files, symbols, chunks | `[repo]`, `--force` |
| | `ctx search` | Fast lexical search across indexed files and symbols | `<query>`, `[repo]`, `--limit <N>` |
| | `ctx context` | Assemble bounded context package within token budget | `<query>`, `--budget <N>`, `[repo]` |
| **Task Memory** | `ctx task start` | Start a new tracked development task | `<title>`, `[repo]` |
| | `ctx task resume` | Display task state, verifying checkpoint freshness | `<id>` |
| | `ctx checkpoint` | Record verified objective, findings, and next steps | `<id>`, `--interactive` |
| **Intent** | `ctx intent show` | Parse and display structured goals from `intent.md` | `--json` |
| | `ctx intent edit` | Open user-owned `intent.md` in `$EDITOR` | |
| **Health** | `ctx health` | Deterministic health check (unmerged branches, staleness) | `[repo]` |
| | `ctx portfolio` | Portfolio summary across all registered repositories | `--json` |
| **Telemetry** | `ctx costs` | Aggregated token spend and costs (alias: `ctx stats`) | `--since <DUR>`, `--by <DIM>` |
| | `ctx cache` | Cache hit diagnostics and token savings breakdown | `--since <DUR>` |
| | `ctx sessions` | List recorded sessions with provenance tags | `--limit <N>`, `--json` |
| **Benchmarking** | `ctx bench` | Run or report scientific A/B benchmark suites | `run`, `report`, `--suite <S>` |
| **Maintenance** | `ctx clean` | Prune old index generations and vacuum database | `--scope <S>`, `--dry-run`, `--yes` |
| **Migration** | `ctx migrate devpulse`| Non-destructive migration of DevPulse config and notes | `--source <PATH>`, `--dry-run` |

### 8.2 Standardized Exit Codes
Every command adheres strictly to the standardized exit-code contract:
- `0` — Success; read-only check clean with no findings.
- `1` — Operational failure (unhandled I/O, disk failure, SQLite constraint error).
- `2` — Invalid arguments, unknown flags, or invalid user configuration.
- `3` — Required resource missing (not a Git repository, path does not exist).
- `4` — Completed with warnings, health findings, or partial migration results.
- `5` — Operation cancelled by user or interactive confirmation required without TTY.
- `6` — Storage integrity violation (corrupted database, failed migration validation).

### 8.3 Machine-Readable JSON Envelope
When `--json` is supplied, stdout contains exactly one JSON payload adhering to `schema_version: 1`:

```json
{
  "schema_version": 1,
  "command": "context",
  "ok": true,
  "status": "success",
  "data": {
    "estimated_tokens": 1840,
    "budget": 2048,
    "truncated": false,
    "selected": [
      {
        "path": "src/core/security/scanner.ts",
        "start_line": 42,
        "end_line": 98,
        "score": 0.892,
        "reason": "lexical"
      }
    ]
  },
  "warnings": [],
  "errors": []
}
```

---

## 9. Native Harness Integrations

ContextForge integrates with modern coding harnesses using each harness's native configuration mechanisms.

### 9.1 Harness Adapter Matrix

| Harness | Integration Point | ContextForge Role | Failure Mode |
|---|---|---|---|
| **T3 Code** | MCP Server / Native Tools (`preview_*`, child tasks) | Host environment; tool provider | Completely bypassed if disabled |
| **OpenCode** | Plugin / Tool Provider (`opencode.json`) | Exposes `search_codebase`, `get_checkpoint` | Harness operates with default search |
| **Codex CLI** | `AGENTS.md` / Instructions file | Injects global guidelines & CLI hints | Standard instruction fallback |
| **Claude Code** | `CLAUDE.md` / Post-command hooks | Compact instructions & checkpoint reminders | Hooks timeout safely in <500ms |

### 9.2 Safe Managed Instruction Synchronization
When executing `ctx instructions sync`:
- Target files (`CLAUDE.md`, `AGENTS.md`, `.opencode/instructions.md`) are updated **only** within clearly delineated comment blocks:
  ```markdown
  <!-- BEGIN CONTEXTFORGE MANAGED BLOCK -->
  # ContextForge Core Guidelines
  - Run `ctx search <query>` before full repo grep.
  - Save session state via `ctx checkpoint <id>`.
  <!-- END CONTEXTFORGE MANAGED BLOCK -->
  ```
- Any content outside these markers is left 100% byte-identical.
- Atomic write with `.tmp` file and rename prevents partial writes.

---

## 10. Usage, Cache & Cost Intelligence

ContextForge normalizes cost and cache telemetry across multiple coding harnesses.

### 10.1 Provenance Hierarchy
Every recorded `usage_event` row must record its explicit provenance:
1. `provider_reported`: Token counts directly returned in API response headers or bodies.
2. `harness_reported`: Values logged by the host harness.
3. `local_parsed`: Values extracted deterministically from standard local session logs.
4. `estimated`: Computed using ContextForge's internal token estimator and local pricing snapshots.

### 10.2 Pricing Snapshot Engine
- Model pricing tables are stored in JSON snapshots (`pricing_v1.json`).
- If an exact model price is unknown, the cost is recorded as `NULL` with provenance `unavailable`. ContextForge **never** invents prices or defaults unknown costs to zero.
- Costs are stored as integer micro-dollars (`cost_micros`) to eliminate IEEE 754 floating-point inaccuracies.

---

## 11. Comprehensive Phased Implementation Roadmap

The implementation roadmap harmonizes ContextForge's engineering phases with DevPulse's absorbed components. Total expected execution window: **20–35 engineering days**.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 0: Baseline Scaffold, Security Engine & Platform Discovery      │
│          (DevPulse regex scanner, PII vault, paths, git runner)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 1: CLI Foundation, Config, Multi-Repo Registry & Intent          │
│          (Command router, path resolver, repos registry, intent.md)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 2: SQLite Storage Engine, Migrations & Incremental Indexer       │
│          (DDL, transactions, WAL, file walker, chunks, FTS5)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 3: Lexical Search, Context Packaging & Task Checkpoint Memory    │
│          (BM25 ranking, budget packer, checkpoints, staleness)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 4: Native Harness Integrations, Health & Portfolio View          │
│          (OpenCode, Codex, Claude Code adapters, ctx health/portfolio) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 5: Usage Telemetry, Cache Diagnostics & Cost Analytics           │
│          (Event ingestion, provenance tracking, ctx costs/cache)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 6: Scientific Benchmarking Framework                             │
│          (A/B paired trial runner, work-per-dollar efficiency metrics) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 7: Release Hardening & `ctx migrate devpulse` Execution          │
│          (DevPulse import ledger, packaging, CI matrix, docs)          │
└────────────────────────────────────────────────────────────────────────┘
```

### Phase 0: Baseline Scaffold, Security Engine & Platform Discovery
- **Duration:** 2–3 Days
- **Prerequisites:** Clean repository, Node.js LTS, TypeScript 5.x.
- **Work Packages:**
  - Initialize project scaffold: `package.json`, `tsconfig.json`, ESLint, Prettier, Vitest.
  - Setup GitHub Actions CI matrix: Ubuntu LTS and Windows Server.
  - Port DevPulse security scanner to TypeScript: `src/core/security/secretScanner.ts`.
  - Port sensitive path rules: `src/core/security/paths.ts`.
  - Port PII detection and placeholder vault: `src/core/security/pii.ts`.
  - Implement safe, bounded Git runner: `src/core/gitstate/gitRunner.ts` (timeouts, disabled fsmonitor/textconv).
  - Implement ordered-part SHA-256 fingerprint utility: `src/core/fingerprint/hasher.ts`.
- **Exit Criteria:**
  - 100% test parity on DevPulse security test fixtures.
  - Zero network activity verified in unit test suite.
  - CI passes cleanly on both Ubuntu and Windows.

### Phase 1: CLI Foundation, Config, Multi-Repo Registry & Intent
- **Duration:** 2–3 Days
- **Prerequisites:** Phase 0 complete.
- **Work Packages:**
  - Implement CLI entry point and argument parsing: `src/cli/index.ts`.
  - Implement cross-platform path resolution & atomic config writer: `src/config/paths.ts`, `src/config/manager.ts`.
  - Implement repository registry & fuzzy name resolver: `src/core/registry/repoRegistry.ts`.
  - Implement `intent.md` parser and template scaffold: `src/core/intents/intentParser.ts`.
  - Implement commands: `ctx init`, `ctx doctor`, `ctx repos register/unregister/list/fuzzy`, `ctx intent show/edit`.
- **Exit Criteria:**
  - `ctx init` creates user-level config and directories idempotently.
  - `ctx repos register` deduplicates canonical paths across Windows and POSIX systems.
  - Intent parser correctly parses `Now / Next / Deadlines / Someday` with both `-` and `—` date delimiters.

### Phase 2: SQLite Storage Engine, Migrations & Incremental Indexer
- **Duration:** 3–5 Days
- **Prerequisites:** Phase 1 complete.
- **Work Packages:**
  - Implement SQLite storage client (`better-sqlite3`) with WAL mode, busy timeout, and foreign keys: `src/storage/db.ts`.
  - Implement checksummed migration runner: `src/storage/migrator.ts` and Migration V1 schema.
  - Implement incremental file tree walker respecting `.gitignore` and sensitive paths: `src/indexer/walker.ts`.
  - Implement file chunker and regex symbol extractor: `src/indexer/chunker.ts`, `src/indexer/symbols.ts`.
  - Implement atomic index generation publisher: `src/indexer/publisher.ts`.
  - Implement command: `ctx index [repo] [--force]`.
- **Exit Criteria:**
  - Cold indexing of a 10,000-file repository completes in $<15$ seconds.
  - Incremental re-indexing with no file changes completes in $<1.0$ second.
  - Aborted indexing rolls back completely, leaving the existing index generation intact.

### Phase 3: Lexical Search, Context Packaging & Task Checkpoint Memory
- **Duration:** 3–5 Days
- **Prerequisites:** Phase 2 complete.
- **Work Packages:**
  - Implement SQLite FTS5 lexical search query builder: `src/context/search.ts`.
  - Implement multi-signal ranking function ($0.45L + 0.20P + 0.15G + 0.10T + 0.10I$): `src/context/ranker.ts`.
  - Implement hard-budget greedy context packer: `src/context/packer.ts`.
  - Implement task lifecycle and versioned checkpoint engine: `src/memory/taskManager.ts`.
  - Implement working-tree staleness detector: `src/memory/staleness.ts`.
  - Implement commands: `ctx search`, `ctx context`, `ctx task start/resume`, `ctx checkpoint`.
- **Exit Criteria:**
  - Context packaging strictly adheres to requested token budgets (2k/4k/8k) with zero budget overruns.
  - Deterministic search ordering across identical runs.
  - Modifying a file invalidates checkpoint evidence for that specific file.

### Phase 4: Native Harness Integrations, Health & Portfolio View
- **Duration:** 3–5 Days
- **Prerequisites:** Phase 3 complete.
- **Work Packages:**
  - Implement OpenCode tool bridge (`search_codebase`, `get_checkpoint`): `src/integrations/opencode/`.
  - Implement Codex instruction injector and skill hooks: `src/integrations/codex/`.
  - Implement Claude Code `CLAUDE.md` sync and safe hook handlers: `src/integrations/claude-code/`.
  - Port DevPulse deterministic health rules (unmerged branches, stale branches >14 days, TODO/FIXME counters): `src/health/healthChecker.ts`.
  - Implement portfolio summary across all registered repositories: `src/health/portfolio.ts`.
  - Implement commands: `ctx instructions sync/check`, `ctx health`, `ctx portfolio`.
- **Exit Criteria:**
  - Instruction sync modifies only delineated comment blocks, preserving user custom instructions.
  - Simulated harness hook timeout fails gracefully in $<500$ms without disrupting harness execution.
  - Health checks match DevPulse outputs on identical Git test fixtures.

### Phase 5: Usage Telemetry, Cache Diagnostics & Cost Analytics
- **Duration:** 2–4 Days
- **Prerequisites:** Phase 4 complete.
- **Work Packages:**
  - Implement telemetry event ingestion pipeline: `src/telemetry/ingest.ts`.
  - Implement pricing table snapshots and micro-dollar arithmetic: `src/telemetry/pricing.ts`.
  - Implement cache diagnostic analyzer: `src/telemetry/cacheDiagnostics.ts`.
  - Implement commands: `ctx costs` (alias `ctx stats`), `ctx cache`, `ctx sessions`.
- **Exit Criteria:**
  - Telemetry strictly separates `provider_reported` from `estimated` costs.
  - No prompt bodies, code snippets, or user credentials ever enter the telemetry tables.
  - Aggregated cost totals reconcile exactly with event line items.

### Phase 6: Scientific Benchmarking Framework
- **Duration:** 2–4 Days
- **Prerequisites:** Phases 2–5 complete.
- **Work Packages:**
  - Implement benchmark trial runner: `src/bench/runner.ts`.
  - Define standard 20-task benchmark suite (bug fixes, refactoring, new feature additions): `tests/benchmarks/suites/`.
  - Implement A/B/C comparative trial protocol:
    - Condition A: Pure baseline harness (no ContextForge).
    - Condition B: Harness with ContextForge shared instructions.
    - Condition C: Harness with full ContextForge (instructions + index + context + checkpoints).
  - Implement command: `ctx bench run/report`.
- **Exit Criteria:**
  - Benchmark reports compute $\frac{\text{Total Cost}}{\text{Successful Task}}$ with variance and confidence intervals.
  - Overhead of ContextForge indexing and retrieval is accurately subtracted from harness runtimes.

### Phase 7: Release Hardening & `ctx migrate devpulse` Execution
- **Duration:** 2–3 Days
- **Prerequisites:** All prior phases complete.
- **Work Packages:**
  - Implement `ctx migrate devpulse`: `src/migration/devpulse/migrator.ts`.
  - Read `~/.devpulse/config.toml`, `goals.md`, and `notes/*.md`.
  - Populate `repositories`, `checkpoints`, and `intent.md` transactionally.
  - Verify import ledger prevents duplicate re-imports.
  - Conduct full security review and GPL-3.0 license validation.
  - Finalize npm packaging (`npm pack`), binary distributions, and documentation.
- **Exit Criteria:**
  - `ctx migrate devpulse --dry-run` accurately plans migration without writing to disk.
  - Re-running migration is a safe no-op.
  - Zero data loss: `~/.devpulse/` source directory is left untouched.

---

## 12. Testing, Benchmarking & Validation Strategy

A rigorous test pyramid guarantees enterprise stability across platforms.

```
       ┌───────────────────────────────┐
       │     Scientific Benchmarks     │  (20 real tasks, A/B/C testing)
       ├───────────────────────────────┤
       │  Harness E2E Simulations      │  (OpenCode, Codex, Claude Code stubs)
       ├───────────────────────────────┤
       │    Integration Test Suite     │  (SQLite WAL, Git fixtures, Migrations)
       ├───────────────────────────────┤
       │      Unit Test Matrix         │  (Vitest: >80% floor, 100% security)
       └───────────────────────────────┘
```

### 12.1 Coverage Mandates
- **Overall Codebase:** Minimum 80% statement coverage.
- **Security & Redaction (`src/core/security/*`):** 100% branch and statement coverage.
- **Migration & Cleanup (`src/migration/*`, `src/cli/commands/clean.ts`):** 100% branch coverage with automated rollback verification.

### 12.2 Zero-API-Key Harness Simulation
All integration and harness tests run entirely offline with mocked process boundaries:
- OpenCode tool bridge is tested using synthetic JSON-RPC tool calls.
- Codex instructions are tested by verifying file placement and content integrity.
- Claude Code hooks are tested using stub executables and timeout simulators.

---

## 13. `ctx migrate devpulse` Specification

The migration utility provides a seamless, non-destructive bridge for existing DevPulse users.

### 13.1 Migration Pipeline
```
[Locate ~/.devpulse/ (or $DEVPULSE_CONFIG)]
                │
                ▼
[Read config.toml] ──► Parse registered repos ──► Insert into `repositories`
                │
                ▼
[Read goals.md] ──► Check if intent.md exists?
                │   ├── (No)  ──► Copy to intent.md
                │   └── (Yes) ──► Write to intent.devpulse.md (Preserve user file)
                │
                ▼
[Read notes/*.md] ──► Map note to repo ──► Insert into `checkpoints`
                      (labeled 'source: devpulse-import', capped at 16 KB)
                │
                ▼
[Record Source File Hashes in `migration_ledger`]
                │
                ▼
[Emit Summary Report (Imported / Skipped / Warnings)]
```

### 13.2 Safety Guarantees
- The source `~/.devpulse/` directory is **never modified or deleted**.
- If any transaction fails, SQLite rolls back completely.
- Running `ctx migrate devpulse` repeatedly is idempotent: previously imported files recorded in `migration_ledger` are skipped.

---

## 14. Master Risk Register & Operational Resilience

| Risk Event | Severity | Probability | Concrete Mitigation Strategy |
|---|---|---|---|
| **Secret scanner regex false negative** | Critical | Medium | Multi-layer defense: sensitive path denial *before* reading, regex scanning *before* storage, and output redaction *before* display. |
| **Windows NTFS file locking / ACL mismatch** | High | High | Use Node-native path canonicalization (`fs.realpath`), forward-slash normalization, temporary file rename retries, and Windows ACL best-effort checks during `ctx doctor`. |
| **SQLite database lock contention** | High | Low | Enable WAL mode (`PRAGMA journal_mode=WAL`), busy timeout set to 5000ms, and keep index file parsing completely outside of database transactions. |
| **Large repository indexing memory spike** | High | Medium | Hard file size cap (2 MB); stream large directories; use fast-path `mtime + size` check to avoid computing SHA-256 on unchanged files. |
| **Host coding harness changes its API** | Medium | High | Adapters remain thin, modular, and optional. If a harness changes its schema, the adapter fails gracefully with a logged warning, allowing the developer to continue coding normally. |
| **Inaccurate token savings claims** | High | Medium | Strict telemetry provenance separation: `provider_reported` vs `estimated`. Benchmarks report task success rates alongside costs to prevent cheap, broken code from appearing efficient. |
| **Scope creep (re-introducing LLM features)** | High | Medium | Strict architectural guardrail: zero LLM dependencies in the core. Any future experimental LLM features must live in an isolated, opt-in post-MVP extension package. |

---

## 15. Immediate First Milestone: Developer First Week (Days 1–5)

To establish immediate project velocity, a newly onboarded engineer executes the following five-day sprint:

- **Day 1: Project Scaffold & Security Engine Port**
  - Setup TypeScript repository, Vitest, ESLint, GitHub Actions CI.
  - Port DevPulse secret scanner regex table, sensitive paths, and PII placeholder vault.
  - Validate with 100% passing tests on security fixtures.
- **Day 2: Path Resolver, Config & CLI Skeleton**
  - Implement cross-platform path resolution and atomic config writer.
  - Implement CLI router and commands: `ctx init`, `ctx doctor`.
  - Validate idempotent directory and config generation.
- **Day 3: Multi-Repo Registry & Safe Git Runner**
  - Implement SQLite database connection and Migration V1 schema.
  - Implement `ctx repos register/unregister/list/fuzzy`.
  - Implement bounded Git runner with timeout and disabled fsmonitor.
- **Day 4: Incremental File Indexer & FTS5 Chunker**
  - Implement tree walker respecting `.gitignore` and sensitive paths.
  - Implement file chunker, regex symbol extractor, and FTS5 table population.
  - Implement `ctx index` and verify $<1.0$s incremental no-change pass.
- **Day 5: Search, Hard-Budget Retrieval & Local Workflow Verification**
  - Implement BM25 lexical ranking and greedy context budget packer.
  - Implement `ctx search` and `ctx context --budget 2048`.
  - Run end-to-end verification of local indexing and retrieval workflow.

---
*End of Master Implementation Plan.*
