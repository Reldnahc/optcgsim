import {
  buildSectionLookup,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  normalizeSpecRef,
  printJson,
  storyToYaml,
  validateStory,
  parseArgs,
  writeUtf8
} from "./spec_story_lib.ts";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const sectionIndex = loadSectionIndex();
  const sectionLookup = buildSectionLookup(sectionIndex);
  const includeApproved = Boolean(args.get("include-approved"));
  const targets = includeApproved
    ? [...new Set([...listStoryFiles("stories/generated"), ...listStoryFiles("stories/approved")])]
    : listStoryFiles("stories/generated");
  const normalized: string[] = [];

  for (const storyPath of targets) {
    const story = loadStory(storyPath);
    story.spec_refs = story.spec_refs.map((specRef) => {
      const sectionRef = normalizeSpecRef(specRef);
      const section = sectionLookup.get(sectionRef);
      if (!section) {
        throw new Error(`Missing section ref ${sectionRef} referenced by ${storyPath}`);
      }
      return `${sectionRef} (${section.heading})`;
    });
    validateStory(story, sectionLookup);
    writeUtf8(storyPath, storyToYaml(story));
    normalized.push(storyPath);
  }

  printJson({
    ok: true,
    normalized
  });
}

main();
