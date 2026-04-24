---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "README"
doc_title: "README"
doc_type: "index"
status: "canonical"
machine_readable: true
---

# OPTCG Simulator Specification

<!-- SECTION_REF: README.s001 -->

Section Ref: `README.s001`

This is the **v6, implementation-contract-ready** OPTCG simulator specification package. It is a Markdown-first, machine-friendly rebuild of the original source material.

The v1 rebuild over-compressed some source material. This version fixes that by doing two things:

1. The implementation docs are expanded where original details were underrepresented, especially **Poneglyph**, tech stack, card-data ownership, Redis caching, workflow rules, crash/recovery behavior, spectator policy, and source coverage.
2. The original PDF text is preserved in [`source-original-pdfs/`](specs/source-original-pdfs/) so the new spec can be audited against the source documents.

The prior tightening pass incorporated the supplied Poneglyph OpenAPI JSON, real card payload examples for `OP01-060` Donquixote Doflamingo and `OP05-091` Rebecca, and the official comprehensive rules PDF (`Version 1.2.0`, last updated `2026-01-16`). Those additions remain part of v6 together with new delivery-operation changes for GitHub boards, issue forms, Codex agent instructions, and a machine-readable story schema contract.

## Core implementation changes kept from the review

<!-- SECTION_REF: README.s002 -->

Section Ref: `README.s002`

- Unsupported cards are never silently treated as vanilla cards.
- The engine uses an event journal instead of a vague `lastAction` value.
- Continuous effects are computed as a derived view, not repeatedly mutating canonical state.
- All player choices, target selections, cost payments, optional effects, and simultaneous trigger ordering use the same `PendingDecision` model.
- Replays are versioned against engine, rules, card-data, effect-definition, banlist, protocol, and RNG versions.
- Client prediction uses a safe `PlayerView` / `view-engine` layer, not the full hidden-information engine state.
- Rollback is classified by hidden-information exposure.
- Spectator defaults are now game-type-specific: unranked queue uses `live-filtered`; ranked queue uses `delayed-filtered` with a 3-turn delay plus server-configured time/action delay; custom lobbies are host-configurable within allowed bounds.
- Database schema issues around card variants, session-token uniqueness, provider-neutral auth, loadouts, manifest snapshots, replay reconstruction, report targets, and active bans are fixed.
- Compile-ready canonical types now live in [`contracts/canonical-types.ts`](contracts/canonical-types.ts).
- The canonical effect DSL schema now lives in [`contracts/effect-dsl.schema.json`](contracts/effect-dsl.schema.json).
- Corrected DDL now lives in [`contracts/database-schema-v6.sql`](contracts/database-schema-v6.sql).
- Ranked and unranked are now explicitly queue-backed game types; custom is now explicitly a lobby-backed game type with optional passwords.
- Ranked Elo, ladder identity, and disconnect discipline are now explicitly defined.

## v6 delivery-system changes

<!-- SECTION_REF: README.s003 -->

Section Ref: `README.s003`

v6 keeps the gameplay/runtime content from v5 but adds a missing delivery layer:

- canonical machine-readable story validation via [`contracts/story.schema.json`](contracts/story.schema.json),
- a GitHub board and issue mapping in [`31-github-board-and-story-ops.md`](specs/31-github-board-and-story-ops.md),
- a checked-in board sync tool at [`tools/spec_board_sync.ts`](tools/spec_board_sync.ts) with example config at [`tools/github-board.config.example.json`](tools/github-board.config.example.json),
- Codex-oriented repo instructions in [`AGENTS.md`](AGENTS.md) and [`.agents/skills/`](.agents/skills/),
- adjacent sync metadata under [`stories/.sync/`](stories/.sync/),
- GitHub issue-form examples under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/),
- stronger preference for `SECTION_REF` citations over heading-anchor examples in derived stories and packets.

## Poneglyph decision, now explicit

<!-- SECTION_REF: README.s004 -->

Section Ref: `README.s004`

Poneglyph API (`api.poneglyph.one`) is the planned source of truth for printed card text, stats, images, variants, and metadata. The simulator does **not** treat Poneglyph as rules authority. The server resolves and validates Poneglyph card data through `@optcg/cards`, merges simulator overlays for effects/rulings/support status, snapshots the result at match creation, and then the engine runs from that match snapshot.

