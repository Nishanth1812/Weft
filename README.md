# Weft

Weft is a local-first TypeScript CLI that indexes registered repositories, retrieves relevant code, and keeps task continuity data for supported coding harnesses. It stores its database, config, and cache on the local machine. It does not upload repository content or telemetry.

## Install

After the package is published, install it once with `npm install --global weft`. From a source clone, run `npm link` at the repository root. Both provide the `weft` command; on Windows, reopen the terminal if npm's global bin directory is not on `PATH`.

Run `weft --help` for the CLI's short command summary and `weft doctor` to inspect integration setup. `weft init` initializes local storage. `weft setup` configures supported harness integrations found under the current user home; it does not create missing harness directories or edit project files. It adds Weft-managed hooks, MCP entries, and instruction blocks while preserving unrelated settings. `weft setup --uninstall` removes Weft-managed entries and instruction blocks from those same integrations.

## Commands

The short list printed by `weft --help` is: `init`, `doctor`, `onboard`, `mcp`, `instructions`, `repos`, `index`, `search`, `context`, `task`, `intent`, `health`, `portfolio`, `costs` (also `stats`), `cache`, `sessions`, `bench`, `clean`, and `migrate devpulse`. The CLI also accepts `setup`, `auto on|off|status`, and `verify [--suggest|-- <command>]`, which are not currently shown in that help text. Several commands take subcommands; for example `weft bench retrieval`, `weft bench run`, `weft repos register`, and `weft task start`. Use `weft --help` for the global summary.

## Local data and privacy

Weft's state is local. The normal CLI and MCP server do not upload it to a Weft service. A benchmark may invoke the external harness command you provide; that harness may communicate with its own service. On Windows Weft uses `%APPDATA%\weft` for config and instructions and `%LOCALAPPDATA%\weft\state` and `%LOCALAPPDATA%\weft\cache` for state and cache. On macOS and Linux it uses `$XDG_CONFIG_HOME/weft` (default `~/.config/weft`), `$XDG_STATE_HOME/weft` (default `~/.local/state/weft`), and `$XDG_CACHE_HOME/weft` (default `~/.cache/weft`). The state database contains repository paths, file metadata and indexed chunks, task/checkpoint data, and local usage records.

`weft stats` refreshes local usage records by scanning JSONL transcript files under `~/.claude/projects` and `~/.codex/sessions` (or the equivalent user home on Windows), then reports data from the local database. It does not query a provider or cloud service. Transcript contents are parsed locally for usage information and recorded in the local database. Indexing and retrieval operate on local repository files and the local database.

Hooks run local checkpoint/session actions in Claude Code. MCP provides local tools such as safe file reads, search, context packing, task checkpointing, and repository health checks to supported harnesses. `weft setup` configures Claude Code, Codex, and OpenCode when their user config directories exist. The `t3` setup target covers Claude Code and Codex configurations.

## Benchmark

No live benchmark result has been recorded for this project yet. `weft bench retrieval` measures local retrieval; `weft bench run` can run a configured suite and harness. Do not interpret an absent result as a measured saving.

## Troubleshooting

- Run `weft doctor` to see missing or stale integrations and suggested repair commands.
- If hooks do not run, check that Claude Code is installed, run `weft setup --harness claude-code`, and restart the harness.
- On Windows, verify npm's global bin directory is on `PATH`; reopen the shell after installing or linking.
- If an integration invokes an old checkout or CLI path, run `weft setup` again to refresh the recorded path.
- If the SQLite native module cannot load, use a supported Node.js version and reinstall the package so `better-sqlite3` can install its platform binary.

## Development

Weft runs on Node.js 20 or newer. Developing it (the test runner) needs Node.js 22.12 or newer: run `npm ci`, then `npm run build`, `npm run lint`, and `npm test`.

See [Architecture](docs/ARCHITECTURE.md), [Security](SECURITY.md), and [Changelog](CHANGELOG.md).
