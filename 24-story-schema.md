---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "24-story-schema"
doc_title: "Story Schema"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Story Schema
<!-- SECTION_REF: 24-story-schema.s001 -->
Section Ref: `24-story-schema.s001`

This document defines the canonical structure for a spec-derived story. The purpose of the schema is to make stories machine-readable, reviewable, and safe to hand to agents without requiring each agent to reinterpret the entire specification.

A story is not authoritative product design. The specification remains authoritative. A story is a delivery artifact derived from the specification.

## Goals
<!-- SECTION_REF: 24-story-schema.s002 -->
Section Ref: `24-story-schema.s002`

The story schema must make the following explicit:

1. what the work item changes,
2. what spec sections authorize it,
3. what is in scope,
4. what is out of scope,
5. what tests are required,
6. what dependencies must exist first,
7. what an agent must do when the spec is ambiguous.

If those points are not represented, the story is incomplete.

## Story categories
<!-- SECTION_REF: 24-story-schema.s003 -->
Section Ref: `24-story-schema.s003`

Each story should declare exactly one primary `type`:

- `design`
- `implementation`
- `verification`
- `refactor`
- `tooling`
- `ambiguity`

Each story should also declare one primary `area`:

- `contracts`
- `engine`
- `cards`
- `server`
- `client`
- `replay`
- `database`
- `infra`
- `docs`
- `security`

These values may be extended later, but the meaning must remain stable for automation.

## Required fields
<!-- SECTION_REF: 24-story-schema.s004 -->
Section Ref: `24-story-schema.s004`

Every approved story must define all of the following fields:

- `spec_version`
- `spec_package_name`
- `story_schema_version`
- `id`
- `title`
- `type`
- `area`
- `priority`
- `status`
- `summary`
- `spec_refs`
- `scope`
- `non_scope`
- `dependencies`
- `acceptance_criteria`
- `required_tests`
- `repo_rules`
- `ambiguity_policy`

Optional fields may exist, but approved stories must not omit required fields.

## Field meanings
<!-- SECTION_REF: 24-story-schema.s005 -->
Section Ref: `24-story-schema.s005`


### `spec_version`
<!-- SECTION_REF: 24-story-schema.s006 -->
Section Ref: `24-story-schema.s006`

Must equal the canonical spec bundle version used to derive the story, for example `v6`.

### `spec_package_name`
<!-- SECTION_REF: 24-story-schema.s007 -->
Section Ref: `24-story-schema.s007`

Must equal the bundle/package identifier used to derive the story, for example `optcg-md-specs-v6`.

### `story_schema_version`
<!-- SECTION_REF: 24-story-schema.s008 -->
Section Ref: `24-story-schema.s008`

Schema version for story-file validation. For the initial v6 contract, use `1.0.0`.

### `id`
<!-- SECTION_REF: 24-story-schema.s009 -->
Section Ref: `24-story-schema.s009`

Stable unique identifier such as `ENG-012` or `SRV-004`.

### `title`
<!-- SECTION_REF: 24-story-schema.s010 -->
Section Ref: `24-story-schema.s010`

Single-sentence statement of the work item. It should describe one main behavior or one tightly-related implementation unit.

### `type`
<!-- SECTION_REF: 24-story-schema.s011 -->
Section Ref: `24-story-schema.s011`

Primary delivery type. Use one of the values defined above.

### `area`
<!-- SECTION_REF: 24-story-schema.s012 -->
Section Ref: `24-story-schema.s012`

Primary ownership area. This helps routing to the correct agent and validating package boundaries.

### `priority`
<!-- SECTION_REF: 24-story-schema.s013 -->
Section Ref: `24-story-schema.s013`

Expected values:

- `critical`
- `high`
- `medium`
- `low`

### `status`
<!-- SECTION_REF: 24-story-schema.s014 -->
Section Ref: `24-story-schema.s014`

Expected values:

- `generated`
- `approved`
- `in_progress`
- `blocked`
- `done`
- `replaced`

### `summary`
<!-- SECTION_REF: 24-story-schema.s015 -->
Section Ref: `24-story-schema.s015`

Short explanation of why the story exists and what it should accomplish.

### `spec_refs`
<!-- SECTION_REF: 24-story-schema.s016 -->
Section Ref: `24-story-schema.s016`

