import {
  buildSectionLookup,
  createGeneratedStory,
  ensureDirectory,
  loadSectionIndex,
  printJson,
  storyToYaml,
  validateStory,
  writeUtf8
} from "./spec_story_lib.ts";
import { INITIAL_BACKLOG_SEEDS } from "./story-generation.catalog.ts";

const outputDir = "stories/generated";

function main(): void {
  const sectionIndex = loadSectionIndex();
  const sectionLookup = buildSectionLookup(sectionIndex);
  ensureDirectory(outputDir);

  const written: string[] = [];
  for (const seed of INITIAL_BACKLOG_SEEDS) {
    const story = createGeneratedStory(seed, sectionLookup);
    validateStory(story, sectionLookup);
    const outputPath = `${outputDir}/${story.id}.story.yaml`;
    writeUtf8(outputPath, storyToYaml(story));
    written.push(outputPath);
  }

  printJson({
    ok: true,
    outputDir,
    storiesWritten: written,
    count: written.length
  });
}

main();
