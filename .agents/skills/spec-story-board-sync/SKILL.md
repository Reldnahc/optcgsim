---
name: spec-story-board-sync
description: Use this skill when projecting one or more approved OPTCG stories onto GitHub issues or a GitHub Project board.
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "spec-story-board-sync-skill"
doc_title: "Spec Story Board Sync Skill"
doc_type: "agent-skill"
status: "canonical"
machine_readable: true
---

Sync approved stories to GitHub by running the checked-in sync tool, not by hand-writing issue bodies.

Steps:

1. Read `AGENTS.md`.
2. Read the approved story file.
3. Validate the story against `contracts/story.schema.json` conceptually or by using `tools/spec_board_sync.py` in `--dry-run` mode.
4. Use `tools/spec_board_sync.py` to render or sync the issue projection.
5. Preserve the approved story as the authority and write sync state into `stories/.sync/`.
6. If a GitHub Project is configured, set fields from the story instead of inventing project-only values.

Rules:

- Do not treat the GitHub issue as the source of truth.
- Do not hand-edit canonical sections on the issue when the story file should be changed instead.
- Do not silently drop invalid `spec_refs`; fail the sync and surface the error.
- Prefer `--dry-run --write-preview` before live sync when changing templates or mappings.