The detailed policy is in [`09-card-data-and-support-policy.md`](specs/09-card-data-and-support-policy.md).

## Official rules integration, now explicit

<!-- SECTION_REF: README.s005 -->

Section Ref: `README.s005`

The bundle now includes the official comprehensive rules PDF in [`source-official-rules/rule_comprehensive_v1.2.0_2026-01-16.pdf`](specs/source-official-rules/rule_comprehensive_v1.2.0_2026-01-16.pdf).

Those rules are the primary gameplay authority together with official card wording and official rulings/errata. The simulator code, overlays, and tests are implementations of that authority, not replacements for it.

Internal precedence for implementation work:

1. Official card wording and official comprehensive rules
2. Official FAQ / rulings / errata
3. Frozen Poneglyph metadata snapshot for normalized printed data
4. Manual simulator implementation (DSL or custom handler)
5. Card-specific acceptance tests
6. Generic engine tests

## Document map

<!-- SECTION_REF: README.s006 -->

Section Ref: `README.s006`

| File                                                                                               | Purpose                                                                                            |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`SPEC_VERSION.md`](specs/SPEC_VERSION.md)                                                         | Canonical v6 version manifest and supersession order                                               |
| [`spec-manifest.json`](spec-manifest.json)                                                         | Machine-readable manifest for tools, scripts, and agent pipelines                                  |
| [`00-project-overview.md`](specs/00-project-overview.md)                                           | Product scope, launch goals, non-goals, success criteria                                           |
| [`01-system-architecture.md`](specs/01-system-architecture.md)                                     | Package boundaries, runtime topology, Poneglyph topology, tech stack, deployment, ownership        |
| [`02-engine-mechanics.md`](specs/02-engine-mechanics.md)                                           | Turn flow, zones, battle sequence, rule processing, card mechanics, rulings                        |
| [`03-game-state-events-decisions.md`](specs/03-game-state-events-decisions.md)                     | Canonical state, event journal, pending decisions, deterministic RNG                               |
| [`04-effect-runtime.md`](specs/04-effect-runtime.md)                                               | Effect queue, trigger timing, source-presence policy, replacement and continuous effects           |
| [`05-effect-dsl-reference.md`](specs/05-effect-dsl-reference.md)                                   | DSL schema, triggers, costs, conditions, targets, effects, examples                                |
| [`06-visibility-security.md`](specs/06-visibility-security.md)                                     | Hidden information, filtered views, anti-cheat, spectator modes                                    |
| [`07-match-server-protocol.md`](specs/07-match-server-protocol.md)                                 | WebSocket envelopes, sequencing, reconnect, timers, rate limits                                    |
| [`08-replay-rollback-recovery.md`](specs/08-replay-rollback-recovery.md)                           | Replay headers, rollback classes, crash recovery, replay drift                                     |
| [`09-card-data-and-support-policy.md`](specs/09-card-data-and-support-policy.md)                   | Poneglyph integration, Redis cache, overlays, support status, unsupported-card policy              |
| [`10-database-schema.md`](specs/10-database-schema.md)                                             | Postgres tables, Poneglyph IDs, indexes, Redis split, schema corrections                           |
| [`11-testing-quality.md`](specs/11-testing-quality.md)                                             | Unit, interaction, fuzz, invariant, replay, hidden-info testing                                    |
| [`12-roadmap.md`](specs/12-roadmap.md)                                                             | Revised milestones plus original phase plan                                                        |
| [`13-legal-content-risk.md`](specs/13-legal-content-risk.md)                                       | Poneglyph/image/text handling, trademarks, takedown process, launch blockers                       |
| [`14-glossary.md`](specs/14-glossary.md)                                                           | Shared terminology                                                                                 |
| [`15-implementation-kickoff.md`](specs/15-implementation-kickoff.md)                               | First coding pass and package bootstrap checklist                                                  |
| [`16-typescript-interface-draft.md`](specs/16-typescript-interface-draft.md)                       | First-pass TypeScript interfaces to start implementation                                           |
| [`17-first-card-fixtures.md`](specs/17-first-card-fixtures.md)                                     | Initial 20-card fixture plan for the engine acceptance suite                                       |
| [`18-acceptance-tests.md`](specs/18-acceptance-tests.md)                                           | Milestone test names and pass/fail requirements                                                    |
| [`19-poneglyph-api-contract.md`](specs/19-poneglyph-api-contract.md)                               | Concrete Poneglyph endpoint use, response schemas, normalization, hashes, fixture policy           |
| [`20-card-implementation-examples.md`](specs/20-card-implementation-examples.md)                   | OP01-060 and OP05-091 DSL drafts, implementation consequences, card-specific tests                 |
| [`21-v3-tightening-notes.md`](specs/21-v3-tightening-notes.md)                                     | Summary of v3 changes based on supplied Poneglyph JSON and examples                                |
| [`22-v6-implementation-tightening.md`](specs/22-v6-implementation-tightening.md)                   | Concrete ambiguity closures from the implementation-readiness review                               |
| [`23-repo-tooling-and-enforcement.md`](specs/23-repo-tooling-and-enforcement.md)                   | Required repo tooling, local checks, CI merge gates, and boundary enforcement                      |
| [`24-story-schema.md`](specs/24-story-schema.md)                                                   | Canonical schema for spec-derived stories used for planning, validation, and agent assignment      |
| [`25-story-template.md`](specs/25-story-template.md)                                               | Copy-ready story template for approved backlog items                                               |
| [`26-agent-packet-template.md`](specs/26-agent-packet-template.md)                                 | Standard packet format for assigning a single story to an implementation or review agent           |
| [`27-spec-driven-story-generation-workflow.md`](specs/27-spec-driven-story-generation-workflow.md) | Workflow and prompt contract for generating stories from the spec and building agent-ready packets |
| [`28-machine-readable-conventions.md`](specs/28-machine-readable-conventions.md)                   | Canonical parsing and machine-readable packaging rules                                             |
| [`29-game-types-queues-and-lobbies.md`](specs/29-game-types-queues-and-lobbies.md)                 | Canonical public game-type split between ranked, unranked, and custom sessions                     |
| [`30-formats-and-ranked-competition.md`](specs/30-formats-and-ranked-competition.md)               | Format profiles, ladder identity, Elo policy, and disconnect discipline                            |
| [`contracts/canonical-types.ts`](contracts/canonical-types.ts)                                     | Compile-ready TypeScript implementation contract                                                   |
| [`contracts/effect-dsl.schema.json`](contracts/effect-dsl.schema.json)                             | Canonical JSON Schema for effect definition fixtures                                               |
| [`contracts/database-schema-v6.sql`](contracts/database-schema-v6.sql)                             | Corrected production-oriented DDL contract                                                         |
| [`contracts/story.schema.json`](contracts/story.schema.json)                                       | Machine-readable validation contract for approved story files                                      |
| [`tools/spec_board_sync.ts`](tools/spec_board_sync.ts)                                             | Reference tool for projecting approved stories into GitHub issues and project fields               |
| [`tools/github-board.config.example.json`](tools/github-board.config.example.json)                 | Example GitHub repo/project mapping for the board sync tool                                        |
| [`stories/.sync/`](stories/.sync/)                                                                 | Adjacent metadata written by the board sync tool for synced issue state                            |
| [`fixtures/poneglyph/`](fixtures/poneglyph/)                                                       | OpenAPI and card payload fixtures used by adapter/effect tests                                     |
| [`source-map.md`](specs/source-map.md)                                                             | Where each original PDF topic moved                                                                |
| [`source-coverage-matrix.md`](specs/source-coverage-matrix.md)                                     | Source section coverage checklist                                                                  |
| [`source-original-pdfs/`](specs/source-original-pdfs/)                                             | Text extracts from the original PDFs for audit/reference                                           |
| [`adr/`](specs/adr/)                                                                               | Short architecture decision records                                                                |

