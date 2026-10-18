# ContextForge --- Local AI Coding Efficiency Layer

## Detailed Implementation Plan and Engineering Specification

**Document version:** 1.0\
**Date:** 16 October 2026\
**Status:** Proposed implementation plan\
**Working name:** ContextForge\
**Primary environment:** T3 Code with OpenCode, Codex, and Claude Code\
**Deployment model:** Local-first, cross-platform, zero recurring
service cost

------------------------------------------------------------------------

## 1. Executive Summary

ContextForge is a lightweight local developer tool designed to improve
the amount of correct, verified engineering work completed per unit of
AI cost. It complements existing coding harnesses rather than replacing
them or introducing another autonomous agent.

The system provides shared coding instructions, incremental repository
intelligence, targeted context retrieval, compact task checkpoints, cost
and cache diagnostics, and deterministic verification support. It uses
local computation wherever possible and does not require a hosted
database, cloud service, local LLM, embedding model, or additional LLM
calls.

The initial architecture consists of a TypeScript/Node.js CLI, a shared
local core, SQLite storage, and thin native adapters for OpenCode,
Codex, and Claude Code. A proxy is explicitly deferred unless
measurement demonstrates that native integration cannot provide required
observability or control. A dashboard is also deferred until the CLI
demonstrates measurable value.

### 1.1 Product objective

Maximize **correct, verified engineering work per unit of total cost**,
including provider charges and engineering overhead.

The tool must: - Reduce repeated explanations and redundant discovery. -
Reduce irrelevant context and avoid repeated repository scans. -
Preserve task state across sessions without retaining entire
conversations. - Improve the consistency of coding instructions across
supported harnesses. - Measure actual costs and cache behavior where
provider or harness data is available. - Reduce retries and regressions
through targeted verification. - Run locally with minimal CPU, RAM,
disk, and operational overhead. - Remain optional: if ContextForge fails
or is disabled, the coding harness must continue working normally.

### 1.2 Non-goals

The MVP will not: - Train or fine-tune models. - Run a local LLM or
embedding model. - Require a vector database. - Become a multi-agent
orchestration framework. - Replace T3 Code, OpenCode, Codex, or Claude
Code. - Replace existing model authentication or billing. - Intercept
all requests through a proxy. - Automatically rewrite application source
code. - Automatically commit, push, deploy, or perform destructive
operations. - Claim token savings that have not been measured.

------------------------------------------------------------------------

## 2. Product Principles

1.  **Optimize successful work, not token counts in isolation.** A
    cheaper response that introduces defects is not an improvement.
2.  **Local-first by default.** The core must work offline after
    installation, apart from optional package updates and the user's
    existing model-provider traffic.
3.  **No additional LLM calls in the core.** Indexing, retrieval,
    configuration, state management, and telemetry normalization are
    deterministic.
4.  **Native integration first.** Use supported interfaces provided by
    each harness. Add a proxy only when evidence justifies it.
5.  **Incremental work.** Recompute only what has changed.
6.  **Explicit provenance.** Distinguish provider-reported values,
    harness-reported values, parsed values, and estimates.
7.  **Memory is not truth.** Current source code, tests, and observed
    tool results take precedence over stored checkpoints.
8.  **Small core, thin adapters.** Avoid unnecessary abstraction,
    microservices, event buses, and plugin frameworks.
9.  **Safe by default.** Preserve existing configuration and user
    changes; require confirmation for destructive actions.
10. **Measurable feature value.** Retain a feature only when repeatable
    benchmarks show that its benefit exceeds its overhead.

------------------------------------------------------------------------

## 3. Scope and Release Strategy

### 3.1 MVP capabilities

-   Global instruction source and safe synchronization.
-   CLI initialization and diagnostics.
-   Git-aware incremental repository index.
-   File and symbol search.
-   Deterministic context retrieval with a hard budget.
-   Evidence-backed task checkpoints.
-   Native integrations for OpenCode, Codex, and Claude Code.
-   Usage and cache analytics from available sources.
-   Benchmark runner for comparing baseline and optimized workflows.
-   Recovery, cleanup, and integration-disablement commands.

### 3.2 Deferred capabilities

-   Local web dashboard.
-   Request proxy or gateway.
-   Semantic answer cache.
-   Embedding-based retrieval.
-   Background daemon.
-   Automatic model routing.
-   Autonomous planning or multi-agent coordination.
-   Automatic source-code edits by ContextForge.

These features may be reconsidered only after the CLI and native
integrations demonstrate measurable benefit.

------------------------------------------------------------------------

## 4. Architecture Overview

### 4.1 Logical architecture

``` text
T3 Code
  |
  +-- OpenCode adapter
  +-- Codex adapter
  +-- Claude Code adapter
          |
          v
   ContextForge Core
   +-- Configuration and instruction sync
   +-- Repository indexer
   +-- Context retrieval
   +-- Task memory and checkpoints
   +-- Usage and cost analytics
   +-- Verification helpers
          |
          +-- SQLite database
          +-- Canonical local configuration
          +-- Git and filesystem
          |
          v
   Existing model providers
   (authentication, billing, and provider caching remain theirs)
```

### 4.2 Architectural rules

-   The core is a local TypeScript library, not a long-running server.
-   The CLI is the primary interface.
-   Adapters are optional.
-   The core must work when all agents are closed.
-   Indexing must not require a model call.
-   Context retrieval must be explicit or invoked only at meaningful
    points.
-   The tool must not inject large context automatically into every
    prompt.
-   Existing provider authentication and billing must remain untouched.
-   Every adapter must degrade gracefully if an event or metric is
    unavailable.
-   All generated configuration must be reproducible from canonical
    source files.

