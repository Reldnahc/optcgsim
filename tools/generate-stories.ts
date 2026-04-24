import {
  buildSectionLookup,
  createGeneratedStory,
  ensureDirectory,
  loadSectionIndex,
  parseArgs,
  printJson,
  storyToYaml,
  validateStory,
  writeUtf8
} from "./spec_story_lib.ts";
import { INITIAL_BACKLOG_SEEDS } from "./story-generation.catalog.ts";
import {
  extractStoriesFromSpecRefs,
  resolveSelectedSpecRefs
} from "./spec_story_extractor.ts";

const outputDir = "stories/generated";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const mode =
    typeof args.get("mode") === "string" ? String(args.get("mode")) : "all";
  const profile =
    typeof args.get("profile") === "string"
      ? String(args.get("profile"))
      : "initial-foundation";
  const sectionIndex = loadSectionIndex();
  const sectionLookup = buildSectionLookup(sectionIndex);
  ensureDirectory(outputDir);

  const byId = new Map<string, ReturnType<typeof createGeneratedStory>>();

  if (mode === "catalog" || mode === "all") {
    for (const seed of INITIAL_BACKLOG_SEEDS) {
      const story = createGeneratedStory(seed, sectionLookup);
      byId.set(story.id, story);
    }
  }

  if (mode === "extract" || mode === "all") {
    const selectedSpecRefs = resolveSelectedSpecRefs(profile, []);
    const extraction = extractStoriesFromSpecRefs(selectedSpecRefs);
    for (const story of extraction.stories) {
      byId.set(story.id, story);
    }
  }

  if (mode !== "catalog" && mode !== "extract" && mode !== "all") {
    throw new Error(
      `Unsupported --mode value ${JSON.stringify(mode)}. Use catalog, extract, or all.`
    );
  }

  const written: string[] = [];
  for (const story of [...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    validateStory(story, sectionLookup);
    const outputPath = `${outputDir}/${story.id}.story.yaml`;
    writeUtf8(outputPath, storyToYaml(story));
    written.push(outputPath);
  }

  printJson({
    ok: true,
    outputDir,
    mode,
    profile: mode === "catalog" ? null : profile,
    storiesWritten: written,
    count: written.length
  });
}

main();
