---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "25-story-template"
doc_title: "Story Template"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Approved Story Template
<!-- SECTION_REF: 25-story-template.s001 -->
Section Ref: `25-story-template.s001`

This document provides the standard story template to use after a generated story is accepted into the approved backlog.

The goal of the template is consistency. Stories should not vary widely in format, because inconsistency makes automation and agent assignment harder.

## Usage rules
<!-- SECTION_REF: 25-story-template.s002 -->
Section Ref: `25-story-template.s002`

- Keep the story tightly scoped.
- Cite the authoritative spec sections.
- State explicit non-scope.
- Require tests in the same story.
- Use `fail_and_escalate` when ambiguity would affect rules correctness, hidden information, replay integrity, fairness, or account/persistence safety.

## Copy-ready template
<!-- SECTION_REF: 25-story-template.s003 -->
Section Ref: `25-story-template.s003`

```yaml
spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: AREA-XXX
title: <single-sentence story title>
type: <design|implementation|verification|refactor|tooling|ambiguity>
area: <contracts|engine|cards|server|client|replay|database|infra|docs|security>
priority: <critical|high|medium|low>
status: approved
summary: >
  <brief explanation of why the story exists and what it should accomplish>
spec_refs:
  - <doc_id.sNNN (Heading)>
  - <doc_id.sNNN (Heading)>
scope:
  - <specific deliverable>
  - <specific deliverable>
non_scope:
  - <explicitly excluded item>
  - <explicitly excluded item>
dependencies:
  - <story id, contract, or prerequisite>
acceptance_criteria:
  - <observable completion condition>
  - <observable completion condition>
required_tests:
  - <unit/integration/contract/replay/visibility test requirement>
  - <unit/integration/contract/replay/visibility test requirement>
repo_rules:
  - must pass pnpm verify
  - must follow package boundary rules
  - must not introduce hidden-information leakage
ambiguity_policy: <fail_and_escalate|implement_if_clearly_implied>
```

## Author guidance
<!-- SECTION_REF: 25-story-template.s004 -->
Section Ref: `25-story-template.s004`

### Title
<!-- SECTION_REF: 25-story-template.s005 -->
Section Ref: `25-story-template.s005`

The title should describe one main behavior change or one main deliverable. Avoid broad titles such as `Implement spectator mode` or `Build game flow`.

### Scope
<!-- SECTION_REF: 25-story-template.s006 -->
Section Ref: `25-story-template.s006`

Scope should be concrete enough that two reviewers would expect roughly the same patch from the same story.

### Non-scope
<!-- SECTION_REF: 25-story-template.s007 -->
Section Ref: `25-story-template.s007`

Non-scope should be explicit whenever a nearby concern exists that an agent might be tempted to include.

### Acceptance criteria
<!-- SECTION_REF: 25-story-template.s008 -->
Section Ref: `25-story-template.s008`

Acceptance criteria should describe behavior, not internal aspirations. Write them so a reviewer or test author can verify them.

### Required tests
<!-- SECTION_REF: 25-story-template.s009 -->
Section Ref: `25-story-template.s009`

The default assumption is that implementation work includes tests. If a story does not require tests, that must be justified explicitly.

## Example approved story
<!-- SECTION_REF: 25-story-template.s010 -->
Section Ref: `25-story-template.s010`

```yaml
id: SEC-005
title: Add delayed spectator projection for ranked public matches
type: implementation
area: server
priority: high
status: approved
summary: >
  Implement the default delayed-filtered spectator projection for ranked public
  matches so spectators do not receive current-turn hidden information.
spec_refs:
  - 06-visibility-security.s008 (Spectator modes)
  - 07-match-server-protocol.s017 (Spectator subscriptions)
  - 08-replay-rollback-recovery.s036 (Full-information replay policy)
scope:
  - add delayed spectator projection selection for ranked public games
  - apply the default 3-turn delay unless a stricter server policy exists
  - preserve full-information replay generation outside live spectator views
non_scope:
  - private-game custom delay UI
  - replay viewer presentation changes
  - moderation tooling
dependencies:
  - SRV-002
  - RPY-001
acceptance_criteria:
  - ranked public spectators do not receive live current-turn hidden information
  - default delay is 3 turns unless superseded by stricter server configuration
  - full-information replay generation remains unaffected
required_tests:
  - integration test for ranked spectator stream delay
  - regression test ensuring no opponent hand or deck-order leakage
  - replay test confirming live spectator filtering does not alter stored replay data
repo_rules:
  - must pass pnpm verify
  - must not import hidden-state helpers into client bundles
  - must preserve visibility policy contracts
ambiguity_policy: fail_and_escalate
```