### 4.3 Process model

**MVP:** short-lived CLI processes, with no daemon. An invocation opens
the database, performs a bounded operation, commits results, and exits.

**Optional later:** a lightweight file watcher may be evaluated if
measurements show that on-demand incremental indexing is insufficient.
It must be opt-in and must not continuously consume significant CPU or
memory.

------------------------------------------------------------------------

## 5. Technology Stack

  -----------------------------------------------------------------------
  Layer                   Initial choice          Rationale
  ----------------------- ----------------------- -----------------------
  Language                TypeScript              Shared language for
                                                  CLI, core, and adapters

  Runtime                 Supported Node.js LTS   Cross-platform
                                                  filesystem and process
                                                  support

  CLI                     Commander or similarly  Simple commands, help,
                          small library           and argument validation

  Persistence             SQLite                  Local, transactional,
                                                  no database server

  Schema validation       Zod or equivalent       Validate config and
                                                  persisted input

  File discovery          Git + filesystem        Deterministic, no
                          traversal               external service

  Code parsing            Tree-sitter, introduced Structured symbol
                          selectively             extraction for priority
                                                  languages

  Tests                   Vitest or equivalent    Unit and integration
                                                  coverage

  Packaging               npm package initially   Simple installation and
                                                  updates

  Dashboard               None in MVP             Avoid unnecessary
                                                  runtime and maintenance
  -----------------------------------------------------------------------

Use the Node.js built-in SQLite implementation if it satisfies the
chosen runtime's stability and portability requirements. Otherwise use a
maintained SQLite binding. Hide storage behind a small internal
interface, not a broad database abstraction framework.

### 5.1 Dependency policy

-   Prefer Node.js built-ins when practical.
-   Add a dependency only when it materially reduces implementation or
    maintenance cost.
-   Pin compatible version ranges and commit the lockfile.
-   Avoid dependencies that require a separate service.
-   Keep the dependency tree auditable.
-   Test installation on supported Windows and Linux environments.
-   Do not assume every filesystem feature behaves identically on
    Windows and POSIX systems.

------------------------------------------------------------------------

## 6. Repository Layout

``` text
contextforge/
├── src/
│   ├── cli/
│   ├── config/
│   ├── core/
│   ├── indexer/
│   ├── context/
│   ├── memory/
│   ├── integrations/
│   │   ├── opencode/
│   │   ├── codex/
│   │   └── claude-code/
│   ├── telemetry/
│   ├── verification/
│   └── storage/
├── templates/
│   └── instructions/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── benchmarks/
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── integration-matrix.md
│   └── benchmark-methodology.md
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md
```

This is a logical target, not a mandate to create empty folders at
project kickoff. Create modules when their implementation phase begins.

------------------------------------------------------------------------

## 7. Module Responsibilities and Interfaces

### 7.1 `cli/`

Responsibilities: - Parse commands and arguments. - Validate user
input. - Format human-readable and machine-readable output. - Return
predictable exit codes. - Invoke core functions. - Keep interactive
setup optional.

It must not contain indexing algorithms, SQL queries, or
provider-specific behavior.

### 7.2 `config/`

Responsibilities: - Load and validate global configuration. - Load
repository overrides. - Maintain canonical instructions. - Render
harness-specific instruction/configuration files. - Detect drift. -
Apply safe synchronization and migration. - Preserve unrelated user
configuration.

### 7.3 `indexer/`

Responsibilities: - Detect repository root. - Apply ignore and exclusion
rules. - Discover files. - Calculate hashes. - Detect language. - Parse
supported files and symbols. - Extract imports and supported dependency
edges. - Invalidate stale records. - Publish successful index
generations transactionally.

### 7.4 `context/`

Responsibilities: - Accept a task query. - Rank relevant files and
symbols deterministically. - Retrieve dependency-adjacent files and
relevant tests. - Enforce a context budget. - Include source paths,
symbols, line ranges, and selection rationale. - Avoid silently dropping
critical evidence.

### 7.5 `memory/`

Responsibilities: - Create and update task checkpoints. - Track task
status and next action. - Store accepted decisions and unresolved
issues. - Link findings to source files, Git revisions, and test
evidence. - Mark checkpoints stale when relevant source state changes.

### 7.6 `integrations/`

Responsibilities: - Translate the shared core's capabilities into
supported harness interfaces. - Expose only a small set of useful
tools. - Collect lifecycle events only where supported and valuable. -
Keep adapter failures isolated from the agent's normal workflow. -
Provide a reliable disablement path.

### 7.7 `telemetry/`

Responsibilities: - Normalize token and usage records. - Preserve metric
provenance. - Estimate costs from explicit pricing snapshots. - Track
task outcomes, elapsed time, and tool-call counts where available. -
Avoid storing raw prompts or source code by default.

### 7.8 `verification/`

Responsibilities: - Identify changed files. - Suggest or run targeted
checks when explicitly requested or configured. - Record test commands
and their actual results. - Preserve failure output sufficiently for
diagnosis. - Never silently suppress a failing test.

### 7.9 `storage/`

Responsibilities: - Own SQLite schema and migrations. - Expose focused
repository operations. - Apply transactions and integrity checks. -
Handle backups, cleanup, and recoverable rebuilds. - Keep SQL and
storage concerns out of higher-level modules.

------------------------------------------------------------------------

## 8. Global Instructions and Configuration

### 8.1 Canonical configuration

Suggested user-level layout:

``` text
~/.contextforge/
├── config.json
├── instructions/
│   └── global.md
├── templates/
│   ├── opencode.md
│   ├── codex.md
│   └── claude-code.md
└── state/
    └── contextforge.db
```

