import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  buildSectionLookup,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  storyToYaml,
  type Story,
  validateStory,
  writeUtf8
} from "./spec_story_lib.ts";
import { chooseIdPrefix } from "./story_id_policy.ts";

const GENERATED_DIR = "stories/generated";

function loadStories(relativeDir: string): Story[] {
  return listStoryFiles(relativeDir).map((filePath) => loadStory(filePath));
}

function updatePacketPath(story: Story, oldId: string, newId: string): void {
  if (!story.agent?.packet_path) {
    return;
  }
  story.agent.packet_path = story.agent.packet_path.replace(oldId, newId);
}

function main(): void {
  const generatedFiles = listStoryFiles(GENERATED_DIR);
  const generatedEntries = generatedFiles.map((filePath) => ({
    filePath,
    oldId: path.basename(filePath, ".story.yaml"),
    story: loadStory(filePath)
  }));
  const nonGeneratedStories = [
    ...loadStories("stories/approved"),
    ...loadStories("stories/blocked"),
    ...loadStories("stories/done"),
    ...loadStories("stories/ambiguities")
  ];

  const highestByPrefix = new Map<string, number>();
  for (const story of [
    ...nonGeneratedStories,
    ...generatedEntries.map((entry) => entry.story)
  ]) {
    const match = story.id.match(/^([A-Z]{2,})-(\d{3,})$/);
    if (!match) {
      continue;
    }
    const [, prefix, rawNumber] = match;
    const number = Number.parseInt(rawNumber, 10);
    const current = highestByPrefix.get(prefix) ?? 0;
    if (number > current) {
      highestByPrefix.set(prefix, number);
    }
  }

  const usedIds = new Set(nonGeneratedStories.map((story) => story.id));
  const idMap = new Map<string, string>();

  for (const entry of [...generatedEntries].sort((left, right) =>
    left.story.id.localeCompare(right.story.id)
  )) {
    const { story } = entry;
    const originalId = story.id;
    const preferredPrefix = chooseIdPrefix(story);
    const alreadyMatches =
      story.id.startsWith(`${preferredPrefix}-`) && !usedIds.has(story.id);
    if (alreadyMatches) {
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

  for (const entry of generatedEntries) {
    const { story } = entry;
    story.dependencies = story.dependencies.map(
      (dependency) => idMap.get(dependency) ?? dependency
    );
    updatePacketPath(story, entry.oldId, story.id);
  }

  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const changes: Array<{
    oldId: string;
    newId: string;
    oldPath: string;
    newPath: string;
  }> = [];

  for (const entry of generatedEntries) {
    const oldPath = entry.filePath;
    const oldId = entry.oldId;
    const newPath = `${GENERATED_DIR}/${entry.story.id}.story.yaml`;
    changes.push({
      oldId,
      newId: entry.story.id,
      oldPath,
      newPath
    });
    validateStory(entry.story, sectionLookup);
    writeUtf8(newPath, storyToYaml(entry.story));
  }

  for (const change of changes) {
    if (change.oldPath === change.newPath) {
      continue;
    }
    const absoluteOldPath = path.resolve(ROOT, change.oldPath);
    if (fs.existsSync(absoluteOldPath)) {
      fs.unlinkSync(absoluteOldPath);
    }
  }

  process.stdout.write(`${JSON.stringify({ ok: true, changes }, null, 2)}\n`);
}

main();
