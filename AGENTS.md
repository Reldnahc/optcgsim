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
3. agent packet,
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
- For canonical or exported APIs, do not fabricate authoritative placeholder runtime data. Source it from authoritative state, or fail closed and escalate the contract gap on `main` before continuing.
- For approved stories, start from the approved agent packet when it exists in `agent-packets/approved/`, while treating the approved story file as canonical and the packet as the execution brief.
- If a story cannot be completed safely because of a missing dependency, unresolved ambiguity, missing approved prerequisite, or contradictory spec/story inputs, stop at the narrowest safe point and return with the blocker plus concrete follow-up questions; do not force an implementation through.
- If implementation reveals a required change to canonical contracts, shared specs, or repo-wide workflow outside the approved story scope, do not silently mix that change into the story branch. Stop and escalate, or get explicit approval to land the cross-story change separately on `main` first and then merge/rebase it into the story branch.
- Add or update tests required by the story.
- Keep deterministic engine behavior and hidden-information safety intact.
- When requesting persistent command approval for recurring workflow actions, request the stable command prefix rather than a message-specific or argument-specific variant. For example, prefer `git commit` over `git commit -m "exact message"` so future commits do not require re-approval for each new message.
- When review or testing finds a bug in a contract-heavy subsystem such as filtering, pending decisions, hashing, invariants, timers, or computed views, do not patch only the cited branch. Sweep every sibling projection or serializer in that subsystem before requesting review again.
- For any rule that affects multiple output surfaces, centralize it behind one helper or one authoritative source of truth. Do not maintain parallel logic for the same rule in `computeView`, `PlayerView`, legal-action generation, invariants, or replay projection.
- If the same subsystem is flagged twice in one story, stop doing comment-by-comment patches. Write down the shared rule, identify every call site, tighten the helper ownership, expand the regression matrix, and only then resume implementation.
- When a bug appears in one member of a serializer family, add the sibling regression matrix before review. Prefer one matrix that covers chooser/opponent, public/private, visible/hidden zone, and setup/active status combinations over one-off regressions.
- For authoritative exported APIs, projections must consume authoritative computed state when it exists. Do not rebuild printed or placeholder values in `PlayerView` or other DTOs when `computeView` or another canonical derivation already owns that truth.
- Before sending a story for human or product review, run a local non-interactive Codex review against the intended base branch and treat its findings as required triage input, not optional advice.
- When local Codex review finds a bug in a contract-heavy subsystem, do the subsystem sweep and sibling regression expansion before requesting external review again.
- After any local Codex review that returns actionable findings, post a PR comment summary of those findings before the next external review request. When the findings are resolved, update that thread or post a short follow-up note so the PR preserves the review trail.
- Prefer repo-owned workflow entrypoints under `npm run stories:*` and `npm run stories:verify` over invoking individual tool files directly, unless a story or review task explicitly requires the lower-level tool.
- Use one branch and one pull request per story by default. Review should happen on the PR diff against the approved story and packet, not only on the issue.
- Story execution lifecycle is: `approved` -> `in_progress` -> `in_review` -> `done`, with `changes_requested` and `blocked` as valid side states when review or execution finds real blockers.
- A story PR should contain only changes that are in scope for that story against the current `main`. If a necessary prerequisite lands separately on `main`, merge or rebase `main` into the story branch before further review rather than carrying the prerequisite as story-only diff.
- Standard story workflow is:
  - `npm run stories:branch -- --id STORY-ID`
  - `npm run stories:start -- --id STORY-ID`
  - implement on the story branch
- `npm run stories:verify`
- for `area: contracts`, run `npm run stories:contract-audit -- --id STORY-ID` on a clean worktree after the implementation commit that is intended for review
- `npm run stories:pr -- --id STORY-ID --push`
- `codex exec review --base main "Review this PR against the approved story and packet. Focus on correctness, hidden-information leaks, invariant gaps, deterministic behavior, and scope violations."`
- `npm run stories:request-review -- --id STORY-ID`
- Codex review on the PR diff
- `npm run stories:changes-requested -- --id STORY-ID` or `npm run stories:complete -- --id STORY-ID`
- Contract stories must not move to `in_review` until the contract audit artifact exists for the current `HEAD`, `stories:verify` passed during that audit, and the worktree is clean. This is a hard gate, not a convention.
- When a story is approved through the workflow, the expected automation path is: promote story -> build approved packet -> sync issue/project. Do not treat local story approval as complete until packet and board state are also updated.
- Before moving a story to `in_review` or `done`, ensure the story has PR metadata in `stories/.sync/<STORY-ID>.github.json`.
- One narrow exception exists: `INF-001` may complete without PR metadata because it established the repo baseline on `main` before the branch/PR workflow existed. Do not generalize that exception to later stories.
- When projecting approved stories to GitHub issues or boards, use `node --experimental-strip-types tools/spec_board_sync.ts` instead of hand-editing canonical issue sections.

## Where to look first

<!-- SECTION_REF: AGENTS.s004 -->

Section Ref: `AGENTS.s004`

- spec docs: `specs/`
- approved stories: `stories/approved/`
- done stories: `stories/done/`
- blocked stories: `stories/blocked/`
- example approved stories: `stories/approved/examples/`
- approved packets: `agent-packets/approved/`
- generated packets: `agent-packets/generated/`
- review surface: `stories/review/index.html`
- story schema contract: `contracts/story.schema.json`
- section lookup: `section-index.json`
- board sync tool: `tools/spec_board_sync.ts`
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
6. blockers and follow-up questions if the story could not be completed end to end,
7. follow-up risks if any remain,
8. synced issue URL or issue number if board sync was performed.