Use the platform's conventional user configuration directory when
appropriate, especially on Windows. The paths above illustrate logical
ownership; the implementation must use a cross-platform path resolver.

### 8.2 Instruction layers

1.  **Global instructions:** stable engineering behavior and universal
    safety rules.
2.  **Repository instructions:** project architecture, stack,
    conventions, and commands.
3.  **Task checkpoint:** objective, completed work, decisions, blockers,
    and next action.
4.  **Retrieved context:** task-relevant source files, symbols, tests,
    and evidence.

Global instructions should remain concise. Detailed project conventions
belong in repository-specific instructions and should be used only where
relevant.

### 8.3 Example global instructions

``` markdown
# Engineering Rules

- Prioritize correctness, functionality, maintainability, readability, and performance.
- Inspect relevant code and existing conventions before editing.
- Make the smallest complete change; avoid unrelated refactors and dependencies.
- Reuse existing abstractions and follow established architecture.
- Handle relevant edge cases and failure paths; never invent APIs or placeholder implementations.
- Use targeted searches, file reads, and tests. Avoid repeating work already completed.
- Verify changes with appropriate tests, type checks, linting, or builds. Report checks actually run and their results.
- Preserve unrelated user changes. Never overwrite work you did not create.
- Keep context and tool output concise. Persist only material decisions, evidence, and unresolved work.
- Do not commit, push, deploy, delete data, or perform external writes without the required authorization.
- Summarize changes, verification, limitations, and the next step concisely.
```

### 8.4 Synchronization requirements

-   `ctx init` creates only missing files and directories.
-   `ctx instructions sync` is idempotent.
-   `ctx instructions check` reports drift without modifying files.
-   Existing files are never blindly overwritten.
-   Generated sections should be clearly marked where a harness requires
    a managed file.
-   Where a harness supports a reference or import, prefer it to copying
    the entire global ruleset.
-   Where copying is unavoidable, store the source hash and generated
    version.
-   Back up files before a confirmed replacement.
-   Provide a dry-run mode.
-   Keep user-authored sections outside generated regions.

### 8.5 Global versus project-specific ownership

Do not create a new `AGENTS.md` for every task or session. Maintain a
canonical global instruction source and let each harness use its
supported global configuration. Repository-specific instructions remain
in the repository and are not regenerated from global settings.

------------------------------------------------------------------------

## 9. Repository Indexing

### 9.1 Initial indexing algorithm

1.  Locate the Git root or explicitly selected project root.
2.  Load ignore rules and ContextForge exclusions.
3.  Discover candidate files.
4.  Exclude generated, binary, dependency, build, and sensitive files.
5.  Compute content hashes.
6.  Compare hashes against stored file records.
7.  Parse only changed or new files.
8.  Remove records for deleted files.
9.  Update symbol and dependency records.
10. Commit the new index state transactionally.

### 9.2 Incremental behavior

-   Unchanged files should not be reparsed.
-   Changed files invalidate their own symbol records and any derived
    metadata dependent on them.
-   Deleted files and symbols must disappear from retrieval.
-   A failed index operation must not publish a partial index as
    current.
-   The system should track index generation and timestamps.
-   Use a full rebuild as a recoverable fallback when incremental state
    becomes inconsistent.

### 9.3 File exclusions

Exclude by default: - `.git/` - `node_modules/` - virtual environments -
build output and generated bundles - coverage output - binary files -
large vendored dependencies - known secret files and credential
patterns - files matched by user-provided exclusion rules

Respect `.gitignore` and relevant harness ignore files. Do not assume
ignore files are security boundaries. Use explicit sensitive-file
exclusions and never print file contents merely to diagnose exclusions.

### 9.4 Symbol indexing

Start with file metadata and lexical search. Add Tree-sitter parsers
only for the languages that appear in the user's active repositories.
Capture: - symbol name - symbol kind - file path - start/end lines -
parent symbol when available - imports/references where supported -
parser version or index schema version

Do not attempt perfect whole-program static analysis in the MVP. Partial
dependency edges must be labeled as partial rather than treated as
complete call graphs.

------------------------------------------------------------------------

## 10. Context Retrieval

### 10.1 User experience

Example:

``` bash
ctx context "add pagination to the customers API" --budget 4000
```

The command returns a compact context package rather than a
whole-repository dump.

### 10.2 Candidate selection

Prioritize: 1. Direct lexical matches in symbols and paths. 2. Entry
points related to the requested feature. 3. Directly referenced
services, types, and schemas. 4. Existing implementations of similar
patterns. 5. Relevant tests and fixtures. 6. Repository instructions
relevant to the affected area.

### 10.3 Ranking model

Use normalized, deterministic signals:

`score = w1 * lexical + w2 * dependency + w3 * test_type + w4 * path_symbol`

Where: - `lexical` measures query-to-file/symbol match. - `dependency`
measures proximity through known imports or references. - `test_type`
captures related tests and types. - `path_symbol` captures entry points
and structurally relevant names.

Weights are provisional and must be tuned using benchmark results. Do
not claim that the ranking is universally optimal.

### 10.4 Budget handling

-   Enforce a hard upper bound.
-   Prefer file and symbol summaries plus line ranges over dumping large
    files.
-   Never silently omit a high-confidence dependency or relevant test
    just to fit a budget.
-   Explain when the requested budget is too small for the evidence.
-   Estimate tokens using a local tokenizer only if a suitable tokenizer
    is available without adding material runtime cost; otherwise provide
    a conservative character-based estimate labeled as an estimate.
-   Let the agent request additional context on demand.

### 10.5 Explainability

Each selected item should include: - path - symbol or line range -
reason selected - content hash or revision marker - relevance score if
useful

