# ContextForge + DevPulse — Transition Plan

**Document version:** 1.0 (draft for review)
**Date:** 17 October 2026
**Status:** Proposed plan — pending approval before Phase 0 begins
**Working name:** ContextForge (absorbing DevPulse)
**Companion document:** `contextforge_implementation_plan.md` (v1.0) — the normative architecture spec. This document defines **how DevPulse's assets are absorbed into it**. Where this document is silent, the implementation plan governs.

---

## 1. Purpose

DevPulse (Go, `github.com/Nishanth1812/devpulse`, v0.7.0) is a local-first CLI whose
core value proposition — LLM-generated session briefings — has been commoditized by
modern coding harnesses (OpenCode, Claude Code, Codex) and capable models. Its
remaining value is concentrated in **deterministic, model-agnostic assets**: security
hardening, repo intelligence, config/registry hygiene, and CLI UX design.

This plan moves those assets into the ContextForge MVP **without importing DevPulse's
AI-dependent core**, per the agreed triage: *"keep the deterministic value, retire the
AI layer."*

**Outcome:** one product — ContextForge — usable by everyone
(`npm i -g contextforge`), offline-capable, zero-config core, optional lean-LLM add-on
later. DevPulse is archived after a one-command migration path exists.

---

## 2. Product decisions (fixed for this transition)

| Decision | Choice | Rationale |
|---|---|---|
| Primary product | ContextForge | DevPulse's AI core is the weakest part; ContextForge's deterministic core is the durable bet (implementation plan §26) |
| Language | TypeScript / Node LTS (per implementation plan §5) | DevPulse's Go code is a **design port**, not a line-level port |
| License | GPL-3.0 carried over | DevPulse is GPL-3.0; ports of its designs and especially any near-verbatim translation make the new project derivative (author owns both works, so no conflict) |
| Distribution | npm package; optional GitHub binary release later | Replaces DevPulse's goreleaser flow |
| CLI name | `ctx` | Per implementation plan §17 |
| DevPulse AI commands (`brief`, `resume`, `focus`, `why`, `commit`) | **Retired from MVP** | Commodity capability + costs tokens; revisit only as an optional add-on after Phase 7 (see §12) |
| DevPulse as a product | Maintained/frozen; archived after migration command ships | Users migrate via `ctx migrate devpulse` |

Non-goals (inherited from implementation plan §1.2 plus):
- No porting of DevPulse's JSON file cache, gemini/groq clients, output spinner, or
  `debug collect` — SQLite and ecosystem libraries replace them.
- No rebuilding DevPulse features that exist only as LLM output conveniences.
- No ambient telemetry beyond local-only usage analytics (§11).

---

## 3. DevPulse inventory — full triage

Every DevPulse unit evaluated. Verdicts: **PORT** (port directly), **PATTERN** (port
the design, reimplement), **RETIRE** (drop).

### 3.1 `internal/security` — the crown jewels

| DevPulse asset (file) | Contains | Verdict | Disposition |
|---|---|---|---|
| `scanner.go` | Regex corpus: PEM keys, GitHub/GitLab/Stripe/API tokens, AWS keys/secrets, JWT, Slack tokens, GCP service-account data, auth headers, connection strings, credential assignments, high-entropy hex with keyword hints | **PORT** | Port regex table to TS (`core/security/secretScanner.ts`) with a fixture-driven test suite replicating DevPulse's scanner tests |
| `pii.go` | Email/US-phone/SSN detectors; stable-placeholder `Vault` (`[EMAIL_1]` …) with local restore | **PORT** | Only the *detection + placeholder* half; DevPulse's mask/restore-around-LLM flow dies (no core LLM). Placeholders still needed when emitting code excerpts that may contain PII |
| `paths.go` | Sensitive-path rules: `.env*`, private keys, credential stores, `ssh/aws/gnupg/docker/kube` configs, terraform state, service-account JSON | **PORT** | Becomes the default exclusion list for the indexer (feeds implementation plan §9.3) plus an output filter |
| Scanner-driven log/message redaction (`internal/logger`) | Redacts scanner hits from any log line | **PATTERN** | ContextForge logging applies the same redaction pass |

