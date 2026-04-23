---
name: spec-story-implementation
description: Use this skill when implementing one approved story from the OPTCG spec-driven backlog. It should not trigger for broad design work or for uncited feature ideation.
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "spec-story-implementation-skill"
doc_title: "Spec Story Implementation Skill"
doc_type: "agent-skill"
status: "canonical"
machine_readable: true
---

Implement one approved story at a time.

Steps:

1. Read `AGENTS.md`.
2. Read the approved story file and validate its scope mentally against `contracts/story.schema.json`.
3. Read the packet if one exists.
4. Read only the cited spec sections and directly related contracts.
5. Implement the smallest patch that satisfies the acceptance criteria.
6. Add or update the required tests.
7. Report exact files changed, tests run, assumptions, and ambiguities.

Stop and escalate if:

- the story is ambiguous in a gameplay, visibility, replay, timer, fairness, or persistence area,
- the requested patch would exceed the story scope,
- the cited spec sections do not authorize the behavior.
