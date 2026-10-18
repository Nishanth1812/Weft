# Changelog

## 0.1.0

Initial version.

### CLI and repository work

- Added repository registration, indexing, search, context packing, health checks, portfolio summaries, tasks, intent, and verification commands.
- Added index cleanup, configuration migration from DevPulse, and retrieval/live benchmark commands.

### Harness integrations

- Added Claude Code hooks and setup/uninstall support for Claude Code, Codex, and OpenCode.
- Added a local MCP server with search, context, safe file reads, task checkpoints, resume, and health tools.

### Local storage and reporting

- Added a SQLite database for repository indexes, task checkpoints, and local usage records.
- Added local session, cache, cost, and stats reports with optional transcript ingestion.
