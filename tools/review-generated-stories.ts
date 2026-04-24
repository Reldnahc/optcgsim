import {
  buildSectionLookup,
  extractSectionExcerpt,
  fileExists,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  normalizeSpecRef,
  parseArgs,
  printJson,
  writeUtf8,
  type SectionEntry,
  type Story
} from "./spec_story_lib.ts";
import { fileURLToPath } from "node:url";

type Recommendation = "keep" | "merge_or_replace" | "reject" | "needs_edit";

interface DependencyIssue {
  dependency: string;
  kind: "placeholder" | "missing";
}

interface DuplicateHit {
  otherId: string;
  otherTitle: string;
  relation: "exact_title" | "same_spec_footprint" | "high_overlap";
  overlapScore: number;
}

interface FalseAmbiguityHit {
  ruleId: string;
  reason: string;
  supportingSpecRefs: string[];
}

interface StoryReview {
  id: string;
  title: string;
  path: string;
  recommendation: Recommendation;
  reasons: string[];
  dependencyIssues: DependencyIssue[];
  duplicateHits: DuplicateHit[];
  falseAmbiguityHits: FalseAmbiguityHit[];
}

interface ReviewSummary {
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

const GENERATED_DIR = "stories/generated";
const KNOWN_STORY_DIRS = [
  "stories/generated",
  "stories/approved",
  "stories/done",
  "stories/blocked"
];
const PLACEHOLDER_DEP_RE = /^STORY-\d+$/;

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedSpecFootprint(story: Story): string[] {
  return story.spec_refs.map((specRef) => normalizeSpecRef(specRef)).sort();
}

function setIntersection<T>(left: Set<T>, right: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of left) {
    if (right.has(item)) {
      result.add(item);
    }
  }
  return result;
}