## Machine-friendly parsing guarantees

<!-- SECTION_REF: README.s007 -->

Section Ref: `README.s007`

This v5 pass adds package-wide machine-readable front matter to every Markdown document and formalizes parsing/automation rules in [`28-machine-readable-conventions.md`](specs/28-machine-readable-conventions.md).

Automation should consume this package in the following order:

1. YAML front matter on each Markdown file
2. [`SPEC_VERSION.md`](specs/SPEC_VERSION.md)
3. [`spec-manifest.json`](spec-manifest.json)
4. Canonical contract files under [`contracts/`](contracts/)
5. Numbered specification documents

When generating stories, packets, issue bodies, or implementation tasks from the spec, record `spec_version: v6` on every derived artifact and cite source sections with stable `SECTION_REF` identifiers rather than renderer-specific heading anchors.

## Canonical implementation principle

<!-- SECTION_REF: README.s008 -->

Section Ref: `README.s008`

Where older prose conflicts with [`SPEC_VERSION.md`](specs/SPEC_VERSION.md), [`contracts/canonical-types.ts`](contracts/canonical-types.ts), [`contracts/effect-dsl.schema.json`](contracts/effect-dsl.schema.json), [`contracts/database-schema-v6.sql`](contracts/database-schema-v6.sql), or [`22-v6-implementation-tightening.md`](specs/22-v6-implementation-tightening.md), the v6 contract files win.