**Effort estimate:** 1–1.5 days + tests.
**Rule:** these three modules ship in **Phase 0**, before any indexing exists, because every
later phase consumes them (exclusion rules, content filtering, log hygiene).

### 3.2 `internal/collector` — deterministic repo intelligence

| DevPulse asset | Contains | Verdict | Disposition |
|---|---|---|---|
| `workingtree.go` | `git status --porcelain` parse (bounded), compressed working diff | **PORT** (state model) | Status subset becomes part of repository state + checkpoint staleness ("working-tree fingerprint"). Working-diff summarization dies with the AI layer |
| `git.go` unmerged-branch detection | Local branches not merged into HEAD, newest first | **PORT** | Feeds `ctx health` and repository state |
| Plan-file discovery (`paths.go` in collector) | PLAN.md, ROADMAP.md, TODO.md, CHANGELOG.md, NOTES.md, docs/PLAN.md, docs/ROADMAP.md with symlink/path-safety + size cap | **PORT** | Discovery list feeds intent-layer detection and retrieval candidates |
| `goals.go` | Parser for `Now / Next / Deadlines / Someday` sections (multi date separators) | **PORT** | Canonical intent file format (see §10) |
| `collectCommits` (log walking, diff extraction, full-diff windows) | LLM-fodder machinery | **RETIRE** | ContextForge ranks the *current index*, not commit histories |
| `CollectFileCommits` / `why` machinery | File archaeology | **RETIRE** | Same reason |
| Harden git invocation (`GitOutput`: timeouts, output caps, fsmonitor/textconv disabled) | Safe-by-default process patterns | **PATTERN** | Adopted by ContextForge's git runner (plan §4.2 "safe by default") |

**Effort estimate:** 1.5 days.

### 3.3 `internal/config` — workspace & registry hygiene

| DevPulse asset | Contains | Verdict | Disposition |
|---|---|---|---|
| Repo registry (`repository.go`) | name → absolute path map; registration validation (git repo, dedupe, basename naming) | **PORT** | `ctx repos register/unregister/list` (adds multi-repo capability the plan alone lacks) |
| `fuzzy.go` repo-name partial matching (threshold 50 default, candidate listing) | CLI UX quality | **PORT** (trivial, e.g. `@nlpjs/fuzzy` or own FSM) | Repo-name resolution for `ctx` commands |
| Workspace layout + permissions (`config.go`, `permissions_*.go`) | `~/.x/` structure, dirs 0700 / files 0600, atomic tmp+rename writes | **PATTERN** | ContextForge path resolver (plan §8.1) adopts identical permission + atomicity rules; per-OS permission enforcement is a TS/Node consideration (best-effort on Windows) |
| Keyring auth (`auth.go`, `zalando/go-keyring`) | OS-keychain storage for provider keys | **PATTERN** | Deferred to the optional AI add-on (§12); never required by the core |
| TOML config manager | Layered config load/save with defaults fill | **RETIRE** | MVP needs only `config.json` + repository overrides (plan §8.1); re-add layering only on evidence |

**Effort estimate:** 1 day.

### 3.4 Everything else

| DevPulse asset | Verdict | Notes |
|---|---|---|
| `cache` (file JSON store) | **RETIRE** | LLM-response cache. Keep only one concept: `cache.Hash/Fingerprint` — ordered-parts composition for invalidation keys → reused for index generations and checkpoint staleness § |
| `compressor` (diff/plan compression) | **RETIRE** | Purpose was prompt size control. Keep 20-line token estimator (chars/4) for context budget enforcement (plan §10.4) |
| `ai` package (clients, pipeline, prompts, parse/validate, retry, token caps) | **RETIRE as feature** | Only *patterns* survive: cache-fingerprint design, bounded-input guard, provenance discipline — all already specified in the implementation plan |
| `services` (CollectService, NoteService) | **RETIRE** | Note content folds into checkpoint payloads (§10.3) |
| `fuzzy`, `logger`, `output`, `models` | Partial | Registry matching (port), redacted logging + retention (pattern), spinner/table (use ecosystem), structs (superseded) |
| `goreleaser.yaml`, CI matrix (fmt/vet/test/build, race on Linux, Windows CI gates) | **PATTERN** | Recreate equivalents: `tsc --build` typecheck, vitest, ESLint, `npm pack` smoke, GitHub Actions matrix (Ubuntu LTS, Windows) |
| `SECURITY.md`, `CONTRIBUTING.md`, conventional-commit changelog | **PORT patterns** | Roadmap documentation inherits these; SECURITY.md rewritten for ContextForge's data flows (§11) |
| `health` command (rule-based: merged un-deleted branches, TODO/FIXME counts, staleness > 14 days) | **PORT** | Already zero-LLM → `ctx health` in Phase 4 |
| Goals file scaffold (`init`) | **PORT** | Becomes intent-layer file, see §10.2 |