The agent or user should be able to inspect why a file was selected and
exclude irrelevant results.

------------------------------------------------------------------------

## 11. Task Memory and Checkpoints

### 11.1 Purpose

Task memory avoids repeating discovery between sessions. It is a compact
record of verified state, not a transcript or an alternative source of
truth.

### 11.2 Checkpoint format

``` markdown
# Task: Add customer pagination

## Objective
Add cursor-based pagination to GET /customers.

## Confirmed findings
- Route: src/routes/customers.ts
- Query implementation: src/services/customers.ts
- Response convention: src/types/api.ts

## Decisions
- Reuse the existing cursor format.
- Preserve current filtering behavior.

## Verification
- Existing customer tests passed.
- Pagination boundary tests are pending.

## Next action
Implement cursor handling and add boundary tests.
```

### 11.3 Checkpoint update rules

-   Save at meaningful milestones, not after every file read.
-   Record only accepted decisions, evidence, current status, blockers,
    and next action.
-   Include repository identity, Git revision, working-tree fingerprint
    where feasible, and timestamps.
-   Link findings to paths, symbols, line ranges, and test results.
-   Mark potentially stale information as unverified after relevant
    source changes.
-   Never treat a remembered test result as proof that the current tree
    passes.
-   Keep checkpoint payloads small and structured.
-   Allow users to inspect, edit, export, and delete checkpoints.

### 11.4 Resume workflow

`ctx task resume <id>` should: 1. Load the checkpoint. 2. Validate
repository identity. 3. Compare stored revision and evidence references
with current state. 4. Mark stale findings. 5. Present a concise summary
and suggested next action. 6. Require the agent to inspect current
source before acting on stale assumptions.

------------------------------------------------------------------------

## 12. Data Model

Use one SQLite database per user with repository-scoped records. Use
explicit migrations and foreign-key constraints.

### 12.1 Tables

  -----------------------------------------------------------------------
  Table                   Key fields              Purpose
  ----------------------- ----------------------- -----------------------
  `repositories`          `id`, `root_path`,      Known repositories
                          `created_at`            

  `files`                 `repo_id`, `path`,      File state
                          `content_hash`,         
                          `language`,             
                          `size_bytes`,           
                          `indexed_at`            

  `symbols`               `file_id`, `name`,      Code symbols
                          `kind`, `start_line`,   
                          `end_line`              

  `edges`                 `source_symbol_id`,     Imports/dependency
                          `target_symbol_id`,     relations
                          `kind`                  

  `tasks`                 `id`, `repo_id`,        Task records
                          `title`, `status`,      
                          `created_at`,           
                          `updated_at`            

  `checkpoints`           `task_id`, `revision`,  Task snapshots
                          `payload_json`,         
                          `created_at`            

  `sessions`              `id`, `repo_id`,        Usage sessions
                          `harness`, `model`,     
                          `started_at`,           
                          `ended_at`              

  `usage_events`          `session_id`, `source`, Observed usage
                          token counts,           
                          `duration_ms`           

  `task_results`          `task_id`, `status`,    Outcomes
                          `verification_json`,    
                          `cost_estimate`         

  `schema_migrations`     `version`, `applied_at` Migration tracking
  -----------------------------------------------------------------------

### 12.2 Additional data requirements

Usage events should support: - input tokens - output tokens - reasoning
tokens when separately reported - cached input tokens - cache-write
tokens where applicable - provider-reported cost when available - model
identifier - provider and harness - event timestamp -
source/provenance - confidence or measurement type

### 12.3 Storage rules

-   Store metadata, not full source contents.
-   Do not store API keys or credentials.
-   Do not store full prompts by default.
-   Keep telemetry local.
-   Use transactions for index updates.
-   Apply retention limits to old telemetry and checkpoints.
-   Provide export and deletion commands.
-   Use WAL mode only if it helps the measured access pattern.
-   Maintain a recoverable database rebuild path.

------------------------------------------------------------------------

## 13. Native Integrations

Integration behavior must be verified against the actual installed
versions. Do not rely on undocumented internals.

### 13.1 OpenCode

Initial integration: - Global instructions and custom tools/plugin where
supported. - Three initial tools: 1. `search_codebase` 2.
`get_task_checkpoint` 3. `save_task_checkpoint` - Optional lifecycle
telemetry only when supported. - Explicit enable/disable
configuration. - Failure isolation: a broken ContextForge tool must not
prevent ordinary coding.

The CLI remains useful even if the OpenCode adapter is disabled.

### 13.2 Codex

Initial integration: - Global and hierarchical instruction support
through the native instruction mechanism. - Optional supported hooks
where available. - Explicit checkpoint commands. - Import usage from
supported local records only when accessible. - No assumptions that
every request, cache metric, or internal reasoning token is exposed.

### 13.3 Claude Code

Initial integration: - Native `CLAUDE.md` instructions and supported
settings/hooks. - Short, bounded hooks for useful events only. - No
repeated full-repository scans in hooks. - No automatic model calls. - A
disablement path that restores normal behavior.

### 13.4 T3 Code

Treat T3 Code as the host environment, not a model API.

-   Avoid undocumented T3 Code internals.
-   Validate native integrations when agents are launched from T3 Code.
-   Account for differing environment variables, working directories,
    and config isolation.
-   Keep the core independent of T3 Code.
-   If a direct integration point is unavailable, use supported agent
    configuration or CLI fallback.

### 13.5 Integration matrix

Maintain a tested matrix containing: - OS - Node.js version - harness
version - supported integration mechanism - instruction path or config
location - supported lifecycle events - available usage fields - known
limitations - last verified date

