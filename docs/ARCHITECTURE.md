# Architecture

Weft is an ESM TypeScript CLI. `src/cli/index.ts` parses global flags and formats results; `src/cli/commands/index.ts` dispatches commands into the feature modules. Configuration and platform paths live in `src/config`; persistence and schema upgrades live in `src/storage`; shared security filtering lives in `src/core/security`.

## Data flow

Repository registration records a canonical local path. The indexer walks eligible repository files, filters sensitive and generated content, extracts chunks, and writes a new index generation into SQLite. Search ranks stored chunks; context packing selects and redacts bounded excerpts. MCP uses the same retrieval, packing, path validation, and security helpers as the CLI. Hooks call local task/session checkpoint logic against the same database.

## Index generations

Each index build is associated with a generation. Work is written under a non-ready generation; successful completion marks that generation ready and makes it current. Failed or interrupted generations remain distinguishable from the current ready generation and can later be removed with `weft clean`. This avoids exposing a partially built index to searches.

## Harness and MCP flow

`weft setup` detects existing user-level Claude Code, Codex, and OpenCode config directories, then adds Weft-owned hooks, MCP server entries, or managed instructions. The T3 target covers Claude Code and Codex. The MCP server communicates over stdio and exposes local search, context, safe file read, task checkpoint/resume, and health tools. Claude Code hooks run local session and stop/pre-compact actions; they do not contact a service.

## Storage layout

On Windows, config and managed instructions are under `%APPDATA%\weft`; the SQLite database (`weft.db`) and cache are under `%LOCALAPPDATA%\weft\state` and `%LOCALAPPDATA%\weft\cache`. On macOS/Linux these are under `$XDG_CONFIG_HOME/weft`, `$XDG_STATE_HOME/weft`, and `$XDG_CACHE_HOME/weft`, defaulting to `~/.config`, `~/.local/state`, and `~/.cache`. Database tables hold repositories, file/chunk indexes, index generations, tasks/checkpoints, and usage records. Source repositories are read from their registered paths; Weft's index and task state are stored separately.
