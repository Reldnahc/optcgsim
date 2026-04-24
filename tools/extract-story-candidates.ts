import {
  buildSectionLookup,
  enrichSpecRefs,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  normalizeSpecRef,
  parseArgs,
  printJson,
  type Story,
  validateStory
} from "./spec_story_lib.ts";
import {
  buildLlmPromptPack,
  extractStoriesFromSpecRefs,
  listProfileNames,
  resolveSelectedSpecRefs,
  writeExtractedStories
} from "./spec_story_extractor.ts";
import { generateStoriesWithOpenAi } from "./openai_story_generation.ts";
import { chooseIdPrefix } from "./story_id_policy.ts";

function parseSpecRefsArgument(
  rawValue: string | boolean | undefined
): string[] {
  if (typeof rawValue !== "string") {
    return [];
  }
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface DuplicateRecord {
  droppedId: string;
  droppedTitle: string;
  duplicateOfId: string;
  duplicateOfTitle: string;
  reason: "title" | "spec_footprint";
}

interface DependencyAdjustment {
  storyId: string;
  dependency: string;
  action: "remapped" | "dropped_missing" | "dropped_self";
  replacement?: string;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSpecRefsForCompare(story: Story): string[] {
  return story.spec_refs.map((specRef) => normalizeSpecRef(specRef)).sort();
}

function loadExistingStories(): Story[] {
  const directories = [
    "stories/generated",
    "stories/approved",
    "stories/blocked",
    "stories/done",
    "stories/ambiguities"
  ];
  const files = [
    ...new Set(directories.flatMap((directory) => listStoryFiles(directory)))
  ];
  return files.map((filePath) => loadStory(filePath));
}

function assignRepoNativeIds(
  stories: Story[],
  existingStories: Story[]
): { stories: Story[]; idMap: Map<string, string> } {
  const highestByPrefix = new Map<string, number>();
  const allStories = [...existingStories, ...stories];
  const idMap = new Map<string, string>();

  for (const story of allStories) {
    const match = story.id.match(/^([A-Z]{2,})-(\d{3,})$/);
    if (!match) {
      continue;
    }
    const [, prefix, rawNumber] = match;
    const next = Number.parseInt(rawNumber, 10);
    const current = highestByPrefix.get(prefix) ?? 0;
    if (next > current) {
      highestByPrefix.set(prefix, next);
    }
  }

  const usedIds = new Set(existingStories.map((story) => story.id));
  for (const story of stories) {
    const originalId = story.id;
    const preferredPrefix = chooseIdPrefix(story);
    const currentMatchesPrefix = story.id.startsWith(`${preferredPrefix}-`);
    if (currentMatchesPrefix && !usedIds.has(story.id)) {
      idMap.set(originalId, story.id);
      usedIds.add(story.id);
      continue;
    }
    let candidateNumber = (highestByPrefix.get(preferredPrefix) ?? 0) + 1;
    let candidateId = `${preferredPrefix}-${String(candidateNumber).padStart(3, "0")}`;
    while (usedIds.has(candidateId)) {
      candidateNumber += 1;
      candidateId = `${preferredPrefix}-${String(candidateNumber).padStart(3, "0")}`;
    }
    highestByPrefix.set(preferredPrefix, candidateNumber);
    story.id = candidateId;
    idMap.set(originalId, candidateId);
    usedIds.add(candidateId);
  }

  return { stories, idMap };
}

function removeDuplicateStories(
  stories: Story[],
  existingStories: Story[]
): { stories: Story[]; duplicates: DuplicateRecord[] } {
  const accepted: Story[] = [];
  const duplicates: DuplicateRecord[] = [];
  const comparisonPool = [...existingStories];

  for (const story of stories) {
    const normalizedTitle = normalizeTitle(story.title);
    const normalizedSpecRefs = normalizeSpecRefsForCompare(story);
    const duplicate = comparisonPool.find((candidate) => {
      if (normalizeTitle(candidate.title) === normalizedTitle) {
        return true;
      }
      const candidateSpecRefs = normalizeSpecRefsForCompare(candidate);
      return (
        candidate.area === story.area &&
        candidate.type === story.type &&
        candidateSpecRefs.join("|") === normalizedSpecRefs.join("|")
      );
    });

    if (duplicate) {
      duplicates.push({
        droppedId: story.id,
        droppedTitle: story.title,
        duplicateOfId: duplicate.id,
        duplicateOfTitle: duplicate.title,
        reason:
          normalizeTitle(duplicate.title) === normalizedTitle
            ? "title"
            : "spec_footprint"
      });
      continue;
    }

    accepted.push(story);
    comparisonPool.push(story);
  }

  return { stories: accepted, duplicates };
}

function remapDependencies(
  stories: Story[],
  existingStories: Story[],
  idMap: Map<string, string>,
  duplicates: DuplicateRecord[]
): DependencyAdjustment[] {
  const existingIds = new Set(existingStories.map((story) => story.id));
  const duplicateMap = new Map(
    duplicates.map((record) => [record.droppedId, record.duplicateOfId])
  );
  const adjustments: DependencyAdjustment[] = [];

  for (const story of stories) {
    const remappedDependencies: string[] = [];
    const seenDependencies = new Set<string>();

    for (const dependency of story.dependencies) {
      const remappedDependency =
        idMap.get(dependency) ??
        (() => {
          const duplicateOfId = duplicateMap.get(dependency);
          if (!duplicateOfId) {
            return undefined;
          }
          return idMap.get(duplicateOfId) ?? duplicateOfId;
        })() ??
        dependency;

      if (remappedDependency === story.id) {
        adjustments.push({
          storyId: story.id,
          dependency,
          action: "dropped_self"
        });
        continue;
      }

      if (
        !existingIds.has(remappedDependency) &&
        !idMapHasValue(idMap, remappedDependency)
      ) {
        adjustments.push({
          storyId: story.id,
          dependency,
          action: "dropped_missing"
        });
        continue;
      }

      if (dependency !== remappedDependency) {
        adjustments.push({
          storyId: story.id,
          dependency,
          action: "remapped",
          replacement: remappedDependency
        });
      }

      if (!seenDependencies.has(remappedDependency)) {
        remappedDependencies.push(remappedDependency);
        seenDependencies.add(remappedDependency);
      }
    }

    story.dependencies = remappedDependencies;
  }

  return adjustments;
}

function idMapHasValue(idMap: Map<string, string>, candidate: string): boolean {
  for (const value of idMap.values()) {
    if (value === candidate) {
      return true;
    }
  }
  return false;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.get("list-profiles")) {
    printJson({
      ok: true,
      profiles: listProfileNames()
    });
    return;
  }
  const profile =
    typeof args.get("profile") === "string"
      ? String(args.get("profile"))
      : undefined;
  const explicitSpecRefs = parseSpecRefsArgument(args.get("spec-refs"));
  const outputDir =
    typeof args.get("output-dir") === "string"
      ? String(args.get("output-dir"))
      : "stories/generated";
  const write = Boolean(args.get("write"));
  const includePromptPack = Boolean(args.get("llm-prompt"));
  const useOpenAi = Boolean(args.get("openai"));
  const model =
    typeof args.get("model") === "string"
      ? String(args.get("model"))
      : "gpt-5.2";

  const selectedSpecRefs = resolveSelectedSpecRefs(profile, explicitSpecRefs);
  const existingStories = loadExistingStories();
  const extraction = useOpenAi
    ? {
        matchedRules: [] as Array<{
          id: string;
          description: string;
          requiredSpecRefs: string[];
          storyId: string;
        }>,
        stories: (
          await generateStoriesWithOpenAi({
            model,
            selectedSpecRefs,
            existingStories
          })
        ).stories,
        selectedSpecRefs
      }
    : extractStoriesFromSpecRefs(selectedSpecRefs);

  const duplicateResults = useOpenAi
    ? removeDuplicateStories(extraction.stories, existingStories)
    : { stories: extraction.stories, duplicates: [] as DuplicateRecord[] };
  const dependencyAdjustments: DependencyAdjustment[] = [];
  if (useOpenAi) {
    const assigned = assignRepoNativeIds(
      duplicateResults.stories,
      existingStories
    );
    extraction.stories = assigned.stories;
    dependencyAdjustments.push(
      ...remapDependencies(
        extraction.stories,
        existingStories,
        assigned.idMap,
        duplicateResults.duplicates
      )
    );
  } else {
    extraction.stories = duplicateResults.stories;
  }

  const sectionLookup = buildSectionLookup(loadSectionIndex());
  for (const story of extraction.stories) {
    story.spec_refs = enrichSpecRefs(
      story.spec_refs.map((specRef) => specRef.split(" (")[0] ?? specRef),
      sectionLookup
    );
    if (!story.agent) {
      story.agent = {
        packet_path: `agent-packets/generated/${story.id}.packet.md`,
        implementation_skill: "spec-story-implementation",
        review_skill: "spec-story-review"
      };
    }
    validateStory(story, sectionLookup);
  }

  const written = write
    ? writeExtractedStories(extraction.stories, outputDir)
    : [];
  const promptPack = includePromptPack
    ? buildLlmPromptPack(selectedSpecRefs)
    : undefined;

  printJson({
    ok: true,
    profile: profile ?? null,
    provider: useOpenAi ? "openai" : "deterministic",
    model: useOpenAi ? model : null,
    selectedSpecRefs,
    matchedRuleCount: extraction.matchedRules.length,
    matchedRules: extraction.matchedRules,
    stories: extraction.stories.map((story) => ({
      id: story.id,
      title: story.title,
      area: story.area,
      type: story.type,
      priority: story.priority,
      spec_refs: story.spec_refs
    })),
    duplicatesRemoved: duplicateResults.duplicates,
    dependencyAdjustments,
    written,
    llmPromptPack: promptPack
  });
}

void main();
