import { spawnSync } from "node:child_process";
import { parseArgs, printJson } from "./spec_story_lib.ts";
import { buildReview } from "./review-generated-stories.ts";
import {
  buildSectionLookup,
  loadSectionIndex,
  writeUtf8
} from "./spec_story_lib.ts";
import { writeTranchePlan } from "./plan-approved-tranche.ts";
import { promoteStories } from "./promote-stories.ts";
import { syncStories } from "./spec_board_sync.ts";
import { transitionStory } from "./transition-story-state.ts";

type WorkflowCommand =
  | "next"
  | "approve"
  | "branch"
  | "pr"
  | "contract-audit"
  | "start"
  | "request-review"
  | "changes-requested"
  | "complete"
  | "block"
  | "unblock";

const DEFAULT_REVIEW_PATH = "stories/generated-review.json";
const DEFAULT_PLAN_PATH = "stories/tranches/tranche-001.json";

function firstNonFlagArg(argv: string[]): string | undefined {
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      return arg;
    }
  }
  return undefined;
}

function parseCommand(argv: string[]): WorkflowCommand {
  const command = firstNonFlagArg(argv) ?? "next";
  if (
    command !== "next" &&
    command !== "approve" &&
    command !== "branch" &&
    command !== "pr" &&
    command !== "contract-audit" &&
    command !== "start" &&
    command !== "request-review" &&
    command !== "changes-requested" &&
    command !== "complete" &&
    command !== "block" &&
    command !== "unblock"
  ) {
    throw new Error(
      `Unsupported command ${JSON.stringify(command)}. Use "next", "approve", "branch", "pr", "contract-audit", "start", "request-review", "changes-requested", "complete", "block", or "unblock".`
    );
  }
  return command;
}

function runJsonTool(args: string[]): unknown {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      String(result.stderr ?? "").trim() ||
        String(result.stdout ?? "").trim() ||
        "Tool command failed."
    );
  }
  return JSON.parse(result.stdout) as unknown;
}

function planArgs(options: Map<string, string | boolean>): string[] {
  const args = ["--review", DEFAULT_REVIEW_PATH];
  const limit = options.get("limit");
  const output = options.get("output");

  if (typeof limit === "string") {
    args.push("--limit", limit);
  }
  args.push(
    "--output",
    typeof output === "string" ? output : DEFAULT_PLAN_PATH
  );
  return args;
}

function approveArgs(options: Map<string, string | boolean>): string[] {
  const args: string[] = [];
  const ids = options.get("ids");
  const plan = options.get("plan");

  if (typeof ids === "string") {
    args.push("--ids", ids);
  } else {
    args.push("--plan", typeof plan === "string" ? plan : DEFAULT_PLAN_PATH);
  }

  if (!options.get("apply")) {
    args.push("--dry-run");
  }
  return args;
}

