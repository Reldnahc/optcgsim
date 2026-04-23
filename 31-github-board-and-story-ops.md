---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "31-github-board-and-story-ops"
doc_title: "GitHub Board And Story Operations"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# GitHub Board and Story Operations
<!-- SECTION_REF: 31-github-board-and-story-ops.s001 -->
Section Ref: `31-github-board-and-story-ops.s001`

This document defines the canonical mapping from approved spec-derived stories into GitHub Issues, Projects, and board workflows.

The goal is to let teams turn spec sections into online-board work items without re-inventing structure by hand.

## Core rule
<!-- SECTION_REF: 31-github-board-and-story-ops.s002 -->
Section Ref: `31-github-board-and-story-ops.s002`

The approved story file remains the authoritative delivery artifact below the specification. A GitHub issue or project card is a synchronized projection of that story, not a replacement authority.

The reference repo workflow uses `tools/spec_board_sync.ts` to produce or update that projection and stores sync metadata under `stories/.sync/`.

If the board card, issue body, labels, or project fields drift from the approved story file, the approved story file wins and the board item must be corrected by rerunning sync or editing the story first.

## Canonical projection model
<!-- SECTION_REF: 31-github-board-and-story-ops.s003 -->
Section Ref: `31-github-board-and-story-ops.s003`

Recommended mapping:

- epic -> parent issue,
- approved story -> issue,
- optional implementation subtasks -> sub-issues,
- blocking relationships -> GitHub issue dependencies,
- current planning view -> GitHub Project board/table/roadmap views,
- implementation packet -> markdown artifact linked from the issue body or comments.

## Story-to-GitHub field mapping
<!-- SECTION_REF: 31-github-board-and-story-ops.s004 -->
Section Ref: `31-github-board-and-story-ops.s004`

| Story field | GitHub destination | Notes |
|---|---|---|
| `id` | issue title prefix and `Story ID` field | Example: `[ENG-012] Implement mulligan waiting-state clock behavior` |
| `title` | issue title/body | Keep title identical to story |
| `summary` | issue body | Keep first paragraph short |
| `type` | label and optional `Type` field | Example labels: `type:implementation`, `type:ambiguity` |
| `area` | label and optional `Area` field | Example labels: `area:engine`, `area:server` |
| `priority` | single-select project field or label | Prefer a project field when available |
| `status` | project `Status` field | Source-of-truth for execution state on board |
| `spec_refs` | dedicated issue section | Preserve stable `SECTION_REF` citations |
| `dependencies` | issue dependencies and/or body section | Prefer native issue dependencies where available |
| `acceptance_criteria` | markdown checklist | Keep each criterion individually reviewable |
| `required_tests` | body section and review checklist | Required for implementation stories |
| `ambiguity_policy` | body section and agent packet | Must survive export unchanged |

## Recommended issue labels
<!-- SECTION_REF: 31-github-board-and-story-ops.s005 -->
Section Ref: `31-github-board-and-story-ops.s005`

Recommended label families:

- `type:*`
- `area:*`
- `priority:*`
- `status:*` only if your project board does not already own status
- `risk:hidden-info`, `risk:determinism`, `risk:replay`, `risk:security` where relevant
- `needs:clarification` for ambiguity stories

Keep labels low-cardinality and stable. Do not encode large freeform payloads in labels.

## Recommended project fields
<!-- SECTION_REF: 31-github-board-and-story-ops.s006 -->
Section Ref: `31-github-board-and-story-ops.s006`

Recommended GitHub Project fields for a public or mixed-visibility setup:

- `Status` (single select)
- `Priority` (single select)
- `Area` (single select)
- `Type` (single select)
- `Estimate` (number or single select)
- `Spec Version` (text)
- `Story ID` (text)
- `Iteration` (iteration)
- `Target Date` (date)
- `Blocked` (single select or derived from dependencies)

For public projects, prefer project custom fields plus labels. Do not make your workflow depend on organization issue fields unless you know you are operating in private projects that support them.