**Effort estimate summary for all absorption work: ~3–4 days** inside the plan's existing phase schedule.

---

## 4. What the merged MVP gains (and why that matters)

ContextForge (implementation plan, standalone) would ship:

- Instruction sync, repo index, lexical retrieval with budget, task checkpoints,
  telemetry, harness adapters, benchmarks.

The DevPulse absorption adds, at marginal cost:

1. **Multi-repo portfolio view (deterministic).** Registry + unmerged-branch/status
   scanning = "what is in flight across all my repos" without touching a model.
   Becomes `ctx repos status` / feeds `ctx health`.
2. **Intent layer.** Goals file (Now/Next/Deadlines/Someday) slots into the plan's
   four-layer instruction model (§8.2) as layer 2.5 — user intent that both humans and
   agents can read.
3. **Security-first defaults, already engineered.** Skip the design phase of exclusion
   lists and content filtering; port tested rules instead.
4. **CLI ergonomics.** Partial-name resolution for repo arguments; `doctor`-style
   diagnostics for integrations.

---

## 5. Target module map (absorbed assets → ContextForge home)

```text
contextforge/src/
├── core/
│   ├── security/          # PORT from devpulse/internal/security (scanner, pii, paths)
│   ├── gitstate/          # PORT from devpulse/internal/collector (status, branches, plans, goals parse)
│   ├── intents/           # PORT from devpulse goals.md format  (Now/Next/Deadlines/Someday)
│   ├── fingerprint/       # PATTERN from devpulse/internal/cache (ordered-parts hashing)
│   └── estimate/          # PORT token estimator (chars/4)
├── config/                # plan §7.2 + registry + fuzzy matching (PORT)
├── indexer/               # plan §7.3 (uses security/paths as exclusion default)
├── context/               # plan §7.4
├── memory/                # plan §7.5 (+ notes→checkpoints fold, §10.3)
├── health/                # PORT from devpulse `health` command logic
├── integrations/          # plan §7.6 (opencode / codex / claude-code)
├── telemetry/             # plan §7.7
├── verification/          # plan §7.8
├── storage/               # plan §7.9 (SQLite)
└── cli/                   # plan §7.1 (+ `ctx migrate devpulse`, §13)
```

Naming/format conventions follow the implementation plan; no DevPulse names leak into
user-visible surfaces except version-history and docs acknowledgements.

---

## 6. Canonical file & state layout (merged)

User-level (platform-resolved, plan §8.1):

```text
<user config dir>/contextforge/
├── config.json            # global settings, registry lives in DB (not config)
├── instructions/
│   ├── global.md          # canonical global instructions
│   └── intent.md          # PORT of DevPulse goals.md (Now/Next/Deadlines/Someday)
├── templates/             # per-harness render templates
└── state/
    └── contextforge.db    # SQLite (plan §12)
```

Repository-level:

- `.gitignore`-aware exclusions + `security/paths` default deny-list (from DevPulse)
- Harness files rendered into repo if opted in (`AGENTS.md`, `CLAUDE.md`, …)
- Repo notes (from DevPulse `notes/`) are **imported**, not kept as live state
  (see `migrate`, §13)

---

## 7. CLI contract deltas (extends implementation plan §17)

All commands from the plan remain. Additions enabled by absorption:

