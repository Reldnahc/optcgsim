---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "AGENTS"
doc_title: "Agent Instructions"
doc_type: "operational-guidance"
status: "canonical"
machine_readable: true
---

# Agent Instructions
<!-- SECTION_REF: AGENTS.s001 -->
Section Ref: `AGENTS.s001`

Read this file before implementing, reviewing, or rewriting any story-driven task in this repository.

## Authority order
<!-- SECTION_REF: AGENTS.s002 -->
Section Ref: `AGENTS.s002`

1. cited spec sections,
2. approved story file,
3. generated agent packet,
4. this file,
5. local code reality,
6. proposed patch.

If a lower layer conflicts with a higher layer, the higher layer wins.

## Required working rules
<!-- SECTION_REF: AGENTS.s003 -->
Section Ref: `AGENTS.s003`

- Do not invent uncited behavior.
- Stay within story scope.
- Preserve explicit non-scope.
- Prefer section refs such as `07-match-server-protocol.s010` in notes and reviews.
- For gameplay, visibility, replay, fairness, timer, and persistence ambiguity, fail closed and escalate.
- Add or update tests required by the story.
- Keep deterministic engine behavior and hidden-information safety intact.
- When projecting approved stories to GitHub issues or boards, use `python3 tools/spec_board_sync.py` instead of hand-editing canonical issue sections.

## Where to look first
<!-- SECTION_REF: AGENTS.s004 -->
Section Ref: `AGENTS.s004`

- approved stories: `stories/approved/`
- example approved stories: `stories/approved/examples/`
- packets: `agent-packets/`
- story schema contract: `contracts/story.schema.json`
- section lookup: `section-index.json`
- board sync tool: `tools/spec_board_sync.py`
- board sync config example: `tools/github-board.config.example.json`
- board sync metadata: `stories/.sync/`

## Completion note format
<!-- SECTION_REF: AGENTS.s005 -->
Section Ref: `AGENTS.s005`

When reporting completion, include:

1. files changed,
2. acceptance criteria satisfied,
3. tests run or updated,
4. assumptions made,
5. ambiguities surfaced,
6. follow-up risks if any remain,
7. synced issue URL or issue number if board sync was performed.