A missing metric or event must degrade gracefully, not break the
workflow.

------------------------------------------------------------------------

## 14. Cache and Cost Intelligence

### 14.1 Three separate mechanisms

**Local result reuse:** reuse deterministic outputs such as unchanged
file hashes and index metadata.

**Prompt-prefix reuse:** keep stable instructions and tool definitions
consistent where the native harness allows it; observe provider-reported
cache behavior.

**Cost attribution:** associate usage with sessions and task outcomes,
using actual costs where available and transparent estimates otherwise.

### 14.2 Cache-friendly request behavior

-   Avoid gratuitous changes to stable instructions.
-   Avoid reordering tool definitions without reason.
-   Keep dynamic task content after stable content where the
    harness/provider permits.
-   Track model and configuration changes.
-   Do not claim that local software can force a provider cache hit.
-   Do not assume that cached tokens have the same pricing across
    providers or models.

### 14.3 Cost calculation

For each session: - Use provider-reported costs when available. -
Otherwise calculate an estimate from token counts and a versioned
pricing snapshot. - Apply cached-input and cache-write rates only when
applicable and known. - Record the pricing source and effective date. -
Mark unknown costs as unknown rather than zero.

### 14.4 Proxy decision gate

Do not implement a proxy in the MVP.

Consider a proxy only if: 1. Native integrations cannot expose necessary
metrics or control. 2. A supported endpoint configuration exists for the
relevant harness. 3. A prototype preserves authentication, streaming,
tool calls, errors, and cancellation. 4. Benchmarks show meaningful
improvement over native integration. 5. It can be disabled without
changing normal behavior. 6. The user explicitly configures any routing
or credential behavior.

Do not intercept subscription authentication flows or reroute requests
without explicit consent.

### 14.5 Semantic caching policy

Do not cache and replay old coding answers merely because a new task
appears similar. Coding answers depend on exact source state,
dependencies, test expectations, and environment. Reuse deterministic
local results first.

------------------------------------------------------------------------

## 15. Telemetry and Benchmarking

### 15.1 Metrics to collect

Where available: - input/output/reasoning tokens - cached input and
cache-write tokens - actual provider cost - model and harness - session
duration - tool-call count - repeated file reads/searches - indexing
duration - retrieval latency - task success - tests passed/failed -
number of agent retries - human interventions - optimizer CPU, memory,
and disk use

### 15.2 Data provenance

Every metric must identify whether it is: - provider-reported -
harness-reported - parsed from a supported local record - estimated

Do not mix estimates with actual values in aggregate reports without
clear labeling.

### 15.3 Benchmark task set

Start with 15--30 representative tasks from real repositories: - small
bug fixes and validation changes - medium API or frontend features -
multi-file changes and debugging tasks

Each benchmark task must include: - a fixed task specification -
repository baseline/revision - acceptance criteria - test commands -
allowed model/harness settings - success rubric - a record of actual
changes and final outcome

### 15.4 Experimental configurations

  -----------------------------------------------------------------------
  Configuration                       Description
  ----------------------------------- -----------------------------------
  A --- Baseline                      Existing workflow without
                                      ContextForge optimizations

  B --- Instructions                  Shared instructions and safe sync

  C --- Full MVP                      Instructions, indexing, retrieval,
                                      memory, and applicable native
                                      integrations
  -----------------------------------------------------------------------

Use paired trials on the same tasks. Keep model and settings comparable.
Randomize execution order when practical. Repeat tasks with high
variance. Avoid selecting only tasks that favor the new tool.

### 15.5 Primary metric

`Cost per successful task = total task cost / number of successfully completed tasks`

Include actual provider costs when available. Report incomplete tasks
and task success rates separately so a system cannot appear cheaper
merely by failing more often.

### 15.6 Supporting metrics

-   Median completion time
-   Total token usage
-   Cache hit rate where reported
-   Number of retries
-   Human intervention
-   Test and acceptance pass rates
-   Regressions
-   Optimizer CPU/RAM/disk overhead

Cache hit rate:

`cached input tokens / total input tokens`

Track cache writes and actual pricing separately. Higher cache hit rate
does not automatically imply lower total cost.

------------------------------------------------------------------------

## 16. Security and Reliability

### 16.1 Security requirements

-   Exclude credential files and known secret patterns by default.
-   Do not retain raw prompts or source snippets in telemetry by
    default.
-   Never modify provider credentials or authentication settings
    automatically.
-   Preserve uncommitted work.
-   Do not modify source files during indexing or read-only diagnostics.
-   Validate configuration and database input.
-   Do not perform network traffic except explicit package operations
    and existing provider traffic.
-   Require confirmation for destructive cleanup.
-   Do not commit, push, deploy, or make external writes automatically.
-   Avoid exposing source paths or telemetry in public logs.

### 16.2 Reliability requirements

-   Interrupted indexing is recoverable.
-   Index updates are transactional.
-   Database migrations are versioned.
-   Database corruption triggers a clear diagnostic and rebuild option.
-   Adapter errors do not break the underlying agent.
-   Hooks have bounded runtime.
-   Commands have predictable exit codes.
-   Cleanup and export operations are explicit.
-   A disabled adapter leaves the harness usable normally.

------------------------------------------------------------------------

## 17. CLI Contract

