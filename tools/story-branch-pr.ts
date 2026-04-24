import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  loadStory,
  parseArgs,
  printJson,
  type Story
} from "./spec_story_lib.ts";

type WorkflowAction = "branch" | "pr";

interface SyncMetadata {
  story_id?: string;
  issue_number?: number;
  issue_url?: string;
  branch_name?: string;
  branch_base?: string;
  branch_pushed?: boolean;
  pr_number?: number;
  pr_url?: string;
  pr_title?: string;
  pr_state?: string;
  pr_draft?: boolean;
  pr_head_ref?: string;
  pr_base_ref?: string;
}

interface StoryLocation {
  path: string;
  story: Story;
}

function resolveCommand(command: string): string {
  if (command === "git") {
    const candidates = [
      "git",
      "git.exe",
      path.join(process.env.ProgramFiles ?? "", "Git", "cmd", "git.exe"),
      path.join(process.env.ProgramFiles ?? "", "Git", "bin", "git.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "", "Git", "cmd", "git.exe")
    ].filter(Boolean);
    for (const candidate of candidates) {
      const probe = spawnSync(candidate, ["--version"], {
        cwd: ROOT,
        encoding: "utf8"
      });
      if ((probe.status ?? 1) === 0) {
        return candidate;
      }
    }
    return command;
  }
  if (command === "gh") {
    const candidates = [
      "gh",
      "gh.exe",
      path.join(process.env.ProgramFiles ?? "", "GitHub CLI", "gh.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "", "GitHub CLI", "gh.exe")
    ].filter(Boolean);
    for (const candidate of candidates) {
      const probe = spawnSync(candidate, ["--version"], {
        cwd: ROOT,
        encoding: "utf8"
      });
      if ((probe.status ?? 1) === 0) {
        return candidate;
      }
    }
  }
  return command;
}

function runCommand(
  args: string[],
  cwd = ROOT
): { status: number; stdout: string; stderr: string } {
  const executable = resolveCommand(args[0]);
  const result = spawnSync(executable, args.slice(1), {
    cwd,
    encoding: "utf8"
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ""),
    stderr:
      String(result.stderr ?? "") ||
      (result.error instanceof Error ? result.error.message : "")
  };
}

function findStoryById(storyId: string): StoryLocation {
  const candidates = [
    `stories/approved/${storyId}.story.yaml`,
    `stories/blocked/${storyId}.story.yaml`,
    `stories/done/${storyId}.story.yaml`,
    `stories/generated/${storyId}.story.yaml`
  ];
  for (const relativePath of candidates) {
    const absolutePath = path.resolve(ROOT, relativePath);
    if (fs.existsSync(absolutePath)) {
      return {
        path: relativePath,
        story: loadStory(relativePath)
      };
    }
  }
  throw new Error(`Could not locate story ${storyId}.`);
}

function metadataPath(storyId: string): string {
  return path.resolve(ROOT, "stories/.sync", `${storyId}.github.json`);
}

function loadSyncMetadata(storyId: string): SyncMetadata {
  const filePath = metadataPath(storyId);
  if (!fs.existsSync(filePath)) {
    return { story_id: storyId };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as SyncMetadata;
}

function writeSyncMetadata(storyId: string, metadata: SyncMetadata): void {
  const filePath = metadataPath(storyId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

function defaultBranchName(story: Story): string {
  return `story/${story.id.toLowerCase()}-${slugifyTitle(story.title)}`;
}

function currentBranchName(): string {
  const result = runCommand(["git", "branch", "--show-current"]);
  if (result.status !== 0) {
    throw new Error(`Failed to resolve current branch.\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function gitWorktreeDirty(): boolean {
  const result = runCommand(["git", "status", "--porcelain"]);
  if (result.status !== 0) {
    throw new Error(`Failed to inspect git status.\n${result.stderr}`);
  }
  return result.stdout.trim().length > 0;
}

function localBranchExists(branchName: string): boolean {
  return runCommand(["git", "rev-parse", "--verify", branchName]).status === 0;
}

function checkoutBranch(baseBranch: string, branchName: string): void {
  const args = localBranchExists(branchName)
    ? ["git", "checkout", branchName]
    : ["git", "checkout", "-b", branchName, baseBranch];
  const result = runCommand(args);
  if (result.status !== 0) {
    throw new Error(
      `Failed to checkout branch ${branchName} from ${baseBranch}.\n${result.stdout}\n${result.stderr}`
    );
  }
}

function hasUpstream(branchName: string): boolean {
  const upstream = runCommand([
    "git",
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}"
  ]);
  if (upstream.status === 0) {
    return true;
  }
  const remote = runCommand([
    "git",
    "ls-remote",
    "--heads",
    "origin",
    branchName
  ]);
  return remote.status === 0 && remote.stdout.trim().length > 0;
}

function pushBranch(branchName: string): void {
  const result = runCommand(["git", "push", "-u", "origin", branchName]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to push branch ${branchName}.\n${result.stdout}\n${result.stderr}`
    );
  }
}

function loadRepo(): string {
  const payload = JSON.parse(
    fs.readFileSync(
      path.resolve(ROOT, "tools/github-board.config.json"),
      "utf8"
    )
  ) as { repo?: string };
  if (!payload.repo) {
    throw new Error("Missing repo in tools/github-board.config.json.");
  }
  return payload.repo;
}

function buildPrTitle(story: Story): string {
  return `${story.id}: ${story.title}`;
}

function buildPrBody(
  story: Story,
  storyPath: string,
  issueNumber: number
): string {
  const lines: string[] = [];
  lines.push("## Story");
  lines.push(`- ID: \`${story.id}\``);
  lines.push(`- Issue: #${issueNumber}`);
  lines.push(`- Story file: \`${storyPath}\``);
  if (story.agent?.packet_path) {
    lines.push(`- Packet: \`${story.agent.packet_path}\``);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push(story.summary.trim());
  lines.push("");
  lines.push("## Spec Refs");
  for (const ref of story.spec_refs) {
    lines.push(`- ${ref}`);
  }
  lines.push("");
  lines.push("## Required Tests");
  for (const test of story.required_tests) {
    lines.push(`- ${test}`);
  }
  lines.push("");
  lines.push(`Refs #${issueNumber}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

function ghJson(args: string[]): unknown {
  const result = runCommand(["gh", ...args]);
  if (result.status !== 0) {
    throw new Error(
      `GitHub command failed.\n${result.stdout}\n${result.stderr}`
    );
  }
  return JSON.parse(result.stdout) as unknown;
}

function existingPullRequest(
  branchName: string,
  repo: string
): SyncMetadata | undefined {
  const payload = ghJson([
    "pr",
    "list",
    "--repo",
    repo,
    "--head",
    branchName,
    "--state",
    "all",
    "--json",
    "number,url,title,state,isDraft,headRefName,baseRefName"
  ]) as Array<Record<string, unknown>>;
  const item = payload[0];
  if (!item) {
    return undefined;
  }
  return {
    pr_number: Number(item.number),
    pr_url: String(item.url),
    pr_title: String(item.title),
    pr_state: String(item.state).toLowerCase(),
    pr_draft: Boolean(item.isDraft),
    pr_head_ref: String(item.headRefName),
    pr_base_ref: String(item.baseRefName)
  };
}

function createPullRequest(
  story: Story,
  storyPath: string,
  repo: string,
  baseBranch: string,
  headBranch: string,
  issueNumber: number,
  draft: boolean
): SyncMetadata {
  const args = [
    "pr",
    "create",
    "--repo",
    repo,
    "--base",
    baseBranch,
    "--head",
    headBranch,
    "--title",
    buildPrTitle(story),
    "--body",
    buildPrBody(story, storyPath, issueNumber)
  ];
  if (draft) {
    args.push("--draft");
  }
  const result = runCommand(["gh", ...args]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to create pull request for ${story.id}.\n${result.stdout}\n${result.stderr}`
    );
  }
  const prUrl = result.stdout.trim().split(/\r?\n/).find(Boolean);
  if (!prUrl) {
    throw new Error(`Pull request create returned no URL for ${story.id}.`);
  }
  const created = ghJson([
    "pr",
    "view",
    prUrl,
    "--repo",
    repo,
    "--json",
    "number,url,title,state,isDraft,headRefName,baseRefName"
  ]) as Record<string, unknown>;
  return {
    pr_number: Number(created.number),
    pr_url: String(created.url),
    pr_title: String(created.title),
    pr_state: String(created.state).toLowerCase(),
    pr_draft: Boolean(created.isDraft),
    pr_head_ref: String(created.headRefName),
    pr_base_ref: String(created.baseRefName)
  };
}

function parseAction(args: Map<string, string | boolean>): WorkflowAction {
  const action = args.get("action");
  if (action === "branch" || action === "pr") {
    return action;
  }
  throw new Error(
    "Usage: node --experimental-strip-types tools/story-branch-pr.ts --action <branch|pr> --id <STORY-ID>"
  );
}

function branchWorkflow(
  storyId: string,
  dryRun: boolean,
  allowDirty: boolean,
  baseBranch: string
): Record<string, unknown> {
  const { story } = findStoryById(storyId);
  const branchName = defaultBranchName(story);
  const currentBranch = currentBranchName();
  const dirty = gitWorktreeDirty();
  if (dirty && !allowDirty) {
    throw new Error(
      `Worktree is dirty. Refusing to create/switch branches for ${storyId} without --allow-dirty.`
    );
  }
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      action: "branch",
      story_id: storyId,
      current_branch: currentBranch,
      branch_name: branchName,
      base_branch: baseBranch,
      dirty_worktree: dirty,
      branch_exists: localBranchExists(branchName)
    };
  }

  checkoutBranch(baseBranch, branchName);
  const metadata = loadSyncMetadata(storyId);
  metadata.story_id = storyId;
  metadata.branch_name = branchName;
  metadata.branch_base = baseBranch;
  metadata.branch_pushed = false;
  writeSyncMetadata(storyId, metadata);
  return {
    ok: true,
    action: "branch",
    story_id: storyId,
    branch_name: branchName,
    base_branch: baseBranch,
    current_branch: currentBranchName(),
    dirty_worktree: dirty
  };
}

function prWorkflow(
  storyId: string,
  dryRun: boolean,
  push: boolean,
  draft: boolean,
  baseBranch: string
): Record<string, unknown> {
  const { story, path: storyPath } = findStoryById(storyId);
  const repo = loadRepo();
  const metadata = loadSyncMetadata(storyId);
  const branchName = metadata.branch_name ?? currentBranchName();
  if (!metadata.branch_name && branchName === baseBranch) {
    throw new Error(
      `Story ${storyId} has no recorded story branch and the current branch is ${baseBranch}. Create a story branch first.`
    );
  }
  if (typeof metadata.issue_number !== "number") {
    throw new Error(
      `Story ${storyId} has no synced issue number. Sync the story before creating a PR.`
    );
  }

  const upstreamExists = hasUpstream(branchName);
  const existing = existingPullRequest(branchName, repo);
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      action: "pr",
      story_id: storyId,
      branch_name: branchName,
      base_branch: baseBranch,
      upstream_exists: upstreamExists,
      push_requested: push,
      existing_pr: existing ?? null,
      draft
    };
  }

  if (!upstreamExists) {
    if (!push) {
      throw new Error(
        `Branch ${branchName} has no upstream. Push it first or rerun with --push.`
      );
    }
    pushBranch(branchName);
    metadata.branch_pushed = true;
  }

  const pr =
    existing ??
    createPullRequest(
      story,
      storyPath,
      repo,
      baseBranch,
      branchName,
      metadata.issue_number,
      draft
    );
  metadata.story_id = storyId;
  metadata.branch_name = branchName;
  metadata.branch_base = baseBranch;
  metadata.branch_pushed = true;
  metadata.pr_number = pr.pr_number;
  metadata.pr_url = pr.pr_url;
  metadata.pr_title = pr.pr_title;
  metadata.pr_state = pr.pr_state;
  metadata.pr_draft = pr.pr_draft;
  metadata.pr_head_ref = pr.pr_head_ref;
  metadata.pr_base_ref = pr.pr_base_ref;
  writeSyncMetadata(storyId, metadata);

  return {
    ok: true,
    action: "pr",
    story_id: storyId,
    branch_name: branchName,
    base_branch: baseBranch,
    pr
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const action = parseAction(args);
  const storyId =
    typeof args.get("id") === "string" ? String(args.get("id")) : "";
  if (!storyId) {
    throw new Error("Missing --id <STORY-ID>.");
  }
  const baseBranch =
    typeof args.get("base") === "string" ? String(args.get("base")) : "main";
  const dryRun = Boolean(args.get("dry-run"));
  const payload =
    action === "branch"
      ? branchWorkflow(
          storyId,
          dryRun,
          Boolean(args.get("allow-dirty")),
          baseBranch
        )
      : prWorkflow(
          storyId,
          dryRun,
          Boolean(args.get("push")),
          Boolean(args.get("draft")),
          baseBranch
        );
  printJson(payload);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