function printNextSummary(payload: {
  review: {
    totals: {
      reviewed: number;
      keep: number;
      reject: number;
      needs_edit: number;
      merge_or_replace: number;
    };
  };
  plan: {
    summary: {
      selected: number;
      selected_implementation_ready?: number;
      ready_now_remaining: number;
      approval_ready_blocked_remaining?: number;
      ready_after: number;
      ambiguities: number;
      reject_or_needs_edit: number;
    };
    selected: Array<{ id: string; title: string }>;
    ready_now_remaining: Array<{ id: string; title: string }>;
    approval_ready_blocked_remaining?: Array<{ id: string; title: string }>;
    ambiguities: Array<{ id: string; title: string }>;
  };
}): void {
  const lines: string[] = [];
  lines.push(
    `Reviewed ${payload.review.totals.reviewed} generated stories: ${payload.review.totals.keep} keep, ${payload.review.totals.merge_or_replace} merge, ${payload.review.totals.needs_edit} needs edit, ${payload.review.totals.reject} reject.`
  );
  lines.push(
    `Selected tranche: ${payload.plan.summary.selected} approval candidates (${payload.plan.summary.selected_implementation_ready ?? 0} implementation-ready today). Ready now remaining: ${payload.plan.summary.ready_now_remaining}. Approval-ready but execution-blocked: ${payload.plan.summary.approval_ready_blocked_remaining ?? 0}. Ready after: ${payload.plan.summary.ready_after}. Ambiguities: ${payload.plan.summary.ambiguities}.`
  );
  lines.push("");
  lines.push("Selected now:");
  for (const story of payload.plan.selected.slice(0, 15)) {
    lines.push(`- ${story.id}: ${story.title}`);
  }
  if (payload.plan.ready_now_remaining.length > 0) {
    lines.push("");
    lines.push("Also ready now:");
    for (const story of payload.plan.ready_now_remaining.slice(0, 10)) {
      lines.push(`- ${story.id}: ${story.title}`);
    }
  }
  if ((payload.plan.approval_ready_blocked_remaining?.length ?? 0) > 0) {
    lines.push("");
    lines.push("Approval-ready but blocked on done prerequisites:");
    for (const story of payload.plan.approval_ready_blocked_remaining!.slice(
      0,
      10
    )) {
      lines.push(`- ${story.id}: ${story.title}`);
    }
  }
  if (payload.plan.ambiguities.length > 0) {
    lines.push("");
    lines.push("Ambiguities to handle separately:");
    for (const story of payload.plan.ambiguities.slice(0, 10)) {
      lines.push(`- ${story.id}: ${story.title}`);
    }
  }
  lines.push("");
  lines.push("Next commands:");
  lines.push("- Preview approval: npm run stories:approve");
  lines.push("- Apply approval: npm run stories:approve -- --apply");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printApproveSummary(payload: {
  promote: {
    dry_run?: true;
    promotable?: Array<{ id: string; from: string; to: string }>;
    promoted?: Array<{
      id: string;
      from: string;
      to: string;
      packet_path: string;
    }>;
    packets?: Array<{ storyId: string; outputPath: string }>;
  };
  sync?: {
    results?: Array<{
      story_id: string;
      issue_number?: number;
      issue_url?: string;
    }>;
  };
}): void {
  const lines: string[] = [];
  if (payload.promote.dry_run) {
    const promotable = payload.promote.promotable ?? [];
    lines.push(`Dry run: ${promotable.length} stories are promotable.`);
    for (const story of promotable) {
      lines.push(`- ${story.id}: ${story.from} -> ${story.to}`);
    }
    lines.push("");
    lines.push("Apply with:");
    lines.push("- npm run stories:approve -- --apply");
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  const promoted = payload.promote.promoted ?? [];
  lines.push(`Promoted ${promoted.length} stories to approved.`);
  for (const story of promoted) {
    lines.push(`- ${story.id}: ${story.from} -> ${story.to}`);
  }
  const packets = payload.promote.packets ?? [];
  if (packets.length > 0) {
    lines.push("");
    lines.push(`Built ${packets.length} approved packets.`);
    for (const packet of packets) {
      lines.push(`- ${packet.storyId}: ${packet.outputPath}`);
    }
  }
  const synced = payload.sync?.results ?? [];
  if (synced.length > 0) {
    lines.push("");
    lines.push(`Synced ${synced.length} stories to GitHub.`);
    for (const item of synced) {
      lines.push(
        `- ${item.story_id}: ${item.issue_url ?? `#${item.issue_number ?? "?"}`}`
      );
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printTransitionSummary(payload: {
  action: string;
  story: {
    id: string;
    from_path: string;
    to_path: string;
    from_status: string;
    to_status: string;
  };
  dry_run?: true;
  issue?: {
    issue_url?: string;
    issue_number?: number;
    commented: boolean;
    closed?: boolean;
  };
}): void {
  const lines: string[] = [];
  const mode = payload.dry_run ? "Dry run" : "Updated";
  lines.push(
    `${mode}: ${payload.story.id} ${payload.story.from_status} -> ${payload.story.to_status}`
  );
  lines.push(`- file: ${payload.story.from_path} -> ${payload.story.to_path}`);
  if (payload.issue?.issue_url || payload.issue?.issue_number) {
    lines.push(
      `- issue: ${payload.issue.issue_url ?? `#${payload.issue.issue_number ?? "?"}`}`
    );
    lines.push(`- comment posted: ${payload.issue.commented ? "yes" : "no"}`);
    if (payload.issue.closed !== undefined) {
      lines.push(`- issue closed: ${payload.issue.closed ? "yes" : "no"}`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printBranchPrSummary(payload: Record<string, unknown>): void {
  const lines: string[] = [];
  const dryRun = Boolean(payload.dry_run);
  const action = String(payload.action ?? "");
  if (action === "branch") {
    lines.push(
      `${dryRun ? "Dry run" : "Prepared"} branch ${String(payload.branch_name)} from ${String(payload.base_branch)} for ${String(payload.story_id)}`
    );
    lines.push(`- current branch: ${String(payload.current_branch ?? "")}`);
    lines.push(`- dirty worktree: ${payload.dirty_worktree ? "yes" : "no"}`);
  } else if (action === "pr") {
    lines.push(
      `${dryRun ? "Dry run" : "Prepared"} PR flow for ${String(payload.story_id)} on ${String(payload.branch_name)}`
    );
    const pr = payload.pr as Record<string, unknown> | undefined;
    const existing = payload.existing_pr as
      | Record<string, unknown>
      | null
      | undefined;
    const resolved = pr ?? existing;
    if (resolved?.pr_url || resolved?.url) {
      lines.push(`- PR: ${String(resolved.pr_url ?? resolved.url)}`);
    }
    lines.push(`- base branch: ${String(payload.base_branch ?? "")}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printContractAuditSummary(payload: {
  story_id: string;
  audit_path: string;
  git_head: string;
  reviewed_at: string;
  checklist: Array<{ label: string }>;
}): void {
  const lines: string[] = [];
  lines.push(`Contract audit passed for ${payload.story_id}.`);
  lines.push(`- artifact: ${payload.audit_path}`);
  lines.push(`- git head: ${payload.git_head}`);
  lines.push(`- reviewed at: ${payload.reviewed_at}`);
  lines.push("- checklist:");
  for (const item of payload.checklist) {
    lines.push(`  - ${item.label}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function nextWorkflow(options: Map<string, string | boolean>): void {
  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const review = buildReview(sectionLookup);
  writeUtf8(DEFAULT_REVIEW_PATH, `${JSON.stringify(review, null, 2)}\n`);

  const parsedPlanArgs = planArgs(options);
  const limitIndex = parsedPlanArgs.indexOf("--limit");
  const outputIndex = parsedPlanArgs.indexOf("--output");
  const reviewIndex = parsedPlanArgs.indexOf("--review");
  const plan = writeTranchePlan({
    limit:
      limitIndex >= 0
        ? Number.parseInt(parsedPlanArgs[limitIndex + 1], 10)
        : undefined,
    outputPath: outputIndex >= 0 ? parsedPlanArgs[outputIndex + 1] : undefined,
    reviewPath: reviewIndex >= 0 ? parsedPlanArgs[reviewIndex + 1] : undefined
  });

  const payload = {
    ok: true,
    command: "next",
    review,
    plan
  };

  if (options.get("json")) {
    printJson(payload);
    return;
  }

  printNextSummary(payload);
}

function approveWorkflow(options: Map<string, string | boolean>): void {
  const args = approveArgs(options);
  const idsIndex = args.indexOf("--ids");
  const planIndex = args.indexOf("--plan");
  const isDryRun = args.includes("--dry-run");
  const promote = promoteStories({
    ids:
      idsIndex >= 0
        ? args[idsIndex + 1]
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined,
    planPath:
      idsIndex >= 0
        ? undefined
        : planIndex >= 0
          ? args[planIndex + 1]
          : undefined,
    dryRun: isDryRun
  });

  let sync: ReturnType<typeof syncStories> | undefined;
  if (!isDryRun) {
    const promoted = promote.promoted ?? [];
    const storyPaths = promoted.map((entry) => entry.to);
    sync = syncStories({
      configPath: "tools/github-board.config.json",
      storyPaths
    });
    if (!sync.ok) {
      const failures =
        (sync.failures as
          | Array<{ story_path?: string; error?: string }>
          | undefined) ?? [];
      const details = failures
        .map(
          (failure) =>
            `${failure.story_path ?? "story"}: ${failure.error ?? "unknown error"}`
        )
        .join("\n");
      throw new Error(
        `Stories were approved and packets built, but board sync failed.\n${details}`
      );
    }
  }

  const payload = {
    ok: true,
    command: "approve",
    promote,
    sync
  };

  if (options.get("json")) {
    printJson(payload);
    return;
  }

  printApproveSummary(payload);
}

function branchPrWorkflow(
  command: Extract<WorkflowCommand, "branch" | "pr">,
  options: Map<string, string | boolean>
): void {
  const storyId =
    typeof options.get("id") === "string" ? String(options.get("id")) : "";
  if (!storyId) {
    throw new Error(`Command ${command} requires --id <STORY-ID>.`);
  }
  const args = [
    "--experimental-strip-types",
    "tools/story-branch-pr.ts",
    "--action",
    command,
    "--id",
    storyId
  ];
  const passthroughFlags = [
    "base",
    "dry-run",
    "allow-dirty",
    "push",
    "draft"
  ] as const;
  for (const flag of passthroughFlags) {
    const value = options.get(flag);
    if (value === undefined) {
      continue;
    }
    args.push(`--${flag}`);
    if (value !== true) {
      args.push(String(value));
    }
  }
  const payload = runJsonTool(args) as Record<string, unknown>;
  if (options.get("json")) {
    printJson(payload);
    return;
  }
  printBranchPrSummary(payload);
}

function contractAuditWorkflow(options: Map<string, string | boolean>): void {
  const storyId =
    typeof options.get("id") === "string" ? String(options.get("id")) : "";
  if (!storyId) {
    throw new Error("Command contract-audit requires --id <STORY-ID>.");
  }

  const args = [
    "--experimental-strip-types",
    "tools/contract-audit.ts",
    "--id",
    storyId
  ];
  const notes = options.get("notes");
  if (typeof notes === "string") {
    args.push("--notes", notes);
  }

  const payload = runJsonTool(args) as {
    story_id: string;
    audit_path: string;
    git_head: string;
    reviewed_at: string;
    checklist: Array<{ label: string }>;
  };

  if (options.get("json")) {
    printJson(payload);
    return;
  }

  printContractAuditSummary(payload);
}

function transitionWorkflow(
  command: Exclude<
    WorkflowCommand,
    "next" | "approve" | "branch" | "pr" | "contract-audit"
  >,
  options: Map<string, string | boolean>
): void {
  const storyId =
    typeof options.get("id") === "string" ? String(options.get("id")) : "";
  if (!storyId) {
    throw new Error(`Command ${command} requires --id <STORY-ID>.`);
  }
  const payload = transitionStory({
    action: command,
    storyId,
    dryRun: Boolean(options.get("dry-run"))
  });

  if (options.get("json")) {
    printJson(payload);
    return;
  }

  printTransitionSummary(payload);
}

function main(): void {
  const rawArgs = process.argv.slice(2);
  const command = parseCommand(rawArgs);
  const filteredArgs = rawArgs.filter((arg, index) => {
    if (index === 0 && arg === command) {
      return false;
    }
    return true;
  });
  const options = parseArgs(filteredArgs);

  if (command === "next") {
    nextWorkflow(options);
    return;
  }

  if (command === "approve") {
    approveWorkflow(options);
    return;
  }

  if (command === "branch" || command === "pr") {
    branchPrWorkflow(command, options);
    return;
  }

  if (command === "contract-audit") {
    contractAuditWorkflow(options);
    return;
  }

  transitionWorkflow(command, options);
}

main();