The following is the proposed command interface.

  -----------------------------------------------------------------------
  Command                             Purpose
  ----------------------------------- -----------------------------------
  `ctx init`                          Initialize global configuration and
                                      storage

  `ctx doctor`                        Diagnose runtime, paths,
                                      integrations, and permissions

  `ctx instructions sync`             Safely synchronize instructions

  `ctx instructions check`            Detect drift without modifying
                                      files

  `ctx index`                         Incrementally index current
                                      repository

  `ctx status`                        Show repository and integration
                                      status

  `ctx search <query>`                Search indexed files and symbols

  `ctx context <query> --budget N`    Produce bounded, relevant context

  `ctx task start <title>`            Start a task

  `ctx task resume <id>`              Validate and display a checkpoint

  `ctx checkpoint <id>`               Save a task checkpoint

  `ctx stats`                         Show usage, cache, and cost data

  `ctx sessions`                      List recorded sessions

  `ctx benchmark`                     Run or summarize benchmark trials

  `ctx clean`                         Remove selected local state after
                                      confirmation
  -----------------------------------------------------------------------

### 17.1 Example workflow

``` bash
# One-time setup
ctx init
ctx doctor
ctx instructions sync

# In a project
cd my-project
ctx index
ctx status

# Before a substantial task
ctx task start "Add customer pagination"
ctx context "Add cursor pagination to the customers API" --budget 4000

# After a meaningful milestone
ctx checkpoint <task-id>

# Review usage and outcomes
ctx stats
ctx benchmark
```

Do not require users or agents to run every command before every task.
Indexing is incremental; checkpoints are milestone-based; context
retrieval is used only when it provides value.

### 17.2 CLI output requirements

-   Human-readable output by default.
-   Optional JSON output for scripts and integrations.
-   Clear errors with recovery steps.
-   No secrets in diagnostics.
-   Stable exit codes.
-   Explicit labels for unavailable or estimated metrics.
-   Quiet mode for automation.
-   Verbose/debug mode that remains privacy-safe.

------------------------------------------------------------------------

## 18. Phased Implementation Plan

The estimates below assume one developer, a deliberately narrow MVP, and
use of existing harnesses. They are planning estimates, not guarantees.

### Phase 0 --- Baseline and technical discovery

**Estimate:** 1--2 days

**Objectives** - Establish a measurable baseline. - Verify integration
mechanisms and usage visibility. - Define supported OS/runtime
versions. - Select benchmark tasks.

**Tasks** 1. Record the existing T3 Code workflow. 2. Verify OpenCode,
Codex, and Claude Code versions. 3. Determine how each harness loads
instructions and tools. 4. Determine what usage and cache metrics are
accessible. 5. Select 15--30 representative tasks. 6. Record existing
cost, completion time, retries, and outcomes. 7. Write an integration
compatibility matrix. 8. Define the first release's explicit exclusions.

**Deliverables** - Baseline report. - Integration matrix. - Benchmark
task definitions. - Initial configuration schema. - Risk register.

**Acceptance gate** - Task outcomes and elapsed time can be measured. -
Unknown token/cost metrics are documented. - No integration depends on
an unverified assumption.

### Phase 1 --- CLI and shared instructions

**Estimate:** 2--3 days

**Tasks** 1. Initialize the TypeScript project and test runner. 2.
Implement cross-platform configuration paths. 3. Define and validate
`config.json`. 4. Implement canonical global instructions. 5. Implement
safe instruction rendering for supported harnesses. 6. Add idempotent
sync and drift detection. 7. Add dry-run and backup behavior. 8. Add
`ctx init`, `ctx doctor`, and instruction commands. 9. Test against
existing user configuration fixtures. 10. Document manual recovery.

**Deliverables** - Working CLI. - Global instruction source. - Harness
templates/adapters. - Safe synchronization. - Automated tests.

**Acceptance gate** - Repeated sync produces no unnecessary changes. -
Existing files are preserved. - The tool does not require manual
re-creation of global instructions. - Disabling ContextForge does not
affect the existing agent workflow.

### Phase 2 --- Storage and incremental indexing

**Estimate:** 3--5 days

**Tasks** 1. Design SQLite schema and migrations. 2. Implement
repository discovery. 3. Implement ignore/exclusion handling. 4.
Implement file hashing and language detection. 5. Persist file metadata.
6. Implement incremental updates. 7. Implement deletion handling. 8. Add
symbol parsing for selected languages if justified. 9. Implement
transactional index generations. 10. Add index integrity and rebuild
commands. 11. Test Windows path handling and symlink behavior.

**Deliverables** - SQLite database. - `ctx index`, `ctx status`, and
`ctx search`. - Incremental index pipeline. - Rebuild and recovery
behavior.

**Acceptance gate** - Add/edit/delete scenarios update correctly. -
Unchanged files are not needlessly reparsed. - Failed indexing does not
publish a partial index as current. - Sensitive and generated files are
excluded.

### Phase 3 --- Retrieval and task memory

**Estimate:** 3--5 days

**Tasks** 1. Define a versioned checkpoint schema. 2. Implement task
lifecycle commands. 3. Store decisions, evidence, blockers, and next
action. 4. Implement lexical and path-based relevance. 5. Add
dependency-aware ranking where available. 6. Add test/type relevance. 7.
Enforce context budgets. 8. Include source references and selection
rationale. 9. Detect stale checkpoint evidence. 10. Benchmark retrieval
on selected tasks.

**Deliverables** - `ctx context`. - `ctx task start/resume`. -
`ctx checkpoint`. - Deterministic retrieval and stale-memory detection.

**Acceptance gate** - Retrieval is reproducible for the same index and
query. - Checkpoints can be inspected and edited. - Stale evidence is
marked rather than silently trusted. - Retrieval does not introduce
excessive overhead or reduce task correctness.

### Phase 4 --- Native integrations

**Estimate:** 3--5 days

