---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "26-agent-packet-template"
doc_title: "Agent Packet Template"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Agent Packet Template
<!-- SECTION_REF: 26-agent-packet-template.s001 -->
Section Ref: `26-agent-packet-template.s001`

This document defines the standard packet format used to assign one approved story to an implementation, review, or verification agent.

The purpose of a packet is to reduce interpretation overhead. Agents should not be expected to rediscover requirements from the entire specification when a constrained story already exists.

## Core rule
<!-- SECTION_REF: 26-agent-packet-template.s002 -->
Section Ref: `26-agent-packet-template.s002`

The packet is derived from the specification and approved story. It is not a new authority. If the packet conflicts with the cited specification, the specification wins.

## Packet requirements
<!-- SECTION_REF: 26-agent-packet-template.s003 -->
Section Ref: `26-agent-packet-template.s003`

Every packet must include:

1. the approved story identifier and title,
2. why the story exists,
3. authoritative spec section references,
4. copied or summarized relevant spec excerpts,
5. scope,
6. non-scope,
7. constraints and repo rules,
8. required tests,
9. expected output format,
10. ambiguity handling instructions.

## Standard packet template
<!-- SECTION_REF: 26-agent-packet-template.s004 -->
Section Ref: `26-agent-packet-template.s004`

```md
# Story Packet

## Story
Spec Version: v6
Story Schema Version: 1.0.0
ID: <story id>
Title: <story title>
Type: <story type>
Area: <story area>

## Why
<brief explanation of why the change exists>

## Authoritative Spec References
- <doc_id.sNNN (Heading)>
- <doc_id.sNNN (Heading)>

## Relevant Spec Excerpts
<copy or summarize only the relevant portions needed to execute the story>

## Scope
- <in-scope deliverable>
- <in-scope deliverable>

## Out of Scope
- <non-scope item>
- <non-scope item>

## Constraints
- <repo/tooling requirement>
- <architecture boundary>
- <determinism or visibility invariant>

## Required Tests
- <required test>
- <required test>

## Expected Output
- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria
- [ ] <criterion>
- [ ] <criterion>

## Ambiguity Rule
If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.
```

## Packet construction rules
<!-- SECTION_REF: 26-agent-packet-template.s005 -->
Section Ref: `26-agent-packet-template.s005`

When building a packet from an approved story:

- include only the relevant spec material,
- do not dump the entire spec by default,
- preserve exact acceptance criteria from the story,
- preserve non-scope unchanged,
- include the applicable repo rules from [`23-repo-tooling-and-enforcement.md`](23-repo-tooling-and-enforcement.md),
- include code and architecture constraints from the relevant documents,
- include the approved ambiguity policy.

## Recommended agent instruction footer
<!-- SECTION_REF: 26-agent-packet-template.s006 -->
Section Ref: `26-agent-packet-template.s006`

Add the following style of instruction to all packets:

```text
You are implementing a constrained story in an existing codebase.
The cited specification is authoritative.
Do not invent behavior not supported by the cited spec.
Stay within scope.
Follow repo tooling and code standard requirements.
Include tests for the listed acceptance criteria.
If the spec is ambiguous, report the ambiguity instead of guessing.
```

## Recommended review-agent footer
<!-- SECTION_REF: 26-agent-packet-template.s007 -->
Section Ref: `26-agent-packet-template.s007`

For review or verification agents, add:

```text
Compare the implementation against the approved story and cited specification.
Flag uncited behavior, scope creep, missing tests, visibility leaks, determinism risks,
and package-boundary violations.
Do not treat passing tests as proof if the behavior contradicts the specification.
```