| Command | Purpose |
|---|---|
| `ctx repos register [path]` | Register a repository (validates git root; name defaults to basename) |
| `ctx repos list` | List registered repos |
| `ctx repos fuzzy <partial>` | Resolve partial name → repository (DevPulse UX port) |
| `ctx intent edit` | Open canonical `intent.md` (Now / Next / Deadlines / Someday) |
| `ctx health [repo]` | DevPulse-rule hygiene scan (no LLM): merged un-deleted branches, TODO/FIXME counts, staleness > 14 days, working-tree noise |
| `ctx migrate devpulse` | One-way import from `~/.devpulse/` (see §13) |
| `ctx portfolio` | Deterministic cross-repo overview: in-flight files/branches, stale repos, blocking flags — replaces DevPulse `focus`/`brief --all` without LLM |

Exit codes, JSON output flags, quiet/verbose modes: per plan §17.2.

---

## 8. Phased rollout — work items

Timeline adds devpulse-absorption tasks (marked **[DX]** for DevPulse absorb) to the
implementation plan's phases. Total planning estimate: **16–31 days (unchanged) plus
~3–4 days of absorption work ≈ 19–35 days**.

### Phase 0 — Scaffold + security port (new total: 2–3 days)

Tasks: TS project (Node LTS, TS 5.x, vitest, ESLint, tsup), CI matrix (Ubuntu/Windows),
repo scaffolding per plan §6.

- **[DX]** Port `security/scanner` regex corpus + tests (port test vectors, not prose).
- **[DX]** Port sensitive-path list as indexer defaults + output filter.
- **[DX]** Port PII detection (placeholders only).
- **[DX]** Reimplement redacted logging with 7-day local retention.

**Acceptance gate:** every DevPulse secret-scanner test vector passes in TS; no index
feature exists yet; zero network calls in package.

### Phase 1 — CLI + instructions + registry (2–3 days + 0.5 [DX])

- **[DX]** Registry: register/validate/list with parse-friendly output.
- **[DX]** Fuzzy partial-name resolver wired into all repo-arg commands.
- **[DX]** Intent file (goals.md format) scaffolded by `ctx intent edit`.

**Acceptance gate:** `ctx init && ctx doctor && ctx instructions sync` runs clean twice
(idempotent), preserves unrelated user files, drift check reports-only.

### Phase 2 — SQLite + incremental index (3–5 days)

- **[DX]** Fingerprint (ordered-parts hashing) drives generation/staleness keys.
- **[DX]** Sensitive-path + `.gitignore` rules drive exclusions (default deny).
- **[DX]** Git safe-runner pattern (timeouts, caps, no fsmonitor/textconv).

**Acceptance gate:** add/edit/delete correctness; no reparse of unchanged files
(measured); failed index never publishes partial state; plan §20 targets (<1s no-change
index on medium repo).

### Phase 3 — Retrieval + task memory (3–5 days)

- **[DX]** Token estimator used for all budget math (label `estimate` provenance per plan §15.2).
- **[DX]** Plan-file discovery list retrieved as candidates for feature-type queries.
- **[DX]** Staleness detection uses working-tree fingerprint + branch state (DevPulse
  collector state model).
- **[DX]** `notes` content accepted as checkpoint payload section (structured, sized).

**Acceptance gate:** retrieval reproducible; checkpoint staleness correctly flags when
flipped-edit test applied; `--budget` honored with rationale lines.

### Phase 4 — Harness integrations + health (3–5 days)

- **[DX]** `ctx health` rules ported verbatim (rule table + tests).
- **[DX]** `ctx portfolio` built on registry + health + status primitives (no LLM).

**Acceptance gate:** all harness adapters optional and independently disableable
without workflow breakage; `health` outputs identical to DevPulse semantics on
fixture repos.

### Phase 5 — Telemetry & cost analytics (2–4 days)

Provenance-labeled metrics per plan §14–15. No secrets, no prompts, WAL usage
subject to plan §12.3's "only if measured helpful" rule.

**Acceptance gate:** provider-reported vs estimated values never conflated; totals
reconcile with events (test).

### Phase 6 — Benchmarks (2–4 days)

Benchmark configurations A/B/C per plan §15.4; include one portfolio-task suite
(utilizing `ctx portfolio` + registry) to validate the absorbed multi-repo value.