**Tasks** 1. Implement the OpenCode integration using its supported
extension mechanism. 2. Expose code search and checkpoint tools. 3.
Implement Codex global instruction integration. 4. Add Codex hooks only
where the installed version supports them and a measured use case
exists. 5. Implement Claude Code instruction integration. 6. Add short,
optional Claude Code hooks if useful. 7. Keep each adapter independently
configurable. 8. Add adapter diagnostics. 9. Test invocation from T3
Code. 10. Test disablement and failure isolation.

**Deliverables** - Three optional adapters. - Supported integration
documentation. - Compatibility matrix. - Integration tests.

**Acceptance gate** - All adapters work through verified supported
mechanisms. - Missing optional features degrade gracefully. - Core
operations remain usable without any adapter. - No integration requires
extra model calls.

### Phase 5 --- Telemetry and cost analytics

**Estimate:** 2--4 days

**Tasks** 1. Define normalized session and usage event schemas. 2.
Ingest usage data from available supported sources. 3. Add provenance
fields. 4. Separate reported and estimated values. 5. Add versioned
model pricing snapshots. 6. Calculate cost estimates where possible. 7.
Track task success and verification evidence. 8. Add `ctx stats` and
`ctx sessions`. 9. Add retention and export controls. 10. Validate
aggregation against raw events.

**Deliverables** - Local usage history. - Cache and cost reporting where
available. - Task outcome records. - Provenance-aware analytics.

**Acceptance gate** - Metrics are never falsely presented as
provider-reported. - Estimates expose their assumptions. - Totals
reconcile with underlying events. - No secrets or raw prompts are
captured by default.

### Phase 6 --- Benchmarking and optimization

**Estimate:** 2--4 days

**Tasks** 1. Implement benchmark runner and task result format. 2. Run
baseline configuration A. 3. Run instruction-only configuration B. 4.
Run full MVP configuration C. 5. Compare correctness, cost, time, and
retries. 6. Profile indexing and retrieval. 7. Tune retrieval ranking.
8. Remove features that do not provide measurable value. 9. Write a
results report. 10. Decide whether any proxy investigation is justified.

**Deliverables** - Benchmark runner. - Comparative report. - Performance
profile. - Optimization decisions. - Release candidate.

**Acceptance gate** - Improvements are repeatable on relevant tasks. -
No material correctness regression is observed. - Resource overhead
stays within target. - No proxy is introduced without evidence.

### Phase 7 --- Release hardening

**Estimate:** 2--3 days

**Tasks** 1. Test installation and upgrades on supported systems. 2.
Validate database migrations. 3. Test interrupted operations and
recovery. 4. Test secret exclusions. 5. Test adapter disablement. 6.
Verify command exit codes and JSON output. 7. Write README and
troubleshooting docs. 8. Document privacy and telemetry behavior. 9. Tag
the release. 10. Publish a clear list of known limitations.

**Deliverables** - Release candidate and package. - Installation
guide. - Troubleshooting guide. - Security notes. - MVP acceptance
report.

**Acceptance gate** - Fresh installation works. - Upgrade and recovery
paths are tested. - Known limitations are documented. - All release
checklist items pass.

### Total planning estimate

Approximately **16--31 developer-days** for the full MVP, depending on
integration friction and how much usage data each harness exposes. A
narrower first useful release---shared instructions, CLI, index, and
task checkpoints---can be delivered earlier; do not wait for all
telemetry integrations to begin using it.

------------------------------------------------------------------------

## 19. MVP Acceptance Criteria

### Core and configuration

-   [ ] CLI installs and runs on supported Windows and Linux
    environments.
-   [ ] One canonical global instruction source is available.
-   [ ] Synchronization is idempotent.
-   [ ] Existing user configuration is preserved.
-   [ ] Drift is detectable without modification.
-   [ ] No model API key or external service is required by the core.

### Repository intelligence

-   [ ] Ignore rules and sensitive-file exclusions are respected.
-   [ ] Edits, additions, and deletions are handled correctly.
-   [ ] Incremental indexing avoids reparsing unchanged files.
-   [ ] Retrieval respects the configured budget.
-   [ ] Results include source references and selection rationale.
-   [ ] Stale indexes and checkpoints are detected.

### Integrations

-   [ ] OpenCode works through a supported native interface.
-   [ ] Codex uses supported instruction and optional hook mechanisms.
-   [ ] Claude Code uses supported instruction and optional hook
    mechanisms.
-   [ ] Each integration is optional.
-   [ ] Adapter failures do not break normal coding sessions.
-   [ ] The tool does not depend on undocumented T3 Code internals.

### Telemetry and quality

-   [ ] Provider-reported values are distinguished from estimates.
-   [ ] Cost calculations expose model and pricing assumptions.
-   [ ] Benchmarks include both successful and unsuccessful tasks.
-   [ ] Correctness is compared with a baseline.
-   [ ] Performance and memory overhead are measured.
-   [ ] Cache metrics are shown only when available.

### Security and operations

-   [ ] No source changes occur during indexing.
-   [ ] Interrupted operations are recoverable.
-   [ ] Destructive operations require confirmation.
-   [ ] Telemetry is local and privacy-preserving by default.
-   [ ] No mandatory daemon or recurring network traffic exists.
-   [ ] Integration disablement restores normal workflow.

------------------------------------------------------------------------

## 20. Performance and Efficiency Targets

