---
name: spec-story-review
description: Use this skill when reviewing a patch, pull request, or diff against one approved story and its cited OPTCG spec sections.
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "spec-story-review-skill"
doc_title: "Spec Story Review Skill"
doc_type: "agent-skill"
status: "canonical"
machine_readable: true
---

Review one patch against one approved story.

Checklist:

1. Read `AGENTS.md`.
2. Read the approved story file.
3. Read the cited spec sections.
4. Compare the patch to the exact scope, non-scope, acceptance criteria, and required tests.
5. Flag scope creep, uncited behavior, missing tests, hidden-information leaks, determinism risks, and contract drift.
6. Do not treat passing tests as sufficient if the implementation contradicts the spec.
