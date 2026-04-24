import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSectionLookup,
  ensureDirectory,
  extractSectionExcerpt,
  loadSectionIndex,
  loadStory,
  normalizeSpecRef,
  parseArgs,
  printJson,
  relativeToRoot,
  ROOT,
  validateStory,
  writeUtf8
} from "./spec_story_lib.ts";

export function buildPacket(
  storyPath: string,
  allowNonApproved: boolean
): { outputPath: string; storyId: string } {
  const sectionIndex = loadSectionIndex();
  const sectionLookup = buildSectionLookup(sectionIndex);
  const story = loadStory(storyPath);
  validateStory(story, sectionLookup, { requireApproved: !allowNonApproved });

  const outputPath =
    story.agent?.packet_path ?? `agent-packets/generated/${story.id}.packet.md`;
  ensureDirectory(path.posix.dirname(outputPath));

  const excerptBlocks = story.spec_refs.map((rawSpecRef) => {
    const sectionRef = normalizeSpecRef(rawSpecRef);
    const section = sectionLookup.get(sectionRef);
    if (!section) {
      throw new Error(`Missing section for ${rawSpecRef}`);
    }
    return {
      rawSpecRef,
      excerpt: extractSectionExcerpt(section)
    };
  });

  const lines: string[] = [];
  lines.push("---");
  lines.push('spec_version: "v6"');
  lines.push('spec_package_name: "optcg-md-specs-v6"');
  lines.push(`doc_id: "${story.id}-packet"`);
  lines.push(`doc_title: "${story.id} Packet"`);
  lines.push('doc_type: "agent-packet"');
  lines.push(
    `status: "${story.status === "approved" ? "approved" : "generated"}"`
  );
  lines.push("machine_readable: true");
  lines.push("---");
  lines.push("");
  lines.push("# Story Packet");
  lines.push("");
  lines.push("## Story");
  lines.push("");
  lines.push(`Spec Version: ${story.spec_version}`);
  lines.push(`Story Schema Version: ${story.story_schema_version}`);
  lines.push(`ID: ${story.id}`);
  lines.push(`Title: ${story.title}`);
  lines.push(`Type: ${story.type}`);
  lines.push(`Area: ${story.area}`);
  lines.push("");
  lines.push("## Why");
  lines.push(story.summary);
  lines.push("");
  lines.push("## Authoritative Spec References");
  for (const specRef of story.spec_refs) {
    lines.push(`- ${specRef}`);
  }
  lines.push("");
  lines.push("## Relevant Spec Excerpts");
  for (const block of excerptBlocks) {
    lines.push(`### ${block.rawSpecRef}`);
    lines.push(block.excerpt || "_No excerpt content found._");
    lines.push("");
  }
  lines.push("## Scope");
  for (const item of story.scope) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Out of Scope");
  for (const item of story.non_scope) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Constraints");
  for (const item of story.repo_rules) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Required Tests");
  for (const item of story.required_tests) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Expected Output");
  lines.push("- code changes");
  lines.push("- tests");
  lines.push("- brief implementation note");
  lines.push("- explicit assumptions list");
  lines.push("");
  lines.push("## Acceptance Criteria");
  for (const item of story.acceptance_criteria) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");
  lines.push("## Ambiguity Rule");
  lines.push(
    "If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point."
  );
  lines.push("");
  writeUtf8(outputPath, `${lines.join("\n")}\n`);

  return { outputPath, storyId: story.id };
}

export function buildPacketsForStories(
  storyPaths: string[],
  allowNonApproved: boolean
): Array<{ outputPath: string; storyId: string }> {
  return storyPaths.map((storyPath) =>
    buildPacket(storyPath, allowNonApproved)
  );
}

export function buildPacketsForApprovedStories(
  storyIds?: string[]
): Array<{ outputPath: string; storyId: string }> {
  const approvedRoot = path.resolve(ROOT, "stories/approved");
  if (!fs.existsSync(approvedRoot)) {
    return [];
  }

  const explicitIds =
    storyIds && storyIds.length > 0 ? new Set(storyIds) : null;
  const storyPaths = fs
    .readdirSync(approvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".story.yaml"))
    .map((entry) => path.posix.join("stories/approved", entry.name))
    .filter((storyPath) => {
      if (!explicitIds) {
        return true;
      }
      const story = loadStory(storyPath);
      return explicitIds.has(story.id);
    })
    .sort((left, right) => left.localeCompare(right));

  return buildPacketsForStories(storyPaths, false);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.get("story");
  if (typeof storyPath !== "string" || !storyPath.trim()) {
    throw new Error(
      "Usage: node --experimental-strip-types tools/build-agent-packet.ts --story <path>"
    );
  }

  const result = buildPacket(
    storyPath,
    Boolean(args.get("allow-non-approved"))
  );
  printJson({
    ok: true,
    storyId: result.storyId,
    outputPath: relativeToRoot(path.resolve(ROOT, result.outputPath))
  });
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