These are initial engineering targets to validate against real
repositories:

  -----------------------------------------------------------------------
  Metric                              Initial target
  ----------------------------------- -----------------------------------
  Additional recurring service cost   ₹0

  Required extra LLM calls            0

  Required background process         0

  Idle CLI memory after exit          No persistent process

  No-change indexing                  Under 1 second on a typical medium
                                      repository, subject to measurement

  Additional idle memory              Not applicable without a daemon;
                                      optional watcher must be separately
                                      profiled

  Index correctness                   No stale records after successful
                                      edit/delete processing

  Instruction sync                    Idempotent

  Core offline capability             Yes, after installation

  Source changes during indexing      None

  Cache hit improvement               Measure; do not guarantee

  Cost per successful task            Target at least 15% lower median,
                                      or demonstrably more successful
                                      tasks at comparable cost

  Task completion time                Target at least 10% lower median on
                                      tasks targeted by retrieval/memory

  Correctness                         No material regression
  -----------------------------------------------------------------------

The 15% cost and 10% time goals are hypotheses to test, not promises. If
the full MVP does not meet them, retain only features that show clear
value.

------------------------------------------------------------------------

## 21. Risks and Mitigations

  -----------------------------------------------------------------------
  Risk                    Impact                  Mitigation
  ----------------------- ----------------------- -----------------------
  Harness APIs change     Adapter breaks          Keep adapters thin;
                                                  test versions; provide
                                                  CLI fallback

  Usage data unavailable  Incomplete cost         Mark missing fields;
                          analytics               support manual
                                                  benchmark records

  Retrieval misses        Incorrect               Include source
  important files         implementation          rationale; allow agent
                                                  follow-up; benchmark
                                                  relevance

  Stale checkpoint        Agent acts on old       Track revisions and
                          assumptions             evidence; mark stale
                                                  data

  Indexer consumes too    Slower development      Incremental hashing,
  many resources                                  selective parsing,
                                                  profiling

  Global instruction      Config drift            Canonical source,
  duplication                                     generated sections,
                                                  hash-based checks

  Proxy disrupts          Workflow failure        Defer proxy; require
  authentication or                               compatibility tests and
  streaming                                       explicit opt-in

  Over-optimization harms Regressions             Paired benchmarks,
  quality                                         acceptance tests, human
                                                  review

  Secret captured in      Security incident       Exclusions, safe
  index or logs                                   diagnostics, no raw
                                                  prompt logging

  Scope expands too       Delayed value           Phase gates; defer
  quickly                                         dashboard, embeddings,
                                                  and proxy

  Local database          Lost state              Transactions,
  corruption                                      migrations, integrity
                                                  checks, rebuild and
                                                  export
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 22. Future Dashboard

Do not build a dashboard until the CLI has proved value.

If needed later, build a local-only, read-only dashboard that reads the
existing SQLite database. It should not introduce a separate database or
background service by default.

Potential views: - Cost per successful task. - Token and cache breakdown
by harness/model. - Task duration and retries. - Benchmark
comparisons. - Index status and last update. - Checkpoint list and
stale-state warnings. - Integration health. - Local resource use.

Start it on demand, bind to loopback only, and avoid remote access by
default.

------------------------------------------------------------------------

## 23. Future Proxy Decision

A local proxy may eventually offer deeper request-level visibility, but
it adds significant complexity and risk. Do not build it simply to claim
universal caching or token optimization.

A proxy investigation requires: - A documented endpoint override
supported by the target harness. - Preserved authentication, streaming,
tool calling, cancellation, and error semantics. - No secret capture in
logs. - Explicit user configuration. - A clean bypass path. - A
measurable use case not solvable through native integration. - Benchmark
evidence of a meaningful benefit.

If these conditions are not met, do not implement a proxy.

------------------------------------------------------------------------

## 24. Development Workflow

1.  Maintain the implementation plan as the source of scope and
    acceptance criteria.
2.  Implement one phase at a time.
3.  Keep changes small and testable.
4.  Add unit tests for deterministic logic.
5.  Add integration fixtures for filesystem, database, and harness
    configuration.
6.  Run formatting, linting, type checking, and tests before each phase
    gate.
7.  Benchmark before changing ranking or caching behavior.
8.  Record design decisions and rejected alternatives briefly.
9.  Update documentation when commands or configuration schemas change.
10. Do not add speculative abstractions to anticipate hypothetical
    future providers.
11. Keep an explicit list of known limitations.
12. Do not mark a phase complete until its acceptance gate passes.

### Suggested definition of done for a feature

-   Requirements are clear.
-   Implementation is scoped and maintainable.
-   Tests cover normal, boundary, and failure behavior.
-   Errors are actionable.
-   Security implications are considered.
-   Documentation is updated.
-   Performance overhead is measured where relevant.
-   No unverified claims are made about cost or caching.

------------------------------------------------------------------------

## 25. Recommended First Milestone

The first milestone should be a small, useful tool---not the entire
architecture.

Build: 1. `ctx init` 2. Canonical global instructions 3. Safe sync and
drift detection 4. `ctx doctor` 5. SQLite setup 6. `ctx index` with file
hashes and exclusions 7. `ctx search` 8. A basic task checkpoint 9. A
baseline benchmark template

Defer: - Full symbol graph - Sophisticated retrieval ranking - Every
possible telemetry source - Dashboard - Proxy - Embeddings and semantic
caching

This first milestone should already reduce repeated instruction setup
and repository discovery. Its value can be measured before the project
expands.

------------------------------------------------------------------------

## 26. Final Engineering Recommendation

Build ContextForge as a small local CLI with a deterministic core and
thin native integrations. Focus on shared instructions, incremental
repository indexing, compact task memory, and transparent benchmarking
before attempting request interception or advanced semantic caching.

The key measure is **correct, verified engineering work per unit of
cost**. Token reduction is useful only when it contributes to that
outcome.

The product is successful if it lets the developer complete more work
with fewer repeated explanations, less context waste, fewer agent
retries, and no meaningful loss of correctness---while remaining cheap
to run, simple to maintain, and easy to disable.
