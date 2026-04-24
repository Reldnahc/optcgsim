import {
  ensureDirectory,
  fileExists,
  listStoryFiles,
  loadStory,
  parseArgs,
  printJson,
  readUtf8,
  writeUtf8,
  type Story
} from "./spec_story_lib.ts";
import { fileURLToPath } from "node:url";

type ReviewRecommendation =
  | "keep"
  | "merge_or_replace"
  | "reject"
  | "needs_edit";

interface StoryReview {
  id: string;
  title: string;
  path: string;
  recommendation: ReviewRecommendation;
  reasons: string[];
}

interface ReviewReport {
  ok: true;
  totals: {
    reviewed: number;
    keep: number;
    merge_or_replace: number;
    reject: number;
    needs_edit: number;
  };
  storyReviews: StoryReview[];
}

interface PlannedStory {
  id: string;
  title: string;
  path: string;
  area: Story["area"];
  type: Story["type"];
  priority: Story["priority"];
  score: number;
  unmet_story_dependencies: string[];
  unmet_done_story_dependencies: string[];
  story_dependencies: string[];
  reverse_dependency_count: number;
  implementation_ready: boolean;
  reasons: string[];
}

interface TranchePlan {
  ok: true;
  source_review: string;
  limit: number;
  summary: {
    generated_stories: number;
    approved_or_done_stories: number;
    approved_stories: number;
    done_stories: number;
    candidate_keep_stories: number;
    selected: number;
    selected_implementation_ready: number;
    ready_now_remaining: number;
    approval_ready_blocked_remaining: number;
    ready_after: number;
    ambiguities: number;
    merge_or_replace: number;
    reject_or_needs_edit: number;
  };
  selected: PlannedStory[];
  ready_now_remaining: PlannedStory[];
  approval_ready_blocked_remaining: PlannedStory[];
  ready_after: PlannedStory[];
  ambiguities: PlannedStory[];
  merge_or_replace: PlannedStory[];
  reject_or_needs_edit: PlannedStory[];
}

const STORY_ID_RE = /^[A-Z]{2,}-\d{3,}$/;
const DEFAULT_REVIEW_PATH = "stories/generated-review.json";
const DEFAULT_OUTPUT_PATH = "stories/tranches/tranche-001.json";
const GENERATED_DIR = "stories/generated";

function isStoryId(value: string): boolean {
  return STORY_ID_RE.test(value);
}

function loadReviewReport(reviewPath: string): ReviewReport {
  return JSON.parse(readUtf8(reviewPath)) as ReviewReport;
}

function loadStoriesByDir(
  relativeDir: string
): Array<{ path: string; story: Story }> {
  return listStoryFiles(relativeDir).map((path) => ({
    path,
    story: loadStory(path)
  }));
}

function priorityWeight(priority: Story["priority"]): number {
  switch (priority) {
    case "critical":
      return 100;
    case "high":
      return 70;
    case "medium":
      return 40;
    case "low":
      return 10;
  }
}

function areaWeight(area: Story["area"]): number {
  switch (area) {
    case "infra":
      return 30;
    case "contracts":
      return 28;
    case "engine":
      return 24;
    case "security":
      return 22;
    case "database":
      return 18;
    case "server":
      return 14;
    case "cards":
      return 12;
    case "client":
      return 10;
    case "replay":
      return 8;
    case "docs":
      return 4;
  }
}

function typeWeight(type: Story["type"]): number {
  switch (type) {
    case "tooling":
      return 12;
    case "implementation":
      return 10;
    case "verification":
      return 8;
    case "design":
      return 6;
    case "refactor":
      return 6;
    case "ambiguity":
      return 0;
  }
}

function storyDependencyIds(story: Story): string[] {
  return story.dependencies.filter(isStoryId);
}

function reverseDependencyCounts(stories: Story[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const story of stories) {
    for (const dependency of storyDependencyIds(story)) {
      counts.set(dependency, (counts.get(dependency) ?? 0) + 1);
    }
  }
  return counts;
}

function storyScore(story: Story, dependents: number): number {
  const dependencyPenalty = storyDependencyIds(story).length * 2;
  const ambiguityPenalty =
    story.ambiguity_policy === "fail_and_escalate" ? 2 : 0;
  return (
    priorityWeight(story.priority) +
    areaWeight(story.area) +
    typeWeight(story.type) +
    dependents * 4 -
    dependencyPenalty -
    ambiguityPenalty
  );
}

function unmetDoneDependencies(story: Story, doneIds: Set<string>): string[] {
  return storyDependencyIds(story).filter(
    (dependency) => !doneIds.has(dependency)
  );
}

function plannedStory(
  story: Story,
  path: string,
  score: number,
  reverseDependencyCount: number,
  unmetDeps: string[],
  unmetDoneDeps: string[],
  reasons: string[]
): PlannedStory {
  return {
    id: story.id,
    title: story.title,
    path,
    area: story.area,
    type: story.type,
    priority: story.priority,
    score,
    unmet_story_dependencies: unmetDeps,
    unmet_done_story_dependencies: unmetDoneDeps,
    story_dependencies: storyDependencyIds(story),
    reverse_dependency_count: reverseDependencyCount,
    implementation_ready: unmetDoneDeps.length === 0,
    reasons
  };
}

