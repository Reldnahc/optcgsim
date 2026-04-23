#!/usr/bin/env python3
"""Sync approved OPTCG story files to GitHub issues and Projects.

This tool is intentionally dependency-light:
- It can parse canonical story YAML using PyYAML if available.
- If PyYAML is unavailable, it falls back to a restricted parser that supports
  the exact YAML subset used by the approved story schema examples in this spec.
- It validates the story against the v6 story contract rules needed for board sync.
- It can render canonical GitHub issue bodies in dry-run mode without network access.
- In live mode it shells out to `gh` for GitHub REST and GraphQL operations.

Typical usage:
  python3 tools/spec_board_sync.py \
    --story stories/approved/examples/SEC-005.story.yaml \
    --config tools/github-board.config.example.json \
    --dry-run

  python3 tools/spec_board_sync.py \
    --stories-glob 'stories/approved/**/*.story.yaml' \
    --config .github/spec-board.config.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STORIES_GLOB = "stories/approved/**/*.story.yaml"
DEFAULT_SYNC_DIR = Path("stories/.sync")
DEFAULT_CONFIG_PATH = Path("tools/github-board.config.example.json")

REQUIRED_TOP_LEVEL_FIELDS = [
    "spec_version",
    "spec_package_name",
    "story_schema_version",
    "id",
    "title",
    "type",
    "area",
    "priority",
    "status",
    "summary",
    "spec_refs",
    "scope",
    "non_scope",
    "dependencies",
    "acceptance_criteria",
    "required_tests",
    "repo_rules",
    "ambiguity_policy",
]

ALLOWED_TOP_LEVEL_FIELDS = set(REQUIRED_TOP_LEVEL_FIELDS + ["board", "agent"])
ALLOWED_BOARD_FIELDS = {"project", "parent_issue", "iteration", "estimate", "labels"}
ALLOWED_AGENT_FIELDS = {"packet_path", "implementation_skill", "review_skill"}

TYPE_VALUES = {"design", "implementation", "verification", "refactor", "tooling", "ambiguity"}
AREA_VALUES = {
    "contracts",
    "engine",
    "cards",
    "server",
    "client",
    "replay",
    "database",
    "infra",
    "docs",
    "security",
}
PRIORITY_VALUES = {"critical", "high", "medium", "low"}
STATUS_VALUES = {"generated", "approved", "in_progress", "blocked", "done", "replaced"}
AMBIGUITY_VALUES = {"fail_and_escalate", "implement_if_clearly_implied"}

STORY_ID_RE = re.compile(r"^[A-Z]{2,}-\d{3,}$")
SPEC_REF_RE = re.compile(r"^[A-Za-z0-9_-]+\.s\d{3}( \(.+\))?$")
SECTION_REF_EXTRACT_RE = re.compile(r"^(?P<section>[A-Za-z0-9_-]+\.s\d{3})(?: \(.+\))?$")

TOP_KEY_RE = re.compile(r"^(?P<key>[A-Za-z_][A-Za-z0-9_]*):(?:\s*(?P<value>.*))?$")

DEFAULT_PROJECT_FIELD_MAPPING = {
    "Status": {
        "source": "status",
        "option_map": {
            "generated": "Backlog",
            "approved": "Todo",
            "in_progress": "In Progress",
            "blocked": "Blocked",
            "done": "Done",
            "replaced": "Canceled",
        },
    },
    "Priority": {"source": "priority"},
    "Area": {"source": "area"},
    "Type": {"source": "type"},
    "Spec Version": {"source": "spec_version"},
    "Story ID": {"source": "id"},
    "Estimate": {"source": "board.estimate"},
    "Iteration": {"source": "board.iteration"},
}

DEFAULT_LABEL_COLORS = {
    "type": "8a8a8a",
    "area": "1d76db",
    "priority": "fbca04",
    "status": "0e8a16",
    "risk": "5319e7",
    "needs": "b60205",
}

DEFAULT_LABEL_DESCRIPTIONS = {
    "type": "Spec story dimension",
    "area": "Spec subsystem dimension",
    "priority": "Delivery priority",
    "status": "Story execution status",
    "risk": "Review or platform risk marker",
    "needs": "Workflow attention marker",
}


def eprint(*parts: object) -> None:
    print(*parts, file=sys.stderr)


class StorySyncError(RuntimeError):
    pass


class ValidationError(StorySyncError):
    pass


class GitHubSyncError(StorySyncError):
    pass


# ---------------------------------------------------------------------------
# YAML loading
# ---------------------------------------------------------------------------


def load_story_yaml(path: Path) -> Dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(text)
        if not isinstance(data, dict):
            raise ValidationError(f"Story file did not parse as a mapping: {path}")
        return data
    except ModuleNotFoundError:
        return parse_restricted_story_yaml(text, path)
    except Exception as exc:
        raise ValidationError(f"Failed to parse story YAML with PyYAML for {path}: {exc}") from exc



def parse_restricted_story_yaml(text: str, path: Path) -> Dict[str, Any]:
    """Parse the exact YAML subset used by canonical story examples.

    Supported:
    - top-level key/value scalars
    - top-level block scalars using `>` or `|`
    - top-level lists with `- item`
    - one-level nested mappings for `board` and `agent`
    - one nested list under a nested mapping (e.g. `board.labels`)
    """

    lines = text.splitlines()
    index = 0
    result: Dict[str, Any] = {}

    while index < len(lines):
        raw = lines[index]
        stripped = raw.strip()
        if not stripped or stripped == "---" or stripped.startswith("#"):
            index += 1
            continue
        if indent_of(raw) != 0:
            raise ValidationError(f"Unexpected indentation at top level in {path} on line {index + 1}: {raw!r}")
        match = TOP_KEY_RE.match(raw)
        if not match:
            raise ValidationError(f"Could not parse top-level key in {path} on line {index + 1}: {raw!r}")
        key = match.group("key")
        raw_value = (match.group("value") or "").rstrip()
        index += 1

        if raw_value in {">", "|"}:
            block_lines, index = collect_indented_block(lines, index, minimum_indent=2)
            result[key] = parse_block_scalar(block_lines, fold=(raw_value == ">"))
            continue

        if raw_value:
            result[key] = parse_scalar(raw_value)
            continue

        block_lines, index = collect_indented_block(lines, index, minimum_indent=2)
        result[key] = parse_indented_value(block_lines, base_indent=2, path=path, context=key)

    return result



def collect_indented_block(lines: List[str], start_index: int, minimum_indent: int) -> Tuple[List[str], int]:
    collected: List[str] = []
    index = start_index
    while index < len(lines):
        raw = lines[index]
        if not raw.strip():
            collected.append(raw)
            index += 1
            continue
        if indent_of(raw) < minimum_indent:
            break
        collected.append(raw)
        index += 1
    return collected, index



def parse_indented_value(lines: List[str], base_indent: int, path: Path, context: str) -> Any:
    first = next((line for line in lines if line.strip()), None)
    if first is None:
        return []
    trimmed = first[base_indent:]
    if trimmed.startswith("- "):
        return parse_list_block(lines, indent=base_indent, path=path, context=context)
    return parse_mapping_block(lines, indent=base_indent, path=path, context=context)



def parse_list_block(lines: List[str], indent: int, path: Path, context: str) -> List[Any]:
    items: List[Any] = []
    index = 0
    while index < len(lines):
        raw = lines[index]
        stripped = raw.strip()
        if not stripped:
            index += 1
            continue
        actual_indent = indent_of(raw)
        if actual_indent != indent:
            raise ValidationError(
                f"Unexpected indentation in list {context!r} in {path} on line fragment: {raw!r}"
            )
        trimmed = raw[indent:]
        if not trimmed.startswith("- "):
            raise ValidationError(f"Expected list item in {context!r} in {path}: {raw!r}")
        value = trimmed[2:].rstrip()
        if value in {">", "|"}:
            nested, next_index = collect_indented_block(lines, index + 1, minimum_indent=indent + 2)
            items.append(parse_block_scalar(nested, fold=(value == ">")))
            index = next_index
            continue
        items.append(parse_scalar(value))
        index += 1
    return items



def parse_mapping_block(lines: List[str], indent: int, path: Path, context: str) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    index = 0
    while index < len(lines):
        raw = lines[index]
        stripped = raw.strip()
        if not stripped:
            index += 1
            continue
        actual_indent = indent_of(raw)
        if actual_indent != indent:
            raise ValidationError(
                f"Unexpected indentation in mapping {context!r} in {path} on line fragment: {raw!r}"
            )
        trimmed = raw[indent:]
        match = TOP_KEY_RE.match(trimmed)
        if not match:
            raise ValidationError(f"Could not parse nested key in {context!r} in {path}: {raw!r}")
        key = match.group("key")
        raw_value = (match.group("value") or "").rstrip()
        index += 1
        if raw_value in {">", "|"}:
            nested, index = collect_indented_block(lines, index, minimum_indent=indent + 2)
            result[key] = parse_block_scalar(nested, fold=(raw_value == ">"))
            continue
        if raw_value:
            result[key] = parse_scalar(raw_value)
            continue
        nested, index = collect_indented_block(lines, index, minimum_indent=indent + 2)
        result[key] = parse_indented_value(nested, base_indent=indent + 2, path=path, context=f"{context}.{key}")
    return result



def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))



def parse_block_scalar(lines: List[str], fold: bool) -> str:
    processed = []
    for raw in lines:
        if not raw.strip():
            processed.append("")
            continue
        # Strip exactly two spaces of indentation relative to the parent block.
        processed.append(raw[2:] if raw.startswith("  ") else raw.lstrip())
    if not fold:
        return "\n".join(processed).strip()

    paragraphs: List[str] = []
    current: List[str] = []
    for line in processed:
        if line == "":
            if current:
                paragraphs.append(" ".join(part.strip() for part in current if part.strip()))
                current = []
            else:
                paragraphs.append("")
            continue
        current.append(line)
    if current:
        paragraphs.append(" ".join(part.strip() for part in current if part.strip()))
    folded = "\n\n".join(part for part in paragraphs if part != "")
    return folded.strip()



def parse_scalar(raw_value: str) -> Any:
    value = raw_value.strip()
    if not value:
        return ""
    if value.startswith("\"") and value.endswith("\""):
        return value[1:-1]
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1]
    if value in {"true", "false"}:
        return value == "true"
    if re.fullmatch(r"-?\d+", value):
        try:
            return int(value)
        except ValueError:
            return value
    if re.fullmatch(r"-?\d+\.\d+", value):
        try:
            return float(value)
        except ValueError:
            return value
    return value


# ---------------------------------------------------------------------------
# Validation and refs
# ---------------------------------------------------------------------------


def validate_story(story: Dict[str, Any], story_path: Path) -> None:
    errors: List[str] = []

    missing = [field for field in REQUIRED_TOP_LEVEL_FIELDS if field not in story]
    if missing:
        errors.append(f"missing required fields: {', '.join(sorted(missing))}")

    unexpected = sorted(set(story.keys()) - ALLOWED_TOP_LEVEL_FIELDS)
    if unexpected:
        errors.append(f"unexpected top-level fields: {', '.join(unexpected)}")

    const_checks = {
        "spec_version": "v6",
        "spec_package_name": "optcg-md-specs-v6",
        "story_schema_version": "1.0.0",
    }
    for key, expected in const_checks.items():
        if key in story and story[key] != expected:
            errors.append(f"{key} must equal {expected!r}, got {story[key]!r}")

    if "id" in story and (not isinstance(story["id"], str) or not STORY_ID_RE.fullmatch(story["id"])):
        errors.append("id must match ^[A-Z]{2,}-\\d{3,}$")

    nonempty_strings = ["title", "summary"]
    for key in nonempty_strings:
        if key in story and (not isinstance(story[key], str) or not story[key].strip()):
            errors.append(f"{key} must be a non-empty string")

    enum_checks = {
        "type": TYPE_VALUES,
        "area": AREA_VALUES,
        "priority": PRIORITY_VALUES,
        "status": STATUS_VALUES,
        "ambiguity_policy": AMBIGUITY_VALUES,
    }
    for key, allowed in enum_checks.items():
        if key in story and story[key] not in allowed:
            errors.append(f"{key} must be one of {sorted(allowed)}, got {story[key]!r}")

    list_string_fields = [
        "spec_refs",
        "scope",
        "non_scope",
        "dependencies",
        "acceptance_criteria",
        "required_tests",
        "repo_rules",
    ]
    for key in list_string_fields:
        if key not in story:
            continue
        value = story[key]
        if not isinstance(value, list):
            errors.append(f"{key} must be a list")
            continue
        if key != "dependencies" and len(value) == 0:
            errors.append(f"{key} must have at least one item")
        for idx, item in enumerate(value):
            if not isinstance(item, (str, int, float)):
                errors.append(f"{key}[{idx}] must be a scalar string-like value")
                continue
            item_str = str(item).strip()
            if not item_str:
                errors.append(f"{key}[{idx}] must not be blank")
            if key == "spec_refs" and not SPEC_REF_RE.fullmatch(item_str):
                errors.append(f"{key}[{idx}] must match spec ref pattern, got {item_str!r}")

    if "board" in story:
        if not isinstance(story["board"], dict):
            errors.append("board must be an object")
        else:
            unexpected_board = sorted(set(story["board"].keys()) - ALLOWED_BOARD_FIELDS)
            if unexpected_board:
                errors.append(f"unexpected board fields: {', '.join(unexpected_board)}")
            labels = story["board"].get("labels")
            if labels is not None:
                if not isinstance(labels, list):
                    errors.append("board.labels must be a list")
                else:
                    for idx, label in enumerate(labels):
                        if not isinstance(label, (str, int, float)) or not str(label).strip():
                            errors.append(f"board.labels[{idx}] must be a non-empty string-like value")

    if "agent" in story:
        if not isinstance(story["agent"], dict):
            errors.append("agent must be an object")
        else:
            unexpected_agent = sorted(set(story["agent"].keys()) - ALLOWED_AGENT_FIELDS)
            if unexpected_agent:
                errors.append(f"unexpected agent fields: {', '.join(unexpected_agent)}")

    if errors:
        raise ValidationError(f"Story validation failed for {story_path}:\n- " + "\n- ".join(errors))



def load_section_index(path: Path) -> Dict[str, Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    sections = data.get("sections")
    if not isinstance(sections, list):
        raise ValidationError(f"section-index.json did not contain a sections array: {path}")
    return {entry["section_ref"]: entry for entry in sections if isinstance(entry, dict) and "section_ref" in entry}



def normalize_spec_ref(spec_ref: str) -> str:
    match = SECTION_REF_EXTRACT_RE.fullmatch(spec_ref.strip())
    if not match:
        raise ValidationError(f"Invalid spec ref format: {spec_ref!r}")
    return match.group("section")



def extract_spec_ref_label(spec_ref: str) -> Optional[str]:
    text = spec_ref.strip()
    start = text.find(" (")
    if start == -1 or not text.endswith(")"):
        return None
    return text[start + 2 : -1].strip() or None



def resolve_spec_refs(story: Dict[str, Any], section_lookup: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    resolved: List[Dict[str, Any]] = []
    missing: List[str] = []
    mismatched_labels: List[str] = []
    for raw in story["spec_refs"]:
        raw_str = str(raw).strip()
        normalized = normalize_spec_ref(raw_str)
        entry = section_lookup.get(normalized)
        if entry is None:
            missing.append(raw_str)
            continue
        supplied_label = extract_spec_ref_label(raw_str)
        actual_heading = entry.get("heading")
        if supplied_label and actual_heading and supplied_label != actual_heading:
            mismatched_labels.append(
                f"{raw_str} -> actual heading is {actual_heading!r}"
            )
        resolved.append(
            {
                "raw": raw_str,
                "section_ref": normalized,
                "doc_id": entry.get("doc_id"),
                "path": entry.get("path"),
                "heading": actual_heading,
                "level": entry.get("level"),
            }
        )
    if missing:
        raise ValidationError("Story references missing section refs: " + ", ".join(missing))
    if mismatched_labels:
        raise ValidationError(
            "Story references use stale or incorrect heading labels\n- " + "\n- ".join(mismatched_labels)
        )
    return resolved


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------


def build_issue_title(story: Dict[str, Any]) -> str:
    return f"[{story['id']}] {story['title']}"



def label_set_for_story(story: Dict[str, Any], include_status: bool = False, defaults: Optional[List[str]] = None) -> List[str]:
    labels = []
    if defaults:
        labels.extend([label for label in defaults if label])
    labels.append(f"type:{story['type']}")
    labels.append(f"area:{story['area']}")
    labels.append(f"priority:{story['priority']}")
    if include_status:
        labels.append(f"status:{story['status']}")
    board = story.get("board") or {}
    for label in board.get("labels", []) if isinstance(board, dict) else []:
        label_text = str(label).strip()
        if label_text:
            labels.append(label_text)
    # Preserve order while deduplicating.
    seen = set()
    ordered = []
    for label in labels:
        if label not in seen:
            seen.add(label)
            ordered.append(label)
    return ordered



def load_sync_index(sync_dir: Path) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    if not sync_dir.exists():
        return index
    for path in sorted(sync_dir.rglob("*.github.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            story_id = payload.get("story_id")
            if isinstance(story_id, str) and story_id:
                payload["_metadata_path"] = str(path)
                index[story_id] = payload
        except Exception:
            continue
    return index



def render_dependencies(dependencies: List[Any], sync_index: Dict[str, Dict[str, Any]]) -> List[str]:
    rendered: List[str] = []
    for raw in dependencies:
        dep = str(raw).strip()
        if not dep:
            continue
        metadata = sync_index.get(dep)
        if metadata and metadata.get("issue_number"):
            issue_number = metadata.get("issue_number")
            issue_url = metadata.get("issue_url")
            if issue_number:
                rendered.append(f"- {dep} (#{issue_number})")
            elif issue_url:
                rendered.append(f"- {dep} ({issue_url})")
            else:
                rendered.append(f"- {dep}")
        else:
            rendered.append(f"- {dep}")
    if not rendered:
        rendered.append("- none")
    return rendered



def render_issue_body(
    story: Dict[str, Any],
    story_path: Path,
    resolved_spec_refs: List[Dict[str, Any]],
    sync_index: Dict[str, Dict[str, Any]],
    sync_metadata_relpath: Path,
) -> str:
    lines: List[str] = []
    lines.append("<!-- Generated by tools/spec_board_sync.py from the approved story file. -->")
    lines.append("")
    lines.append(
        "_This issue is a synchronized projection of the approved story. Edit the story file, then rerun the sync tool instead of hand-editing authoritative sections here._"
    )
    lines.append("")
    lines.append("## Summary")
    lines.append(story["summary"].strip())
    lines.append("")
    lines.append("**Story ID:** `{}`  ".format(story["id"]))
    lines.append("**Spec Version:** `{}`  ".format(story["spec_version"]))
    lines.append("**Type:** `{}`  ".format(story["type"]))
    lines.append("**Area:** `{}`  ".format(story["area"]))
    lines.append("**Priority:** `{}`  ".format(story["priority"]))
    lines.append("**Status:** `{}`".format(story["status"]))
    lines.append("")
    lines.append("## Authoritative Spec References")
    for ref in resolved_spec_refs:
        heading = f" ({ref['heading']})" if ref.get("heading") else ""
        lines.append(f"- {ref['section_ref']}{heading}")
    lines.append("")
    lines.append("## Scope")
    lines.extend(f"- {item}" for item in story["scope"])
    lines.append("")
    lines.append("## Out of Scope")
    lines.extend(f"- {item}" for item in story["non_scope"])
    lines.append("")
    lines.append("## Dependencies")
    lines.extend(render_dependencies(story["dependencies"], sync_index))
    lines.append("")
    lines.append("## Acceptance Criteria")
    lines.extend(f"- [ ] {item}" for item in story["acceptance_criteria"])
    lines.append("")
    lines.append("## Required Tests")
    lines.extend(f"- {item}" for item in story["required_tests"])
    lines.append("")
    lines.append("## Repo Rules")
    lines.extend(f"- {item}" for item in story["repo_rules"])
    lines.append("")
    lines.append("## Ambiguity Policy")
    lines.append(story["ambiguity_policy"])
    lines.append("")
    lines.append("## Packet / implementation links")
    lines.append(f"- story file: `{story_path.as_posix()}`")
    agent = story.get("agent") or {}
    packet_path = agent.get("packet_path") if isinstance(agent, dict) else None
    if packet_path:
        lines.append(f"- packet: `{packet_path}`")
    implementation_skill = agent.get("implementation_skill") if isinstance(agent, dict) else None
    review_skill = agent.get("review_skill") if isinstance(agent, dict) else None
    if implementation_skill:
        lines.append(f"- implementation skill: `{implementation_skill}`")
    if review_skill:
        lines.append(f"- review skill: `{review_skill}`")
    lines.append(f"- sync metadata: `{sync_metadata_relpath.as_posix()}`")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"



def compute_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()



def relative_to_root(path: Path) -> Path:
    try:
        return path.resolve().relative_to(ROOT.resolve())
    except Exception:
        return path



def story_sync_metadata_path(sync_dir: Path, story_id: str) -> Path:
    return sync_dir / f"{story_id}.github.json"



def title_case_slug(value: str) -> str:
    return value.replace("_", " ").replace("-", " ").title()


# ---------------------------------------------------------------------------
# GitHub CLI helpers
# ---------------------------------------------------------------------------


def run_command(args: List[str], cwd: Optional[Path] = None, stdin_text: Optional[str] = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd or ROOT),
        input=stdin_text,
        text=True,
        capture_output=True,
        check=False,
    )



def ensure_gh_available() -> None:
    result = run_command(["gh", "--version"])
    if result.returncode != 0:
        raise GitHubSyncError("GitHub CLI (`gh`) is required for live sync mode.")



def gh_api_json(args: List[str], stdin_text: Optional[str] = None) -> Any:
    result = run_command(["gh", *args], stdin_text=stdin_text)
    if result.returncode != 0:
        raise GitHubSyncError(
            "GitHub CLI command failed:\n"
            + " ".join(args)
            + "\nSTDOUT:\n"
            + result.stdout
            + "\nSTDERR:\n"
            + result.stderr
        )
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError as exc:
        raise GitHubSyncError(f"Expected JSON from GitHub CLI but got: {result.stdout!r}") from exc



def gh_api_raw(args: List[str], stdin_text: Optional[str] = None) -> str:
    result = run_command(["gh", *args], stdin_text=stdin_text)
    if result.returncode != 0:
        raise GitHubSyncError(
            "GitHub CLI command failed:\n"
            + " ".join(args)
            + "\nSTDOUT:\n"
            + result.stdout
            + "\nSTDERR:\n"
            + result.stderr
        )
    return result.stdout



def repo_owner_and_name(repo: str) -> Tuple[str, str]:
    if "/" not in repo:
        raise GitHubSyncError(f"repo must be OWNER/REPO, got {repo!r}")
    owner, name = repo.split("/", 1)
    if not owner or not name:
        raise GitHubSyncError(f"repo must be OWNER/REPO, got {repo!r}")
    return owner, name



def ensure_labels_exist(repo: str, labels: List[str], config: Dict[str, Any]) -> None:
    labels_config = config.get("labels") or {}
    ensure = bool(labels_config.get("ensure", False))
    if not ensure:
        return
    colors = dict(DEFAULT_LABEL_COLORS)
    colors.update(labels_config.get("colors") or {})
    descriptions = labels_config.get("descriptions") or {}

    for label in labels:
        encoded_label = label.replace("/", "%2F")
        get_result = run_command(["gh", "api", f"repos/{repo}/labels/{encoded_label}"])
        if get_result.returncode == 0:
            continue
        family = label.split(":", 1)[0] if ":" in label else "type"
        color = colors.get(family, "8a8a8a")
        description = descriptions.get(label, DEFAULT_LABEL_DESCRIPTIONS.get(family, "Spec workflow label"))
        create_result = run_command(
            [
                "gh",
                "api",
                f"repos/{repo}/labels",
                "--method",
                "POST",
                "-f",
                f"name={label}",
                "-f",
                f"color={color}",
                "-f",
                f"description={description}",
            ]
        )
        if create_result.returncode != 0 and "already_exists" not in create_result.stderr:
            raise GitHubSyncError(
                f"Failed to ensure label {label!r} in {repo}:\n{create_result.stdout}\n{create_result.stderr}"
            )



def create_or_update_issue(repo: str, title: str, body: str, labels: List[str], existing_metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    issue_payload = {"title": title, "body": body}
    issue_file = write_temp_json_file(issue_payload)
    labels_file = write_temp_json_file({"labels": labels})
    try:
        if existing_metadata and existing_metadata.get("issue_number"):
            issue_number = int(existing_metadata["issue_number"])
            payload = gh_api_json(
                [
                    "api",
                    f"repos/{repo}/issues/{issue_number}",
                    "--method",
                    "PATCH",
                    "--input",
                    issue_file,
                ]
            )
            gh_api_json(
                [
                    "api",
                    f"repos/{repo}/issues/{issue_number}/labels",
                    "--method",
                    "PUT",
                    "--input",
                    labels_file,
                ]
            )
            return payload

        payload = gh_api_json(
            [
                "api",
                f"repos/{repo}/issues",
                "--method",
                "POST",
                "--input",
                issue_file,
            ]
        )
        issue_number = payload.get("number")
        if issue_number is not None:
            gh_api_json(
                [
                    "api",
                    f"repos/{repo}/issues/{issue_number}/labels",
                    "--method",
                    "PUT",
                    "--input",
                    labels_file,
                ]
            )
        return payload
    finally:
        for temp_path in [issue_file, labels_file]:
            try:
                os.unlink(temp_path)
            except OSError:
                pass



def write_temp_json_file(payload: Dict[str, Any]) -> str:
    fd, path = tempfile.mkstemp(prefix="story-sync-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    return path



def get_issue_node_id(repo: str, issue_number: int) -> str:
    payload = gh_api_json(["api", f"repos/{repo}/issues/{issue_number}"])
    node_id = payload.get("node_id")
    if not isinstance(node_id, str) or not node_id:
        raise GitHubSyncError(f"Could not resolve node_id for issue #{issue_number} in {repo}")
    return node_id



def resolve_github_owner_type(owner: str) -> str:
    payload = gh_api_json(["api", f"users/{owner}"])
    owner_type = str(payload.get("type", "")).strip().lower()
    if owner_type not in {"user", "organization"}:
        raise GitHubSyncError(f"Could not resolve GitHub owner type for {owner!r}")
    return owner_type



def resolve_project(repo_config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    project_config = repo_config.get("project") or {}
    owner = project_config.get("owner")
    number = project_config.get("number")
    if not owner or number is None:
        return None

    owner_type = resolve_github_owner_type(str(owner))
    owner_field = "organization" if owner_type == "organization" else "user"
    graphql_query = f"""
    query($owner: String!, $number: Int!) {{
      {owner_field}(login: $owner) {{
        projectV2(number: $number) {{
          id
          title
          fields(first: 100) {{
            nodes {{
              __typename
              ... on ProjectV2FieldCommon {{
                id
                name
                dataType
              }}
              ... on ProjectV2SingleSelectField {{
                id
                name
                dataType
                options {{
                  id
                  name
                }}
              }}
              ... on ProjectV2IterationField {{
                id
                name
                dataType
                configuration {{
                  iterations {{
                    id
                    title
                    startDate
                    duration
                  }}
                }}
              }}
            }}
          }}
        }}
      }}
    }}
    """.strip()
    payload = gh_api_json(
        [
            "api",
            "graphql",
            "-f",
            f"query={graphql_query}",
            "-F",
            f"owner={owner}",
            "-F",
            f"number={int(number)}",
        ]
    )
    data = payload.get("data") or {}
    project_owner_payload = data.get(owner_field) or {}
    project = project_owner_payload.get("projectV2")
    if project is None:
        raise GitHubSyncError(f"Could not resolve project owner={owner!r} number={number!r}")
    project["owner"] = owner
    project["owner_type"] = owner_type
    return project



def find_existing_project_item(issue_node_id: str, project_id: str) -> Optional[str]:
    graphql_query = """
    query($issueId: ID!) {
      node(id: $issueId) {
        ... on Issue {
          projectItems(first: 50) {
            nodes {
              id
              project {
                id
              }
            }
          }
        }
      }
    }
    """.strip()
    payload = gh_api_json(["api", "graphql", "-f", f"query={graphql_query}", "-F", f"issueId={issue_node_id}"])
    items = (((payload.get("data") or {}).get("node") or {}).get("projectItems") or {}).get("nodes") or []
    for item in items:
        if ((item or {}).get("project") or {}).get("id") == project_id:
            return item.get("id")
    return None



def add_issue_to_project(issue_node_id: str, project_id: str) -> str:
    graphql_mutation = """
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item {
          id
        }
      }
    }
    """.strip()
    payload = gh_api_json(
        [
            "api",
            "graphql",
            "-f",
            f"query={graphql_mutation}",
            "-F",
            f"projectId={project_id}",
            "-F",
            f"contentId={issue_node_id}",
        ]
    )
    item_id = ((((payload.get("data") or {}).get("addProjectV2ItemById") or {}).get("item") or {}).get("id"))
    if not isinstance(item_id, str) or not item_id:
        raise GitHubSyncError("Failed to add issue to project: missing item id in GraphQL response")
    return item_id



def get_nested_value(payload: Dict[str, Any], dotted_path: str) -> Any:
    current: Any = payload
    for part in dotted_path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current



def normalize_choice(candidate: Any) -> str:
    if candidate is None:
        return ""
    value = str(candidate).strip()
    if not value:
        return ""
    return value



def choose_single_select_option(field: Dict[str, Any], raw_value: Any, option_map: Optional[Dict[str, str]] = None) -> Optional[str]:
    option_map = option_map or {}
    candidate = option_map.get(str(raw_value), str(raw_value))
    normalized_candidate = normalize_choice(candidate)
    normalized_variants = {
        normalized_candidate,
        title_case_slug(normalized_candidate),
        normalized_candidate.lower(),
        title_case_slug(str(raw_value)),
        str(raw_value).replace("_", " "),
        title_case_slug(str(raw_value)),
    }
    options = field.get("options") or []
    for option in options:
        name = str(option.get("name", "")).strip()
        if not name:
            continue
        if name in normalized_variants or name.lower() in {variant.lower() for variant in normalized_variants}:
            return option.get("id")
    return None



def choose_iteration_id(field: Dict[str, Any], raw_value: Any) -> Optional[str]:
    target = normalize_choice(raw_value)
    if not target:
        return None
    config = field.get("configuration") or {}
    iterations = config.get("iterations") or []
    for iteration in iterations:
        title = str(iteration.get("title", "")).strip()
        if title == target:
            return iteration.get("id")
    return None



def update_project_field(project_id: str, item_id: str, field: Dict[str, Any], raw_value: Any, option_map: Optional[Dict[str, str]] = None) -> None:
    if raw_value is None or raw_value == "":
        return
    data_type = str(field.get("dataType", "")).upper()
    field_id = field.get("id")
    if not field_id:
        raise GitHubSyncError(f"Project field missing id: {field}")

    value_fragment: Optional[str] = None
    if data_type == "SINGLE_SELECT":
        option_id = choose_single_select_option(field, raw_value, option_map=option_map)
        if not option_id:
            raise GitHubSyncError(
                f"Could not match single-select option for field {field.get('name')!r} and value {raw_value!r}"
            )
        value_fragment = f"singleSelectOptionId: \"{option_id}\""
    elif data_type == "TEXT":
        escaped = json.dumps(str(raw_value))
        value_fragment = f"text: {escaped}"
    elif data_type == "NUMBER":
        value_fragment = f"number: {float(raw_value)}"
    elif data_type == "DATE":
        escaped = json.dumps(str(raw_value))
        value_fragment = f"date: {escaped}"
    elif data_type == "ITERATION":
        iteration_id = choose_iteration_id(field, raw_value)
        if not iteration_id:
            raise GitHubSyncError(
                f"Could not match iteration option for field {field.get('name')!r} and value {raw_value!r}"
            )
        value_fragment = f"iterationId: \"{iteration_id}\""
    else:
        raise GitHubSyncError(f"Unsupported project field type {data_type!r} for field {field.get('name')!r}")

    graphql_mutation = f"""
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {{
      updateProjectV2ItemFieldValue(
        input: {{
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: {{ {value_fragment} }}
        }}
      ) {{
        projectV2Item {{
          id
        }}
      }}
    }}
    """.strip()
    gh_api_json(
        [
            "api",
            "graphql",
            "-f",
            f"query={graphql_mutation}",
            "-F",
            f"projectId={project_id}",
            "-F",
            f"itemId={item_id}",
            "-F",
            f"fieldId={field_id}",
        ]
    )



def sync_issue_to_project(story: Dict[str, Any], repo_config: Dict[str, Any], issue_node_id: str) -> Optional[Dict[str, Any]]:
    project = resolve_project(repo_config)
    if not project:
        return None

    project_id = project.get("id")
    if not isinstance(project_id, str) or not project_id:
        raise GitHubSyncError("Resolved project payload did not include a valid id")

    item_id = find_existing_project_item(issue_node_id, project_id)
    if item_id is None:
        item_id = add_issue_to_project(issue_node_id, project_id)

    field_mapping = dict(DEFAULT_PROJECT_FIELD_MAPPING)
    user_mapping = ((repo_config.get("project") or {}).get("field_mapping") or {})
    field_mapping.update(user_mapping)

    fields_by_name = {
        str(field.get("name")): field
        for field in ((project.get("fields") or {}).get("nodes") or [])
        if isinstance(field, dict) and field.get("name")
    }

    applied: Dict[str, Any] = {}
    skipped: Dict[str, str] = {}
    for field_name, mapping in field_mapping.items():
        field = fields_by_name.get(field_name)
        if field is None:
            skipped[field_name] = "field_not_found"
            continue
        source = mapping.get("source")
        if not source:
            skipped[field_name] = "missing_source_mapping"
            continue
        raw_value = get_nested_value(story, source)
        if raw_value in {None, ""}:
            skipped[field_name] = "empty_source_value"
            continue
        option_map = mapping.get("option_map") or {}
        update_project_field(project_id, item_id, field, raw_value, option_map=option_map)
        applied[field_name] = raw_value

    return {
        "owner": project.get("owner"),
        "number": (repo_config.get("project") or {}).get("number"),
        "id": project_id,
        "title": project.get("title"),
        "item_id": item_id,
        "applied_fields": applied,
        "skipped_fields": skipped,
    }


# ---------------------------------------------------------------------------
# Core sync orchestration
# ---------------------------------------------------------------------------


def build_metadata(
    story: Dict[str, Any],
    story_path: Path,
    sync_path: Path,
    title: str,
    body: str,
    labels: List[str],
    resolved_spec_refs: List[Dict[str, Any]],
    issue_payload: Optional[Dict[str, Any]],
    project_payload: Optional[Dict[str, Any]],
    dry_run: bool,
) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {
        "story_id": story["id"],
        "story_path": relative_to_root(story_path).as_posix(),
        "metadata_path": relative_to_root(sync_path).as_posix(),
        "repo": None,
        "issue_title": title,
        "issue_number": None,
        "issue_url": None,
        "issue_node_id": None,
        "labels": labels,
        "spec_version": story["spec_version"],
        "story_status": story["status"],
        "body_sha256": compute_sha256(body),
        "rendered_issue_body": body,
        "resolved_spec_refs": resolved_spec_refs,
        "project": project_payload,
        "last_synced_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "dry_run": dry_run,
    }
    if issue_payload:
        metadata.update(
            {
                "repo": issue_payload.get("repository_url", "").split("/repos/")[-1] if issue_payload.get("repository_url") else None,
                "issue_number": issue_payload.get("number"),
                "issue_url": issue_payload.get("html_url"),
                "issue_node_id": issue_payload.get("node_id"),
            }
        )
    return metadata



def write_metadata(path: Path, metadata: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")



def load_config(config_path: Optional[Path]) -> Dict[str, Any]:
    if config_path is None:
        return {}
    if not config_path.exists():
        raise StorySyncError(f"Config file not found: {config_path}")
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise StorySyncError(f"Config file must be valid JSON: {config_path}: {exc}") from exc
    if not isinstance(data, dict):
        raise StorySyncError(f"Config file must contain a top-level object: {config_path}")
    return data



def resolve_story_paths(args: argparse.Namespace) -> List[Path]:
    story_paths: List[Path] = []
    if args.story:
        story_paths.extend(Path(item).resolve() for item in args.story)
    if args.stories_glob:
        story_paths.extend(sorted(ROOT.glob(args.stories_glob)))
    unique = []
    seen = set()
    for path in story_paths:
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            unique.append(path)
    return unique



def process_story(
    story_path: Path,
    section_lookup: Dict[str, Dict[str, Any]],
    sync_dir: Path,
    sync_index: Dict[str, Dict[str, Any]],
    config: Dict[str, Any],
    dry_run: bool,
    write_preview: bool,
) -> Dict[str, Any]:
    story = load_story_yaml(story_path)
    validate_story(story, story_path)
    resolved_spec_refs = resolve_spec_refs(story, section_lookup)

    sync_path = story_sync_metadata_path(sync_dir, story["id"])
    sync_path_rel = relative_to_root(sync_path)
    title = build_issue_title(story)
    labels = label_set_for_story(
        story,
        include_status=bool(((config.get("labels") or {}).get("include_status", False))),
        defaults=list(((config.get("labels") or {}).get("defaults") or [])),
    )
    body = render_issue_body(story, relative_to_root(story_path), resolved_spec_refs, sync_index, sync_path_rel)
    existing_metadata = sync_index.get(story["id"])

    issue_payload: Optional[Dict[str, Any]] = None
    project_payload: Optional[Dict[str, Any]] = None

    repo = config.get("repo")
    if dry_run:
        metadata = build_metadata(
            story, story_path, sync_path, title, body, labels, resolved_spec_refs, None, None, True
        )
        if write_preview:
            write_metadata(sync_path, metadata)
        return {
            "story_id": story["id"],
            "story_path": relative_to_root(story_path).as_posix(),
            "sync_path": relative_to_root(sync_path).as_posix(),
            "title": title,
            "labels": labels,
            "body_sha256": compute_sha256(body),
            "created": existing_metadata is None,
            "updated": existing_metadata is not None,
            "project_synced": False,
            "dry_run": True,
        }

    if not repo:
        raise StorySyncError("Live sync mode requires `repo` in the JSON config.")

    ensure_gh_available()
    ensure_labels_exist(repo, labels, config)
    issue_payload = create_or_update_issue(repo, title, body, labels, existing_metadata)
    issue_number = issue_payload.get("number")
    if issue_number is None:
        raise GitHubSyncError(f"GitHub issue payload did not include a number for story {story['id']}")
    issue_node_id = issue_payload.get("node_id") or get_issue_node_id(repo, int(issue_number))
    if not isinstance(issue_node_id, str) or not issue_node_id:
        raise GitHubSyncError(f"Could not resolve issue node id for story {story['id']}")
    project_payload = sync_issue_to_project(story, config, issue_node_id)

    metadata = build_metadata(
        story,
        story_path,
        sync_path,
        title,
        body,
        labels,
        resolved_spec_refs,
        issue_payload,
        project_payload,
        False,
    )
    metadata["repo"] = repo
    write_metadata(sync_path, metadata)

    return {
        "story_id": story["id"],
        "story_path": relative_to_root(story_path).as_posix(),
        "sync_path": relative_to_root(sync_path).as_posix(),
        "title": title,
        "labels": labels,
        "body_sha256": compute_sha256(body),
        "issue_number": issue_payload.get("number"),
        "issue_url": issue_payload.get("html_url"),
        "created": existing_metadata is None,
        "updated": existing_metadata is not None,
        "project_synced": project_payload is not None,
        "dry_run": False,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sync approved OPTCG story files to GitHub issues and projects.")
    parser.add_argument("--story", action="append", help="Path to a single approved story YAML file. Repeatable.")
    parser.add_argument(
        "--stories-glob",
        default=None,
        help=f"Glob for story files relative to repo root. Example: {DEFAULT_STORIES_GLOB!r}",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to JSON config describing repo/project mapping.",
    )
    parser.add_argument(
        "--sync-dir",
        type=Path,
        default=DEFAULT_SYNC_DIR,
        help="Directory for adjacent board-sync metadata JSON files.",
    )
    parser.add_argument(
        "--section-index",
        type=Path,
        default=Path("section-index.json"),
        help="Path to the section-index.json file relative to repo root or absolute.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and render issue bodies without calling GitHub.",
    )
    parser.add_argument(
        "--write-preview",
        action="store_true",
        help="When used with --dry-run, write preview metadata JSON into the sync dir.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON summary instead of human-readable lines.",
    )
    return parser



def main(argv: Optional[List[str]] = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)

    story_paths = resolve_story_paths(args)
    if not story_paths:
        if args.stories_glob is None and args.story is None:
            story_paths = sorted(ROOT.glob(DEFAULT_STORIES_GLOB))
        if not story_paths:
            parser.error("No story files were selected.")

    config = load_config(args.config)
    sync_dir = args.sync_dir if args.sync_dir.is_absolute() else ROOT / args.sync_dir
    section_index_path = args.section_index if args.section_index.is_absolute() else ROOT / args.section_index
    section_lookup = load_section_index(section_index_path)
    sync_index = load_sync_index(sync_dir)

    results: List[Dict[str, Any]] = []
    failures: List[Dict[str, str]] = []

    for story_path in story_paths:
        try:
            result = process_story(
                story_path=story_path,
                section_lookup=section_lookup,
                sync_dir=sync_dir,
                sync_index=sync_index,
                config=config,
                dry_run=args.dry_run,
                write_preview=args.write_preview,
            )
            results.append(result)
            # Allow later stories to resolve dependency links to the story we just handled.
            if args.write_preview or not args.dry_run:
                sync_metadata_path = ROOT / result["sync_path"]
                if sync_metadata_path.exists():
                    try:
                        sync_index[result["story_id"]] = json.loads(sync_metadata_path.read_text(encoding="utf-8"))
                    except Exception:
                        pass
        except Exception as exc:
            failures.append(
                {
                    "story_path": relative_to_root(story_path).as_posix(),
                    "error": str(exc),
                }
            )

    exit_code = 0 if not failures else 1
    payload = {
        "ok": not failures,
        "dry_run": bool(args.dry_run),
        "results": results,
        "failures": failures,
    }

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        for result in results:
            mode = "DRY-RUN" if result["dry_run"] else "SYNCED"
            status = "updated" if result.get("updated") else "created"
            if result["dry_run"]:
                status = "rendered"
            print(f"[{mode}] {result['story_id']} -> {result['title']} ({status})")
            if result.get("issue_url"):
                print(f"  issue: {result['issue_url']}")
            print(f"  metadata: {result['sync_path']}")
        for failure in failures:
            eprint(f"[ERROR] {failure['story_path']}: {failure['error']}")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