**Acceptance gate:** measurable comparison artifacts committed; no regression in
correctness (plan §20).

### Phase 7 — Release hardening + migration (2–3 days)

- **[DX]** `ctx migrate devpulse` — imports from `~/.devpulse/`:
  - `config.toml` → registered repos
  - `goals.md` → `intent.md`
  - `notes/<repo>.md` → per-repo "imported notes" checkpoint payload (marked
    `source: devpulse-import`, editable/deletable)
  - never imports cache/, logs/, or config secrets
  - `--dry-run` prints a migration plan; non-destructive; rerunnable safely
- **[DX]** SECURITY.md rewritten (data-flow diagram: nothing leaves the machine).
- **[DX]** README: DevPulse acknowledgment block ("supersedes DevPulse — migrate with
  `ctx migrate devpulse`").

**Acceptance gate:** fresh install works on Windows + Linux; migration restores all
DevPulse state into first-class ContextForge structures; DPS repo archive branch
tagged `archived-at-contextforge-mvp`.

---

## 9. Ordering & dependency notes

- Everything from Phase 0's `security` port blocks Phases 1–7 (exclusion defaults +
  output filter are shared primitives).
- Registry (Phase 1 [DX]) blocks Phase 2's repository identity model and Phase 4's
  `portfolio`.
- Fingerprint port (Phase 2 [DX]) blocks retrieval staleness work in Phase 3.
- Nothing in the DevPulse absorption depends on, or uses, any API key.

---

## 10. Format continuity details

**10.1 Intent file (`intent.md`) — adapted from DevPulse `goals.md`:**

```markdown
# Intent

## Now
What I am actively finishing this week.

## Next
Queued after Now items.

## Deadlines
Format: YYYY-MM-DD — description (DevPulse parser semantics; same multi-separator support).

## Someday
Backlog and parking lot.
```

Rules: user-owned file; generated regions never written into it; no sync/drift
representation; parsed with a tolerant parser (port DevPulse section-heading logic +
date forms, `-` and `—` separators).

**10.2 Checkpoints (plan §11.2) get two absorbed fields:**

- `working_tree_fingerprint` (from DevPulse collector state model) — used for
  staleness comparison.
- `notes?: string` (structured, size-capped) — absorbs DevPulse notes.

**10.3 Health rule table (ported verbatim):**

| Rule (DevPulse `health`) | Behavior |
|---|---|
| Unmerged local branch | Flag with last-commit age |
| TODO / FIXME count | Bounded scan of indexed files |
| Staleness | > 14 days since last commit → flag |
| Working-tree noise | Flag count of uncommitted changes |

---

## 11. Security, privacy, telemetry continuity

Inherited from DevPulse where it applies; tightened to ContextForge's promise:

- No secrets enter the index: DevPulse's exclusion + scanner combination runs as
  **pre-index filter** (not only pre-send, as in DevPulse).
- No raw prompts ever existed in DevPulse's telemetry; the merged product keeps that
  (telemetry = usage metadata only).
- No ambient process; all operations are short-lived CLI runs.
- Log retention 7 days (DevPulse pattern), local-only, redacted scanner output.
- `[README/SECURITY]` explicitly supersede the "telemetry-free" wording with
  "local-only, user-visible usage analytics; no data leaves the machine."

---

## 12. The optional AI add-on (post-MVP, expires the plan's "no-LLM core" — by design)

If evidence justifies it (plan principle 10: measured value only), add `ctx briefing`
as an **opt-in** command (needs user-supplied provider key; core stays functional
without it):

- `ctx briefing [repo]` — DevPulse `brief`'s deterministic successor: prebuilds a
  context **package** from index+intent+checkpoint (never automates model calls),
  then calls the user's provider to summarize. Prompt = plan's context package, not
  raw dumps; inherits DevPulse's secret/PII redaction pre-send.
- Cache: provider responses keyed by fingerprint (DevPulse fingerprint pattern),
  TTL-managed, typed invalidation on repository/intent/checkpoint changes.
- Gate before implementing: benchmark A/B shows ≥15% useful-work-per-cost median
  improvement or removes.