function overlapScore(story: Story, other: Story): number {
  const left = new Set(normalizedSpecFootprint(story));
  const right = new Set(normalizedSpecFootprint(other));
  const intersectionSize = setIntersection(left, right).size;
  const unionSize = new Set([...left, ...right]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

function normalizedTitleTokens(value: string): Set<string> {
  const stopWords = new Set([
    "a",
    "an",
    "add",
    "and",
    "baseline",
    "create",
    "for",
    "implement",
    "in",
    "of",
    "the",
    "to",
    "with"
  ]);
  return new Set(
    normalizeTitle(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stopWords.has(token))
  );
}

function titleOverlapScore(left: string, right: string): number {
  const leftTokens = normalizedTitleTokens(left);
  const rightTokens = normalizedTitleTokens(right);
  const intersectionSize = setIntersection(leftTokens, rightTokens).size;
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

function loadAllStories(): Array<{ path: string; story: Story }> {
  return listStoryFiles(GENERATED_DIR).map((path) => ({
    path,
    story: loadStory(path)
  }));
}

function loadKnownStoryIds(): Set<string> {
  const ids = new Set<string>();
  for (const dir of KNOWN_STORY_DIRS) {
    for (const path of listStoryFiles(dir)) {
      ids.add(loadStory(path).id);
    }
  }
  return ids;
}

function isArtifactDependency(dependency: string): boolean {
  return /[\\/]/.test(dependency) || /\.[A-Za-z0-9]+$/.test(dependency);
}

function findDependencyIssues(
  story: Story,
  knownIds: Set<string>
): DependencyIssue[] {
  return story.dependencies.flatMap((dependency) => {
    if (PLACEHOLDER_DEP_RE.test(dependency)) {
      return [{ dependency, kind: "placeholder" as const }];
    }
    if (isArtifactDependency(dependency)) {
      return [];
    }
    if (fileExists(dependency)) {
      return [];
    }
    if (!knownIds.has(dependency)) {
      return [{ dependency, kind: "missing" as const }];
    }
    return [];
  });
}

function findDuplicateHits(
  story: Story,
  candidates: Array<{ path: string; story: Story }>
): DuplicateHit[] {
  const storyTitle = normalizeTitle(story.title);
  const storyFootprint = normalizedSpecFootprint(story).join("|");
  const hits: DuplicateHit[] = [];

  for (const candidate of candidates) {
    const other = candidate.story;
    if (other.id === story.id) {
      continue;
    }

    const otherTitle = normalizeTitle(other.title);
    const otherFootprint = normalizedSpecFootprint(other).join("|");

    if (storyTitle === otherTitle) {
      hits.push({
        otherId: other.id,
        otherTitle: other.title,
        relation: "exact_title",
        overlapScore: 1
      });
      continue;
    }

    if (
      story.area === other.area &&
      story.type === other.type &&
      storyFootprint === otherFootprint
    ) {
      hits.push({
        otherId: other.id,
        otherTitle: other.title,
        relation: "same_spec_footprint",
        overlapScore: 1
      });
      continue;
    }

    const score = overlapScore(story, other);
    const titleScore = titleOverlapScore(story.title, other.title);
    if (
      story.area === other.area &&
      story.type === other.type &&
      score >= 0.6 &&
      titleScore >= 0.3
    ) {
      hits.push({
        otherId: other.id,
        otherTitle: other.title,
        relation: "high_overlap",
        overlapScore: Number(score.toFixed(2))
      });
    }
  }

  return hits.sort(
    (left, right) =>
      right.overlapScore - left.overlapScore ||
      left.otherId.localeCompare(right.otherId)
  );
}

function findFalseAmbiguityHits(
  story: Story,
  sectionLookup: Map<string, SectionEntry>
): FalseAmbiguityHit[] {
  if (story.type !== "ambiguity") {
    return [];
  }

  const titleAndSummary = `${story.title} ${story.summary}`.toLowerCase();
  const hits: FalseAmbiguityHit[] = [];

  const likelySpectatorDelay =
    /\bspectator\b/.test(titleAndSummary) &&
    /\bdelay|\bdelayed/.test(titleAndSummary) &&
    !/\bshape\b|\bschema\b|\bcontract\b|\bprotocol\b/.test(titleAndSummary);
  if (likelySpectatorDelay) {
    const closure = sectionLookup.get("22-v6-implementation-tightening.s014");
    const excerpt = closure ? extractSectionExcerpt(closure) : "";
    if (excerpt.includes("delayTurns = 3")) {
      hits.push({
        ruleId: "spectator-delay-closed",
        reason:
          "The tightening spec already defines ranked public spectator default as delayed-filtered with delayTurns = 3 plus server-configured time/action delay.",
        supportingSpecRefs: ["22-v6-implementation-tightening.s014"]
      });
    }
  }

  return hits;
}

function recommendStory(
  review: Omit<StoryReview, "recommendation" | "reasons">
): Pick<StoryReview, "recommendation" | "reasons"> {
  const reasons: string[] = [];

  if (review.falseAmbiguityHits.length > 0) {
    reasons.push("ambiguity is already closed by cited or tightening spec");
  }
  if (review.dependencyIssues.some((issue) => issue.kind === "placeholder")) {
    reasons.push("contains placeholder dependencies");
  }
  if (review.dependencyIssues.some((issue) => issue.kind === "missing")) {
    reasons.push("contains dependencies that do not resolve to repo story IDs");
  }
  if (
    review.duplicateHits.some(
      (hit) =>
        hit.relation === "exact_title" || hit.relation === "same_spec_footprint"
    )
  ) {
    reasons.push("duplicates an existing generated story");
  } else if (
    review.duplicateHits.some((hit) => hit.relation === "high_overlap")
  ) {
    reasons.push("heavily overlaps another generated story");
  }

  if (review.falseAmbiguityHits.length > 0) {
    return { recommendation: "reject", reasons };
  }
  if (review.dependencyIssues.length > 0) {
    return { recommendation: "needs_edit", reasons };
  }
  if (review.duplicateHits.length > 0) {
    return { recommendation: "merge_or_replace", reasons };
  }
  return { recommendation: "keep", reasons };
}

export function buildReview(
  sectionLookup: Map<string, SectionEntry>
): ReviewSummary {
  const stories = loadAllStories();
  const knownIds = loadKnownStoryIds();

  const storyReviews: StoryReview[] = stories.map((entry) => {
    const dependencyIssues = findDependencyIssues(entry.story, knownIds);
    const duplicateHits = findDuplicateHits(entry.story, stories);
    const falseAmbiguityHits = findFalseAmbiguityHits(
      entry.story,
      sectionLookup
    );
    const recommendation = recommendStory({
      id: entry.story.id,
      title: entry.story.title,
      path: entry.path,
      dependencyIssues,
      duplicateHits,
      falseAmbiguityHits
    });

    return {
      id: entry.story.id,
      title: entry.story.title,
      path: entry.path,
      dependencyIssues,
      duplicateHits,
      falseAmbiguityHits,
      recommendation: recommendation.recommendation,
      reasons: recommendation.reasons
    };
  });

  const totals = {
    reviewed: storyReviews.length,
    keep: storyReviews.filter((item) => item.recommendation === "keep").length,
    merge_or_replace: storyReviews.filter(
      (item) => item.recommendation === "merge_or_replace"
    ).length,
    reject: storyReviews.filter((item) => item.recommendation === "reject")
      .length,
    needs_edit: storyReviews.filter(
      (item) => item.recommendation === "needs_edit"
    ).length
  };

  return {
    ok: true,
    totals,
    storyReviews: storyReviews.sort((left, right) =>
      left.id.localeCompare(right.id)
    )
  };
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputPath =
    typeof args.get("output") === "string"
      ? String(args.get("output"))
      : undefined;
  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const report = buildReview(sectionLookup);

  if (outputPath) {
    const text = `${JSON.stringify(report, null, 2)}\n`;
    writeUtf8(outputPath.replace(/\\/g, "/"), text);
  }

  printJson(report);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  void main();
}
