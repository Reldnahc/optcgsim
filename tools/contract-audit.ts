import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  ensureDirectory,
  loadStory,
  parseArgs,
  printJson,
  type Story
} from "./spec_story_lib.ts";

interface StoryLocation {
  path: string;
  story: Story;
}

interface ContractAuditItem {
  id: string;
  label: string;
  status: "pass";
}

interface ContractAuditRecord {
  version: 1;
  story_id: string;
  story_path: string;
  area: Story["area"];
  packet_path?: string;
  git_head: string;
  reviewed_at: string;
  verify_command: string;
  verify_ok: true;
  worktree_clean: true;
  checklist: ContractAuditItem[];
  notes?: string;
}

const AUDIT_DIR = "stories/.review";

function findStoryById(storyId: string): StoryLocation {
  const candidates = [
    `stories/approved/${storyId}.story.yaml`,
    `stories/blocked/${storyId}.story.yaml`,
    `stories/done/${storyId}.story.yaml`,
    `stories/generated/${storyId}.story.yaml`
  ];

  for (const candidate of candidates) {
    const absolute = path.resolve(ROOT, candidate);
    if (fs.existsSync(absolute)) {
      return { path: candidate, story: loadStory(candidate) };
    }
  }

  throw new Error(
    `Could not locate story ${storyId} in generated/approved/blocked/done.`
  );
}

function runCommand(
  command: string,
  args: string[]
): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const executable =
    process.platform === "win32" && command === "git" ? "git.exe" : command;
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: "utf8"
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function getGitHead(): string {
  const result = runCommand("git", ["rev-parse", "HEAD"]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to resolve git HEAD.\n${result.stdout}\n${result.stderr}`.trim()
    );
  }
  return result.stdout.trim();
}

function listDirtyFiles(): string[] {
  const result = runCommand("git", ["status", "--porcelain"]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to inspect git worktree.\n${result.stdout}\n${result.stderr}`.trim()
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function runVerify(): void {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = runCommand(npmCommand, ["run", "stories:verify"]);
  if (result.status !== 0) {
    throw new Error(
      `Contract audit failed because stories:verify did not pass.\n${result.stdout}\n${result.stderr}`.trim()
    );
  }
}

function auditPath(storyId: string): string {
  return `${AUDIT_DIR}/${storyId}.contract-audit.json`;
}

function buildChecklist(): ContractAuditItem[] {
  return [
    {
      id: "canonical-public-alignment",
      label:
        "PendingDecision, PublicDecision, and DecisionResponse were reviewed as one contract family.",
      status: "pass"
    },
    {
      id: "live-replay-split",
      label:
        "Live player-facing DTOs were checked against replay-capable/shared DTOs for visibility leaks.",
      status: "pass"
    },
    {
      id: "field-name-consistency",
      label:
        "Input, output, and validation field names were checked for exact contract alignment.",
      status: "pass"
    },
    {
      id: "invalid-input-representability",
      label:
        "Invalid submissions remain representable by shared input DTOs so validators can report canonical errors.",
      status: "pass"
    },
    {
      id: "hidden-info-boundary",
      label:
        "Public DTOs were checked for hidden-information safety and avoidance of raw engine-only refs.",
      status: "pass"
    }
  ];
}

function writeAudit(record: ContractAuditRecord): string {
  ensureDirectory(AUDIT_DIR);
  const relativePath = auditPath(record.story_id);
  fs.writeFileSync(
    path.resolve(ROOT, relativePath),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8"
  );
  return relativePath;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const storyId =
    typeof args.get("id") === "string" ? String(args.get("id")).trim() : "";
  if (!storyId) {
    throw new Error("Missing --id for contract audit.");
  }

  const { path: storyPath, story } = findStoryById(storyId);
  if (story.area !== "contracts") {
    throw new Error(
      `Contract audit is only valid for contracts stories. ${storyId} has area ${story.area}.`
    );
  }

  const dirtyBefore = listDirtyFiles();
  if (dirtyBefore.length > 0) {
    throw new Error(
      `Contract audit requires a clean worktree before review. Dirty entries:\n${dirtyBefore.join("\n")}`
    );
  }

  runVerify();

  const record: ContractAuditRecord = {
    version: 1,
    story_id: story.id,
    story_path: storyPath,
    area: story.area,
    packet_path: story.agent?.packet_path,
    git_head: getGitHead(),
    reviewed_at: new Date().toISOString(),
    verify_command: "npm run stories:verify",
    verify_ok: true,
    worktree_clean: true,
    checklist: buildChecklist(),
    notes:
      typeof args.get("notes") === "string"
        ? String(args.get("notes"))
        : undefined
  };

  const outputPath = writeAudit(record);
  printJson({
    ok: true,
    story_id: story.id,
    audit_path: outputPath,
    git_head: record.git_head,
    reviewed_at: record.reviewed_at,
    checklist: record.checklist
  });
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