function comparePlannedStories(
  left: PlannedStory,
  right: PlannedStory
): number {
  return (
    right.score - left.score ||
    right.reverse_dependency_count - left.reverse_dependency_count ||
    left.id.localeCompare(right.id)
  );
}

export interface TranchePlanOptions {
  limit?: number;
  reviewPath?: string;
  outputPath?: string;
}

export function createTranchePlan(
  options: TranchePlanOptions = {}
): TranchePlan {
  const limit = options.limit ?? 15;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(
      `limit must be a positive integer, got ${JSON.stringify(limit)}`
    );
  }

  const reviewPath = options.reviewPath ?? DEFAULT_REVIEW_PATH;
  if (!fileExists(reviewPath)) {
    throw new Error(
      `Missing review report at ${reviewPath}. Run stories:review first.`
    );
  }

  const report = loadReviewReport(reviewPath);
  const reviewById = new Map(
    report.storyReviews.map((review) => [review.id, review])
  );
  const generated = loadStoriesByDir(GENERATED_DIR);
  const approvedStories = loadStoriesByDir("stories/approved");
  const doneStories = loadStoriesByDir("stories/done");
  const approvedOrDone = [...approvedStories, ...doneStories];
  const satisfiedIds = new Set(approvedOrDone.map((entry) => entry.story.id));
  const doneIds = new Set(doneStories.map((entry) => entry.story.id));
  const keepStories = generated.filter(
    (entry) => reviewById.get(entry.story.id)?.recommendation === "keep"
  );
  const keepNonAmbiguities = keepStories.filter(
    (entry) => entry.story.type !== "ambiguity"
  );
  const dependents = reverseDependencyCounts(
    keepNonAmbiguities.map((entry) => entry.story)
  );

  const selectedIds = new Set<string>();
  const selected: PlannedStory[] = [];

  while (selected.length < limit) {
    const available = keepNonAmbiguities
      .filter((entry) => !selectedIds.has(entry.story.id))
      .map((entry) => {
        const unmetDeps = storyDependencyIds(entry.story).filter(
          (dependency) =>
            !satisfiedIds.has(dependency) && !selectedIds.has(dependency)
        );
        if (unmetDeps.length > 0) {
          return null;
        }
        const score = storyScore(
          entry.story,
          dependents.get(entry.story.id) ?? 0
        );
        const unmetDoneDeps = unmetDoneDependencies(entry.story, doneIds);
        const reasons = [
          `priority=${entry.story.priority}`,
          `area=${entry.story.area}`,
          `dependents=${dependents.get(entry.story.id) ?? 0}`
        ];
        if (unmetDoneDeps.length > 0) {
          reasons.push(
            `implementation waits on done: ${unmetDoneDeps.join(", ")}`
          );
        } else {
          reasons.push("implementation-ready with current done dependencies");
        }
        return plannedStory(
          entry.story,
          entry.path,
          score,
          dependents.get(entry.story.id) ?? 0,
          [],
          unmetDoneDeps,
          reasons
        );
      })
      .filter((entry): entry is PlannedStory => entry !== null)
      .sort(comparePlannedStories);

    if (available.length === 0) {
      break;
    }

    const next = available[0];
    selected.push(next);
    selectedIds.add(next.id);
  }

  const selectedIdSet = new Set(selected.map((entry) => entry.id));
  const readyNowRemaining = keepNonAmbiguities
    .filter((entry) => !selectedIdSet.has(entry.story.id))
    .map((entry) => {
      const unmetDeps = storyDependencyIds(entry.story).filter(
        (dependency) => !satisfiedIds.has(dependency)
      );
      if (unmetDeps.length > 0) {
        return null;
      }
      const unmetDoneDeps = unmetDoneDependencies(entry.story, doneIds);
      if (unmetDoneDeps.length > 0) {
        return null;
      }
      const score = storyScore(
        entry.story,
        dependents.get(entry.story.id) ?? 0
      );
      return plannedStory(
        entry.story,
        entry.path,
        score,
        dependents.get(entry.story.id) ?? 0,
        [],
        [],
        ["ready with current approved/done dependencies"]
      );
    })
    .filter((entry): entry is PlannedStory => entry !== null)
    .sort(comparePlannedStories);

  const approvalReadyBlockedRemaining = keepNonAmbiguities
    .filter((entry) => !selectedIdSet.has(entry.story.id))
    .map((entry) => {
      const unmetDeps = storyDependencyIds(entry.story).filter(
        (dependency) => !satisfiedIds.has(dependency)
      );
      if (unmetDeps.length > 0) {
        return null;
      }
      const unmetDoneDeps = unmetDoneDependencies(entry.story, doneIds);
      if (unmetDoneDeps.length === 0) {
        return null;
      }
      const score = storyScore(
        entry.story,
        dependents.get(entry.story.id) ?? 0
      );
      return plannedStory(
        entry.story,
        entry.path,
        score,
        dependents.get(entry.story.id) ?? 0,
        [],
        unmetDoneDeps,
        [
          `approval-ready, but implementation waits on done: ${unmetDoneDeps.join(", ")}`
        ]
      );
    })
    .filter((entry): entry is PlannedStory => entry !== null)
    .sort(comparePlannedStories);

  const readyAfter = keepNonAmbiguities
    .filter((entry) => !selectedIdSet.has(entry.story.id))
    .map((entry) => {
      const unmetDeps = storyDependencyIds(entry.story).filter(
        (dependency) =>
          !satisfiedIds.has(dependency) && !selectedIdSet.has(dependency)
      );
      if (unmetDeps.length === 0) {
        return null;
      }
      const score = storyScore(
        entry.story,
        dependents.get(entry.story.id) ?? 0
      );
      return plannedStory(
        entry.story,
        entry.path,
        score,
        dependents.get(entry.story.id) ?? 0,
        unmetDeps,
        unmetDoneDependencies(entry.story, doneIds),
        [`waits on ${unmetDeps.join(", ")}`]
      );
    })
    .filter((entry): entry is PlannedStory => entry !== null)
    .sort(comparePlannedStories);

  const ambiguities = keepStories
    .filter((entry) => entry.story.type === "ambiguity")
    .map((entry) =>
      plannedStory(
        entry.story,
        entry.path,
        storyScore(entry.story, dependents.get(entry.story.id) ?? 0),
        dependents.get(entry.story.id) ?? 0,
        [],
        unmetDoneDependencies(entry.story, doneIds),
        ["clarification item; do not promote into implementation tranche"]
      )
    )
    .sort(comparePlannedStories);

  const mergeOrReplace = generated
    .filter(
      (entry) =>
        reviewById.get(entry.story.id)?.recommendation === "merge_or_replace"
    )
    .map((entry) =>
      plannedStory(
        entry.story,
        entry.path,
        storyScore(entry.story, dependents.get(entry.story.id) ?? 0),
        dependents.get(entry.story.id) ?? 0,
        storyDependencyIds(entry.story).filter(
          (dependency) => !satisfiedIds.has(dependency)
        ),
        unmetDoneDependencies(entry.story, doneIds),
        reviewById.get(entry.story.id)?.reasons ?? []
      )
    )
    .sort(comparePlannedStories);

  const rejectOrNeedsEdit = generated
    .filter((entry) => {
      const recommendation = reviewById.get(entry.story.id)?.recommendation;
      return recommendation === "reject" || recommendation === "needs_edit";
    })
    .map((entry) =>
      plannedStory(
        entry.story,
        entry.path,
        storyScore(entry.story, dependents.get(entry.story.id) ?? 0),
        dependents.get(entry.story.id) ?? 0,
        storyDependencyIds(entry.story).filter(
          (dependency) => !satisfiedIds.has(dependency)
        ),
        unmetDoneDependencies(entry.story, doneIds),
        reviewById.get(entry.story.id)?.reasons ?? []
      )
    )
    .sort(comparePlannedStories);

  return {
    ok: true,
    source_review: reviewPath,
    limit,
    summary: {
      generated_stories: generated.length,
      approved_or_done_stories: approvedOrDone.length,
      approved_stories: approvedStories.length,
      done_stories: doneStories.length,
      candidate_keep_stories: keepStories.length,
      selected: selected.length,
      selected_implementation_ready: selected.filter(
        (entry) => entry.implementation_ready
      ).length,
      ready_now_remaining: readyNowRemaining.length,
      approval_ready_blocked_remaining: approvalReadyBlockedRemaining.length,
      ready_after: readyAfter.length,
      ambiguities: ambiguities.length,
      merge_or_replace: mergeOrReplace.length,
      reject_or_needs_edit: rejectOrNeedsEdit.length
    },
    selected,
    ready_now_remaining: readyNowRemaining,
    approval_ready_blocked_remaining: approvalReadyBlockedRemaining,
    ready_after: readyAfter,
    ambiguities,
    merge_or_replace: mergeOrReplace,
    reject_or_needs_edit: rejectOrNeedsEdit
  };
}

export function writeTranchePlan(
  options: TranchePlanOptions = {}
): TranchePlan {
  const plan = createTranchePlan(options);
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;
  ensureDirectory("stories/tranches");
  writeUtf8(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const limitRaw =
    typeof args.get("limit") === "string" ? String(args.get("limit")) : "15";
  const limit = Number.parseInt(limitRaw, 10);
  const outputPath =
    typeof args.get("output") === "string"
      ? String(args.get("output"))
      : DEFAULT_OUTPUT_PATH;
  const reviewPath =
    typeof args.get("review") === "string"
      ? String(args.get("review"))
      : DEFAULT_REVIEW_PATH;
  const plan = writeTranchePlan({ limit, reviewPath, outputPath });
  printJson(plan);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
