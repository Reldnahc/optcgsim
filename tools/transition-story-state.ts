import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  buildSectionLookup,
  ensureDirectory,
  loadSectionIndex,
  loadStory,
  parseArgs,
  printJson,
  storyToYaml,
  validateStory,
  type Story,
  type StoryStatus
} from "./spec_story_lib.ts";
import { syncStories } from "./spec_board_sync.ts";
import { syncPullRequestContext } from "./story-branch-pr.ts";

type TransitionAction =
  | "start"
  | "request-review"
  | "changes-requested"
  | "complete"
  | "block"
  | "unblock";

interface StoryLocation {
  path: string;
  bucket: "generated" | "approved" | "blocked" | "done";
  story: Story;
}

interface TransitionPlan {
  action: TransitionAction;
  storyId: string;
  fromPath: string;
  toPath: string;
  fromStatus: StoryStatus;
  toStatus: StoryStatus;
  shouldCloseIssue: boolean;
  shouldComment: boolean;
  commentBody: string;
}

interface TransitionOptions {
  action: TransitionAction;
  storyId: string;
  dryRun?: boolean;
}

function allowsMissingPrForTransition(
  storyId: string,
  action: TransitionAction
): boolean {
  return storyId === "INF-001" && action === "complete";
}

function resolveCommand(command: string): string {
  if (command !== "gh") {
    return command;
  }

  const candidates = [
    "gh",
    "gh.exe",
    path.join(process.env["ProgramFiles"] ?? "", "GitHub CLI", "gh.exe"),
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

  return command;
}

function runCommand(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const executable = resolveCommand(args[0]);
  const result = spawnSync(executable, args.slice(1), {
    cwd: ROOT,
    encoding: "utf8"
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function findStoryById(storyId: string): StoryLocation {
  const candidates: Array<{ path: string; bucket: StoryLocation["bucket"] }> = [
    { path: `stories/approved/${storyId}.story.yaml`, bucket: "approved" },
    { path: `stories/blocked/${storyId}.story.yaml`, bucket: "blocked" },
    { path: `stories/done/${storyId}.story.yaml`, bucket: "done" },
    { path: `stories/generated/${storyId}.story.yaml`, bucket: "generated" }
  ];

  for (const candidate of candidates) {
    const absolute = path.resolve(ROOT, candidate.path);
    if (fs.existsSync(absolute)) {
      return {
        path: candidate.path,
        bucket: candidate.bucket,
        story: loadStory(candidate.path)
      };
    }
  }

  throw new Error(
    `Could not locate story ${storyId} in generated/approved/blocked/done.`
  );
}

function transitionComment(plan: TransitionPlan, story: Story): string {
  const packetPath =
    story.agent?.packet_path ?? `agent-packets/approved/${story.id}.packet.md`;
  switch (plan.action) {
    case "start":
      return `Implementation started for \`${story.id}\` from approved packet \`${packetPath}\`.`;
    case "request-review":
      return `Implementation finished for \`${story.id}\` and is ready for code review on the PR diff. Review against approved story \`${story.id}\` and packet \`${packetPath}\`.`;
    case "changes-requested":
      return `Code review requested changes for \`${story.id}\`; returning the story to active implementation.`;
    case "complete":
      return `Code review accepted for \`${story.id}\`; the story is complete.`;
    case "block":
      return `Work on \`${story.id}\` is blocked and has been moved out of the active implementation queue.`;
    case "unblock":
      return `Blocker cleared for \`${story.id}\`; the story has been returned to the approved backlog.`;
  }
}

function transitionPlan(
  location: StoryLocation,
  action: TransitionAction
): TransitionPlan {
  const { story, path: storyPath, bucket } = location;
  const id = story.id;

  switch (action) {
    case "start":
      if (
        !["approved"].includes(bucket) ||
        !["approved", "changes_requested"].includes(story.status)
      ) {
        throw new Error(
          `Cannot start ${id} from ${bucket}/${story.status}. Expected approved story in approved or changes_requested state.`
        );
      }
      return {
        action,
        storyId: id,
        fromPath: storyPath,
        toPath: storyPath,
        fromStatus: story.status,
        toStatus: "in_progress",
        shouldCloseIssue: false,
        shouldComment: true,
        commentBody: transitionComment(
          {
            action,
            storyId: id,
            fromPath: storyPath,
            toPath: storyPath,
            fromStatus: story.status,
            toStatus: "in_progress",
            shouldCloseIssue: false,
            shouldComment: true,
            commentBody: ""
          },
          story
        )
      };
    case "request-review":
      if (bucket !== "approved" || story.status !== "in_progress") {
        throw new Error(
          `Cannot request review for ${id} from ${bucket}/${story.status}. Expected in_progress story in stories/approved.`
        );
      }
      return {
        action,
        storyId: id,
        fromPath: storyPath,
        toPath: storyPath,
        fromStatus: story.status,
        toStatus: "in_review",
        shouldCloseIssue: false,
        shouldComment: true,
        commentBody: transitionComment(
          {
            action,
            storyId: id,
            fromPath: storyPath,
            toPath: storyPath,
            fromStatus: story.status,
            toStatus: "in_review",
            shouldCloseIssue: false,
            shouldComment: true,
            commentBody: ""
          },
          story
        )
      };
    case "changes-requested":
      if (bucket !== "approved" || story.status !== "in_review") {
        throw new Error(
          `Cannot mark changes requested for ${id} from ${bucket}/${story.status}. Expected in_review story in stories/approved.`
        );
      }
      return {
        action,
        storyId: id,
        fromPath: storyPath,
        toPath: storyPath,
        fromStatus: story.status,
        toStatus: "changes_requested",
        shouldCloseIssue: false,
        shouldComment: true,
        commentBody: transitionComment(
          {
            action,
            storyId: id,
            fromPath: storyPath,
            toPath: storyPath,
            fromStatus: story.status,
            toStatus: "changes_requested",
            shouldCloseIssue: false,
            shouldComment: true,
            commentBody: ""
          },
          story
        )
      };
    case "complete":
      if (bucket !== "approved" || story.status !== "in_review") {
        throw new Error(
          `Cannot complete ${id} from ${bucket}/${story.status}. Expected in_review story in stories/approved.`
        );
      }
      return {
        action,
        storyId: id,
        fromPath: storyPath,
        toPath: `stories/done/${id}.story.yaml`,
        fromStatus: story.status,
        toStatus: "done",
        shouldCloseIssue: true,
        shouldComment: true,
        commentBody: transitionComment(
          {
            action,
            storyId: id,
            fromPath: storyPath,
            toPath: `stories/done/${id}.story.yaml`,
            fromStatus: story.status,
            toStatus: "done",
            shouldCloseIssue: true,
            shouldComment: true,
            commentBody: ""
          },
          story
        )
      };
    case "block":
      if (
        !["approved", "blocked"].includes(bucket) ||
        !["approved", "in_progress", "in_review", "changes_requested"].includes(
          story.status
        )
      ) {
        throw new Error(
          `Cannot block ${id} from ${bucket}/${story.status}. Expected active approved story.`
        );
      }
      return {
        action,
        storyId: id,
        fromPath: storyPath,
        toPath: `stories/blocked/${id}.story.yaml`,
        fromStatus: story.status,
        toStatus: "blocked",
        shouldCloseIssue: false,
        shouldComment: true,
        commentBody: transitionComment(
          {
            action,
            storyId: id,
            fromPath: storyPath,
            toPath: `stories/blocked/${id}.story.yaml`,
            fromStatus: story.status,
            toStatus: "blocked",
            shouldCloseIssue: false,
            shouldComment: true,
            commentBody: ""
          },
          story
        )
      };
    case "unblock":
      if (bucket !== "blocked" || story.status !== "blocked") {
        throw new Error(
          `Cannot unblock ${id} from ${bucket}/${story.status}. Expected blocked story in stories/blocked.`
        );
      }
      return {
        action,
        storyId: id,
        fromPath: storyPath,
        toPath: `stories/approved/${id}.story.yaml`,
        fromStatus: story.status,
        toStatus: "approved",
        shouldCloseIssue: false,
        shouldComment: true,
        commentBody: transitionComment(
          {
            action,
            storyId: id,
            fromPath: storyPath,
            toPath: `stories/approved/${id}.story.yaml`,
            fromStatus: story.status,
            toStatus: "approved",
            shouldCloseIssue: false,
            shouldComment: true,
            commentBody: ""
          },
          story
        )
      };
  }
}

function loadSyncMetadata(storyId: string): {
  issue_number?: number;
  issue_url?: string;
  pr_number?: number;
  pr_url?: string;
} {
  const metadataPath = path.resolve(
    ROOT,
    "stories/.sync",
    `${storyId}.github.json`
  );
  if (!fs.existsSync(metadataPath)) {
    return {};
  }
  const payload = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
    issue_number?: number;
    issue_url?: string;
    pr_number?: number;
    pr_url?: string;
  };
  return {
    issue_number:
      typeof payload.issue_number === "number"
        ? payload.issue_number
        : undefined,
    issue_url:
      typeof payload.issue_url === "string" ? payload.issue_url : undefined,
    pr_number:
      typeof payload.pr_number === "number" ? payload.pr_number : undefined,
    pr_url: typeof payload.pr_url === "string" ? payload.pr_url : undefined
  };
}

function loadRepoFullName(): string {
  const configPath = path.resolve(ROOT, "tools/github-board.config.json");
  const payload = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    repo?: string;
  };
  if (!payload.repo) {
    throw new Error("Missing repo in tools/github-board.config.json.");
  }
  return payload.repo;
}

function postIssueComment(
  repo: string,
  issueNumber: number,
  body: string
): void {
  const result = runCommand([
    "gh",
    "api",
    `repos/${repo}/issues/${issueNumber}/comments`,
    "--method",
    "POST",
    "-f",
    `body=${body}`
  ]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to post issue comment for #${issueNumber}.\n${result.stdout}\n${result.stderr}`
    );
  }
}

function setIssueState(
  repo: string,
  issueNumber: number,
  state: "open" | "closed"
): void {
  const result = runCommand([
    "gh",
    "api",
    `repos/${repo}/issues/${issueNumber}`,
    "--method",
    "PATCH",
    "-f",
    `state=${state}`
  ]);
  if (result.status !== 0) {
    throw new Error(
      `Failed to set issue #${issueNumber} to ${state}.\n${result.stdout}\n${result.stderr}`
    );
  }
}

export function transitionStory(options: TransitionOptions): {
  ok: true;
  dry_run?: true;
  action: TransitionAction;
  story: {
    id: string;
    from_path: string;
    to_path: string;
    from_status: StoryStatus;
    to_status: StoryStatus;
  };
  sync?: unknown;
  issue?: {
    issue_number?: number;
    issue_url?: string;
    commented: boolean;
    closed?: boolean;
  };
} {
  const location = findStoryById(options.storyId);
  const plan = transitionPlan(location, options.action);
  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const syncMeta = loadSyncMetadata(plan.storyId);

  if (
    !options.dryRun &&
    (plan.action === "request-review" || plan.action === "complete") &&
    typeof syncMeta.pr_number !== "number" &&
    !allowsMissingPrForTransition(plan.storyId, plan.action)
  ) {
    throw new Error(
      `Story ${plan.storyId} requires a pull request before ${plan.action}. Create one first.`
    );
  }

  if (options.dryRun) {
    return {
      ok: true,
      dry_run: true,
      action: plan.action,
      story: {
        id: plan.storyId,
        from_path: plan.fromPath,
        to_path: plan.toPath,
        from_status: plan.fromStatus,
        to_status: plan.toStatus
      },
      issue: {
        ...syncMeta,
        commented: plan.shouldComment,
        closed: plan.shouldCloseIssue || undefined
      }
    };
  }

  const nextStory: Story = {
    ...location.story,
    status: plan.toStatus
  };
  validateStory(nextStory, sectionLookup);

  ensureDirectory(path.posix.dirname(plan.toPath));
  const destinationAbsolute = path.resolve(ROOT, plan.toPath);
  const sourceAbsolute = path.resolve(ROOT, plan.fromPath);
  if (plan.fromPath !== plan.toPath && fs.existsSync(destinationAbsolute)) {
    throw new Error(`Refusing to overwrite existing story at ${plan.toPath}.`);
  }

  const originalSourceExists = fs.existsSync(sourceAbsolute);
  const originalSourceText = originalSourceExists
    ? fs.readFileSync(sourceAbsolute, "utf8")
    : "";
  const destinationExistedBefore =
    plan.fromPath !== plan.toPath && fs.existsSync(destinationAbsolute);
  const originalDestinationText = destinationExistedBefore
    ? fs.readFileSync(destinationAbsolute, "utf8")
    : "";

  let sync: unknown;
  try {
    fs.writeFileSync(destinationAbsolute, storyToYaml(nextStory), "utf8");
    if (plan.fromPath !== plan.toPath) {
      fs.unlinkSync(sourceAbsolute);
    }

    sync = syncStories({
      configPath: "tools/github-board.config.json",
      storyPaths: [plan.toPath]
    });
    if (!(sync as { ok?: boolean }).ok) {
      throw new Error(`Board sync failed for ${plan.storyId}.`);
    }

    if (plan.action === "request-review") {
      syncPullRequestContext(plan.storyId);
    }

    const repo = loadRepoFullName();
    if (typeof syncMeta.issue_number === "number") {
      if (plan.shouldComment) {
        postIssueComment(repo, syncMeta.issue_number, plan.commentBody);
      }
      if (plan.shouldCloseIssue) {
        setIssueState(repo, syncMeta.issue_number, "closed");
      }
      if (!plan.shouldCloseIssue && plan.action === "start") {
        setIssueState(repo, syncMeta.issue_number, "open");
      }
    }
  } catch (error) {
    if (plan.fromPath === plan.toPath) {
      if (originalSourceExists) {
        fs.writeFileSync(sourceAbsolute, originalSourceText, "utf8");
      }
    } else {
      if (originalSourceExists) {
        ensureDirectory(path.posix.dirname(plan.fromPath));
        fs.writeFileSync(sourceAbsolute, originalSourceText, "utf8");
      }
      if (destinationExistedBefore) {
        fs.writeFileSync(destinationAbsolute, originalDestinationText, "utf8");
      } else if (fs.existsSync(destinationAbsolute)) {
        fs.unlinkSync(destinationAbsolute);
      }
    }
    throw new Error(
      `Transition aborted for ${plan.storyId}; local story state was rolled back.\n${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    ok: true,
    action: plan.action,
    story: {
      id: plan.storyId,
      from_path: plan.fromPath,
      to_path: plan.toPath,
      from_status: plan.fromStatus,
      to_status: plan.toStatus
    },
    sync,
    issue: {
      issue_number: syncMeta.issue_number,
      issue_url: syncMeta.issue_url,
      commented: plan.shouldComment,
      closed: plan.shouldCloseIssue || undefined
    }
  };
}

function parseAction(raw: string | boolean | undefined): TransitionAction {
  const action = typeof raw === "string" ? raw.trim() : "";
  if (
    action !== "start" &&
    action !== "request-review" &&
    action !== "changes-requested" &&
    action !== "complete" &&
    action !== "block" &&
    action !== "unblock"
  ) {
    throw new Error(
      "Usage: node --experimental-strip-types tools/transition-story-state.ts --action <start|request-review|changes-requested|complete|block|unblock> --id <STORY-ID>"
    );
  }
  return action;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const action = parseAction(args.get("action"));
  const storyId =
    typeof args.get("id") === "string" ? String(args.get("id")) : "";
  if (!storyId) {
    throw new Error("Missing --id for story transition.");
  }
  const result = transitionStory({
    action,
    storyId,
    dryRun: Boolean(args.get("dry-run"))
  });
  printJson(result);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