**Explicitly not in MVP.** Do not let it back into the core.

---

## 13. `ctx migrate devpulse` specification

- Location of inputs: `~/.devpulse/config.toml`, `goals.md`, `notes/*.md` (tolerate
  `DEVPULSE_CONFIG` override location resolution — port DevPulse's `WorkspaceBaseDir`
  rule exactly).
- Outputs: ContextForge registry rows, `intent.md` (merge-on-detect), checkpoint
  payloads (per repo, labeled `source: devpulse-import`).
- Idempotent: second run changes nothing.
- Non-destructive: **never deletes** `~/.devpulse/`; user removes it manually.
- Dry-run mode prints proposed operations; `--json` machine output.
- Error handling: per-item non-fatal with a summary report.

---

## 14. Risks & mitigations (delta to implementation plan §21)

| Risk | Impact | Mitigation |
|---|---|---|
| Scanner regex corpus port drifts from tested behavior | Security regression | Port test vectors 1:1; CI runs both suites long-term until disclosure parity proven |
| Registry/fuzzy semantics drift on Windows paths (case-insensitivity) | UX bugs | Port DevPulse's documented Windows-casing rules (+ tests) |
| Scope creep — absorbed "one more nice thing" from DevPulse | Timeline blowout | Guardrail: every absorbed item maps to a Phase 1–5 command; §3 triage is closed — no additions without plan.amendment |
| GPL-3.0 concerns if porting drifts near verbatim code | Legal/licensing | Keep the new code idiomatic TS (idiomatic rewrite of patterns); carry license text anyway |
| `briefing` add-on restarts AI churn post-MVP | Feature bloat | Hard gate: benchmark evidence required; auto-removal on negative benchmark (§12) |

---

## 15. First milestone (fresh developer's first week)

Ordered list, directly implementable:

1. TS scaffold + CI matrix + lint/typecheck gates
2. Security port: scanner + sensitive paths + PII detection + redacted logging (with ported test vectors)
3. Path resolver + workspace permissions + atomic writes
4. `ctx init`, canonical `global.md` + `intent.md`
5. Instructions safe sync + drift check + `ctx doctor`
6. Registry + fuzzy matching (+ `ctx repos list`)
7. SQLite open/migrate + `files`/`symbols` staging schema
8. `ctx index` (hashing, exclusions, incremental, transactional generations)
9. `ctx search` (lexical)
10. `ctx task start/resume` + `ctx checkpoint`
11. Baseline benchmark template
12. (post-MVP items populate later phases)

Defer everything in implementation plan §3.2 + §12 add-on.

---

## 16. End-of-life plan for DevPulse

| Stage | Trigger | Action |
|---|---|---|
| Freeze | Phase 0 approved | DevPulse repo gets "superseded by ContextForge" README banner; issues/prs closed-out vs migrated |
| Parallel | Phases 1–6 | No new DevPulse features (bug-fix only) |
| Archive | Phase 7 ships `ctx migrate devpulse` | Tag `v0.8.0-migration-ready`; archive the repo; README links to ContextForge |

---

## 17. Acceptance checklist for the transition itself

- [ ] Every §3 PORT item has an owner-phase and lands by Phase 4 deadline
- [ ] Every §3 RETIRE item has zero code references in the ContextForge tree
- [ ] Scanner test vectors: 100% parity with DevPulse suite
- [ ] `ctx migrate devpulse` on a real DevPulse install produces working registry,
      intent file, and notes-backed checkpoints; second run is a no-op
- [ ] `ctx health` and `ctx portfolio` output on fixture repos identical to DevPulse
      semantics (rule table §10.3)
- [ ] ContextForge's `npm pack` fresh-install works on Windows + LTS Ubuntu
- [ ] SECURITY.md documents: index-time filtering, no source retention, local-only
      telemetry, and migration source handling
- [ ] License file (GPL-3.0) present; acknowledgement block for DevPulse ancestry
- [ ] Implementation plan's §§19–20 acceptance gates all pass unchanged

---

*End of transition plan. Architecture source of truth remains
`contextforge_implementation_plan.md`; this document only governs the DevPulse
absorption path.*
