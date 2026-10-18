# Security

## Reporting a vulnerability

Please report security issues privately through GitHub's repository security advisories: https://github.com/Nishanth1812/Weft/security/advisories/new. Include the affected version, platform, reproduction steps, and impact. Avoid posting exploit details or private repository data in a public issue.

## Local data and redaction

Weft is designed to keep its database, repository indexes, checkpoints, and usage records on the local machine. Its normal CLI and MCP operation does not send those records to a Weft service. Harnesses and user-configured commands remain separate systems and may have their own network behavior.

Weft filters common secret patterns and sensitive paths from context and MCP file reads. Redaction is a defense in depth, not a guarantee: unknown formats, custom credentials, transformed secrets, and future secret types may not be recognized. Review any context before sharing it with an external service. MCP integrations expose local repository context to the harness that invokes them.

Running `weft stats` scans supported JSONL transcripts in the local Claude Code and Codex session directories and records parsed usage data in the local Weft database. It does not send the transcripts elsewhere. Remove local state files if you want to delete that data.
