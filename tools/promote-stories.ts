import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  ensureDirectory,
  fileExists,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  parseArgs,
  printJson,
  readUtf8,
  storyToYaml,
  validateStory,
  writeUtf8,
  buildSectionLookup,
  type Story
} from "./spec_story_lib.ts";
import { buildPacketsForApprovedStories } from "./build-agent-packet.ts";

interface TranchePlan {
  ok: true;
  selected: Array<{ id: string }>;
}

const STORY_ID_RE = /^[A-Z]{2,}-\d{3,}$/;
const GENERATED_DIR = "stories/generated";
const APPROVED_DIR = "stories/approved";
const SATISFIED_DIRS = ["stories/approved", "stories/done"];

function isStoryId(value: string): boolean {
  return STORY_ID_RE.test(value);
}

function parseIds(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function loadSatisfiedIds(): Set<string> {
  return new Set(
    SATISFIED_DIRS.flatMap((dir) =>
      listStoryFiles(dir).map((filePath) => loadStory(filePath).id)
    )
  );
}

function loadIdsFromPlan(planPath: string): string[] {
  const plan = JSON.parse(readUtf8(planPath)) as TranchePlan;
  return plan.selected.map((entry) => entry.id);
}

function approvedPacketPath(storyId: string): string {
  return `agent-packets/approved/${storyId}.packet.md`;
}

export interface PromoteStoriesOptions {
  ids?: string[];
  planPath?: string;
  dryRun?: boolean;
}

export function promoteStories(options: PromoteStoriesOptions): {
  ok: true;
  dry_run?: true;
  promotable?: Array<{
    id: string;
    from: string;
    to: string;
    packet_path: string;
  }>;
  promoted?: Array<{
    id: string;
    from: string;
    to: string;
    packet_path: string;
  }>;
  packets?: Array<{ storyId: string; outputPath: string }>;
} {
  const ids =
    options.ids && options.ids.length > 0
      ? [...new Set(options.ids)]
      : options.planPath
        ? loadIdsFromPlan(options.planPath)
        : [];

  if (ids.length === 0) {
    throw new Error(
      "Usage: node --experimental-strip-types tools/promote-stories.ts --ids <ID1,ID2> | --plan <stories/tranches/*.json>"
    );
  }

  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const satisfiedIds = loadSatisfiedIds();
  const selectedIdSet = new Set(ids);
  const moved: Array<{ id: string; from: string; to: string }> = [];

  for (const id of ids) {
    const sourcePath = `${GENERATED_DIR}/${id}.story.yaml`;
    if (!fileExists(sourcePath)) {
      throw new Error(`Missing generated story ${id} at ${sourcePath}`);
    }
    const story = loadStory(sourcePath);
    if (story.status !== "generated") {
      throw new Error(
        `Story ${id} is not generated; got status ${JSON.stringify(story.status)}`
      );
    }

    const unresolvedDeps = story.dependencies.filter(
      (dependency) =>
        isStoryId(dependency) &&
        !satisfiedIds.has(dependency) &&
        !selectedIdSet.has(dependency)
    );
    if (unresolvedDeps.length > 0) {
      throw new Error(
        `Cannot promote ${id}; unresolved story dependencies: ${unresolvedDeps.join(", ")}`
      );
    }
  }

  ensureDirectory(APPROVED_DIR);
  ensureDirectory("agent-packets/approved");

  if (options.dryRun) {
    return {
      ok: true,
      dry_run: true,
      promotable: ids.map((id) => ({
        id,
        from: `${GENERATED_DIR}/${id}.story.yaml`,
        to: `${APPROVED_DIR}/${id}.story.yaml`,
        packet_path: approvedPacketPath(id)
      }))
    };
  }

  for (const id of ids) {
    const sourcePath = `${GENERATED_DIR}/${id}.story.yaml`;
    const destinationPath = `${APPROVED_DIR}/${id}.story.yaml`;
    if (fileExists(destinationPath)) {
      throw new Error(
        `Refusing to overwrite existing approved story at ${destinationPath}`
      );
    }

    const story = loadStory(sourcePath);
    const promoted: Story = {
      ...story,
      status: "approved",
      agent: {
        ...story.agent,
        packet_path: approvedPacketPath(story.id)
      }
    };
    validateStory(promoted, sectionLookup);
    writeUtf8(destinationPath, storyToYaml(promoted));
    fs.unlinkSync(path.resolve(ROOT, sourcePath));
    moved.push({ id, from: sourcePath, to: destinationPath });
  }

  const packets = buildPacketsForApprovedStories(ids);

  return {
    ok: true,
    promoted: moved.map((entry) => ({
      ...entry,
      packet_path: approvedPacketPath(entry.id)
    })),
    packets
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const rawIds =
    typeof args.get("ids") === "string" ? String(args.get("ids")) : "";
  const planPath =
    typeof args.get("plan") === "string" ? String(args.get("plan")) : "";
  const result = promoteStories({
    ids: rawIds ? parseIds(rawIds) : undefined,
    planPath: rawIds ? undefined : planPath || undefined,
    dryRun: Boolean(args.get("dry-run"))
  });
  printJson(result);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