The authoritative match engine is a deterministic server-side state machine. Clients send action intents. The server validates those intents against the current state, applies legal actions, emits filtered views, and records replayable logs.

The browser may run a lightweight view/prediction engine for animations and UX, but it must never receive, hold, or infer hidden information such as opponent hand contents, deck order, life contents, RNG seed, or internal effect-queue state.

## Recommended first milestone

<!-- SECTION_REF: README.s009 -->

Section Ref: `README.s009`

Build a terminal-playable engine before platform infrastructure:

1. `@optcg/types`
2. `@optcg/engine-core` with hardcoded sample cards
3. CLI runner with 10-20 cards
4. Event journal, pending decisions, and invariant tests
5. Minimal card-data manifest using Poneglyph-shaped card IDs
6. Minimal `@optcg/cards` adapter over Poneglyph metadata
7. Browser board using filtered views
8. Match server with WebSocket sequencing
9. Platform API, deck builder, auth, matchmaking

The first proof should answer one question: can the engine complete a correct OPTCG game loop with hidden information, deterministic state hashes, and the first schema-validated card effects?

Before broad effect implementation, run `tsc -p contracts/tsconfig.json`, validate card DSL fixtures against `contracts/effect-dsl.schema.json`, and establish the required repo enforcement defined in [`23-repo-tooling-and-enforcement.md`](specs/23-repo-tooling-and-enforcement.md).

After repo enforcement exists, use the planning contracts in [`24-story-schema.md`](specs/24-story-schema.md), [`25-story-template.md`](specs/25-story-template.md), [`26-agent-packet-template.md`](specs/26-agent-packet-template.md), and [`27-spec-driven-story-generation-workflow.md`](specs/27-spec-driven-story-generation-workflow.md) to derive approved stories from this spec and assign them to agents without re-interpreting the full document set each time.

## Machine-friendly references

<!-- SECTION_REF: README.s010 -->

Section Ref: `README.s010`

- Every heading has an explicit `Section Ref:` line and matching `SECTION_REF` comment marker.
- `section-index.json` provides a generated package-wide section lookup table for scripts and agents.

# OPTCG Simulator

## Bootstrap

This repository uses a `pnpm` workspace baseline.

```powershell
corepack enable
corepack pnpm install
corepack pnpm verify
```

`pnpm verify` is the canonical local pre-push command and is mirrored by CI.

## Standard story workflow

Story lifecycle automation is standardized behind repo scripts.

- review and tranche planning: `npm run stories:next`
- preview approval: `npm run stories:approve`
- apply approval: `npm run stories:approve -- --apply`
- prepare branch: `npm run stories:branch -- --id STORY-ID`
- open PR: `npm run stories:pr -- --id STORY-ID --push`
- start work: `npm run stories:start -- --id STORY-ID`
- request review: `npm run stories:request-review -- --id STORY-ID`
- mark changes requested: `npm run stories:changes-requested -- --id STORY-ID`
- complete work: `npm run stories:complete -- --id STORY-ID`
- block or unblock: `npm run stories:block -- --id STORY-ID`, `npm run stories:unblock -- --id STORY-ID`
- rebuild the review surface: `npm run stories:review-report`
- run repo verification through the same command family: `npm run stories:verify`

Prefer these scripts over invoking individual workflow tools directly.

Review is expected to happen on a pull request, not only on an issue. Stories should have a branch and PR before moving into `in_review`, and `complete` should only happen after review passes and the PR is merged.

Bootstrap exception: `INF-001` is grandfathered because it established the repo baseline directly on `main` before the branch/PR workflow existed. It may complete without PR metadata, but that exception should not be reused for later stories.