List of exact spec section references that authorize the story. These references are mandatory. In v6, `spec_refs` should use stable `SECTION_REF` identifiers such as `07-match-server-protocol.s010 (Timers)` instead of renderer-specific heading anchors. The story must not ask the agent to invent uncited behavior.

### `scope`
<!-- SECTION_REF: 24-story-schema.s017 -->
Section Ref: `24-story-schema.s017`

List of the specific changes that are in scope.

### `non_scope`
<!-- SECTION_REF: 24-story-schema.s018 -->
Section Ref: `24-story-schema.s018`

List of changes that are explicitly excluded. This is required because agents tend to broaden tasks unless boundaries are named.

### `dependencies`
<!-- SECTION_REF: 24-story-schema.s019 -->
Section Ref: `24-story-schema.s019`

List of story IDs, contracts, or repo prerequisites that must already exist.

### `acceptance_criteria`
<!-- SECTION_REF: 24-story-schema.s020 -->
Section Ref: `24-story-schema.s020`

Behavioral conditions that must be true for the story to be considered complete.

### `required_tests`
<!-- SECTION_REF: 24-story-schema.s021 -->
Section Ref: `24-story-schema.s021`

Tests that must be added or updated in the same change. This may include unit, integration, replay, hidden-information, fixture, or schema-validation tests.

### `repo_rules`
<!-- SECTION_REF: 24-story-schema.s022 -->
Section Ref: `24-story-schema.s022`

Mechanical repo requirements that apply to the story, such as `pnpm verify`, deterministic engine rules, hidden-information safety, or package-boundary restrictions.

### `ambiguity_policy`
<!-- SECTION_REF: 24-story-schema.s023 -->
Section Ref: `24-story-schema.s023`

Required values:

- `fail_and_escalate`
- `implement_if_clearly_implied`

Default for gameplay, security, visibility, replay, and timer stories should be `fail_and_escalate`.

## Canonical YAML shape
<!-- SECTION_REF: 24-story-schema.s024 -->
Section Ref: `24-story-schema.s024`

```yaml
spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: ENG-012
title: Implement mulligan waiting-state clock behavior
type: implementation
area: engine
priority: high
status: approved
summary: >
  Implement mulligan waiting-state progression with no separate mulligan timer.
spec_refs:
  - 07-match-server-protocol.s010 (Timers)
  - 11-testing-quality.s013 (Protocol tests)
  - 18-acceptance-tests.s021 (Milestone 1 - terminal engine)
scope:
  - add mulligan submitted and waiting states to engine flow
  - drain only the blocking player's game clock
  - preserve replayable event output if already defined for this phase
non_scope:
  - reconnect behavior
  - client UX polish
  - new spectator features
dependencies:
  - CON-001
  - ENG-003
acceptance_criteria:
  - no separate mulligan timer exists
  - only the player currently preventing progression loses clock time
  - if neither player is preventing progression, no player clock drains
  - a player loses if their clock reaches zero during this phase
required_tests:
  - unit test for each mulligan state combination
  - integration test for end-to-end mulligan progression
  - replay/event assertion if mulligan events are journaled
repo_rules:
  - must pass pnpm verify
  - engine behavior must remain deterministic
  - no hidden-information leakage is allowed
ambiguity_policy: fail_and_escalate
```

## Story sizing rules
<!-- SECTION_REF: 24-story-schema.s025 -->
Section Ref: `24-story-schema.s025`

Approved stories should usually fit within a single reviewable pull request. If a story would require broad changes across multiple areas or cannot be tested clearly, split it.

A story is too large if it:

- changes multiple systems with different review concerns,
- requires the agent to choose architecture rather than implement it,
- cannot state acceptance criteria in a few bullets,
- cannot be validated by a targeted set of tests.

## Approval rule
<!-- SECTION_REF: 24-story-schema.s026 -->
Section Ref: `24-story-schema.s026`

A generated story is not assignment-ready until it is either:

- manually approved by the project owner, or
- normalized and approved by an explicit review workflow that verifies schema completeness and valid spec references.

Only approved stories should be turned into agent packets.


## Machine-readable validation contract
<!-- SECTION_REF: 24-story-schema.s027 -->
Section Ref: `24-story-schema.s027`

The machine-readable validation contract for approved story files is [`contracts/story.schema.json`](contracts/story.schema.json). Markdown guidance in this file is explanatory; the JSON Schema is the canonical validation artifact for automation.