## Parent/child and dependency rules
<!-- SECTION_REF: 31-github-board-and-story-ops.s007 -->
Section Ref: `31-github-board-and-story-ops.s007`

Use parent issues for epics and native sub-issues only when the child work is genuinely part of the same top-level outcome. Use issue dependencies for blocking relationships that are not parent/child in nature.

Examples:

- `EPIC-010 live match server` -> parent issue
- `SRV-002 websocket action envelope` -> child/sub-issue of that epic
- `SRV-002` blocked by `CON-001 canonical action contract` -> issue dependency

## Canonical issue body shape
<!-- SECTION_REF: 31-github-board-and-story-ops.s008 -->
Section Ref: `31-github-board-and-story-ops.s008`

Every exported issue should contain these sections in this order:

1. Summary
2. Authoritative Spec References
3. Scope
4. Out of Scope
5. Dependencies
6. Acceptance Criteria
7. Required Tests
8. Repo Rules
9. Ambiguity Policy
10. Packet / implementation links

## Example issue body
<!-- SECTION_REF: 31-github-board-and-story-ops.s009 -->
Section Ref: `31-github-board-and-story-ops.s009`

```md
## Summary
Implement the default delayed-filtered spectator projection for ranked public matches.

## Authoritative Spec References
- 06-visibility-security.s008 (Spectator modes)
- 07-match-server-protocol.s017 (Spectator subscriptions)
- 08-replay-rollback-recovery.s036 (Full-information replay policy)

## Scope
- add delayed spectator projection selection for ranked public games
- apply the default 3-turn delay unless a stricter server policy exists
- preserve full-information replay generation outside live spectator views

## Out of Scope
- private-game custom delay UI
- replay viewer presentation changes
- moderation tooling

## Dependencies
- SRV-002
- RPY-001

## Acceptance Criteria
- [ ] ranked public spectators do not receive live current-turn hidden information
- [ ] default delay is 3 turns unless superseded by stricter server configuration
- [ ] full-information replay generation remains unaffected

## Required Tests
- integration test for ranked spectator stream delay
- regression test ensuring no opponent hand or deck-order leakage
- replay test confirming live spectator filtering does not alter stored replay data

## Repo Rules
- must pass pnpm verify
- must not import hidden-state helpers into client bundles
- must preserve visibility policy contracts

## Ambiguity Policy
fail_and_escalate
```

## Automation contract
<!-- SECTION_REF: 31-github-board-and-story-ops.s010 -->
Section Ref: `31-github-board-and-story-ops.s010`

Before creating or updating a GitHub issue from a story file, automation should:

1. validate the story against [`contracts/story.schema.json`](contracts/story.schema.json),
2. verify that every cited `spec_ref` exists in `section-index.json`,
3. render the canonical issue body shape,
4. create or update dependencies,
5. add the issue to the target project,
6. set project fields and labels,
7. persist the created issue URL or issue number back onto the story file or adjacent metadata.

The checked-in reference implementation for this contract is `node --experimental-strip-types tools/spec_board_sync.ts`. It reads approved stories, resolves `spec_refs`, renders the canonical issue body, syncs issues and project fields through GitHub CLI/GraphQL when configured, and writes per-story metadata to `stories/.sync/<STORY_ID>.github.json`.

## Human approval boundary
<!-- SECTION_REF: 31-github-board-and-story-ops.s011 -->
Section Ref: `31-github-board-and-story-ops.s011`

Default recommendation: use `--dry-run --write-preview` first when changing templates or field mappings, then perform live issue sync. Generate draft issues automatically if desired, but require human approval before they are marked `approved` or assigned to an implementation agent.

## Project templates and reuse
<!-- SECTION_REF: 31-github-board-and-story-ops.s012 -->
Section Ref: `31-github-board-and-story-ops.s012`

When multiple repos or seasons use the same workflow, create a reusable GitHub Project template with the same views, fields, and workflows so the board setup itself is standardized alongside the story schema.
