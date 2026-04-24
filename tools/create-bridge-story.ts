import {
  buildSectionLookup,
  enrichSpecRefs,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  parseArgs,
  printJson,
  storyToYaml,
  validateStory,
  writeUtf8,
  type Story,
  type StoryArea,
  type StoryPriority,
  type StoryType
} from "./spec_story_lib.ts";
import { chooseIdPrefix } from "./story_id_policy.ts";
import fs from "node:fs";

interface BridgeStoryCandidate {
  title: string;
  summary: string;
  depends_on: string[];
  spec_refs: string[];
}

interface StoryAuditReport {
  bridge_story_candidates?: BridgeStoryCandidate[];
}

function loadAllStories(): Story[] {
  return [
    ...listStoryFiles("stories/generated"),
    ...listStoryFiles("stories/approved"),
    ...listStoryFiles("stories/blocked"),
    ...listStoryFiles("stories/done")
  ].map((filePath) => loadStory(filePath));
}

function guessAreaFromDependencies(ids: string[]): StoryArea {
  const stories = new Map(loadAllStories().map((story) => [story.id, story]));
  const counts = new Map<StoryArea, number>();
  for (const id of ids) {
    const story = stories.get(id);
    if (!story) {
      continue;
    }
    counts.set(story.area, (counts.get(story.area) ?? 0) + 1);
  }
  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "engine"
  );
}

function nextStoryId(prefix: string): string {
  const stories = loadAllStories();
  let next = 1;
  const matcher = new RegExp(`^${prefix}-(\\d{3,})$`);
  for (const story of stories) {
    const match = story.id.match(matcher);
    if (!match) {
      continue;
    }
    const numeric = Number.parseInt(match[1], 10);
    if (numeric >= next) {
      next = numeric + 1;
    }
  }
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function readAuditCandidate(
  auditPath: string,
  index: number
): BridgeStoryCandidate {
  const report = JSON.parse(
    fs.readFileSync(auditPath, "utf8")
  ) as StoryAuditReport;
  const candidate = report.bridge_story_candidates?.[index];
  if (!candidate) {
    throw new Error(
      `No bridge story candidate at index ${index} in ${auditPath}`
    );
  }
  return candidate;
}

function defaultRepoRules(area: StoryArea): string[] {
  const rules = [
    "do not invent uncited behavior",
    "stay within cited spec sections and explicit story scope",
    "fail closed and escalate on gameplay, visibility, replay, fairness, timer, or persistence ambiguity"
  ];
  if (["engine", "server", "security", "replay"].includes(area)) {
    rules.push(
      "must preserve hidden-information safety and deterministic behavior"
    );
  }
  return rules;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const auditPath =
    typeof args.get("from-audit") === "string"
      ? String(args.get("from-audit"))
      : "";
  const candidateIndex =
    typeof args.get("index") === "string"
      ? Number.parseInt(String(args.get("index")), 10)
      : 0;

  const title =
    typeof args.get("title") === "string" ? String(args.get("title")) : "";
  const summary =
    typeof args.get("summary") === "string" ? String(args.get("summary")) : "";
  const dependencies =
    typeof args.get("dependencies") === "string"
      ? String(args.get("dependencies"))
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  const specRefs =
    typeof args.get("spec-refs") === "string"
      ? String(args.get("spec-refs"))
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const candidate = auditPath
    ? readAuditCandidate(auditPath, candidateIndex)
    : {
        title,
        summary,
        depends_on: dependencies,
        spec_refs: specRefs
      };

  if (
    !candidate.title?.trim() ||
    !candidate.summary?.trim() ||
    !candidate.spec_refs?.length
  ) {
    throw new Error(
      "Bridge story requires title, summary, and at least one spec ref."
    );
  }

  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const area = guessAreaFromDependencies(candidate.depends_on ?? []);
  const type: StoryType = "implementation";
  const priority: StoryPriority = "high";
  const provisional: Story = {
    spec_version: "v6",
    spec_package_name: "optcg-md-specs-v6",
    story_schema_version: "1.0.0",
    id: "TMP-000",
    title: candidate.title.replace(/^BRIDGE:\s*/i, "").trim(),
    type,
    area,
    priority,
    status: "generated",
    summary: candidate.summary.trim(),
    spec_refs: enrichSpecRefs(
      candidate.spec_refs.map((item) => item.trim()).filter(Boolean),
      sectionLookup
    ),
    scope: [
      candidate.summary.trim(),
      "close the audited dependency hole without expanding into unrelated downstream work"
    ],
    non_scope: [
      "implementing downstream stories beyond the cited bridge obligation",
      "inventing uncited gameplay, protocol, or persistence behavior"
    ],
    dependencies: [
      ...new Set(
        (candidate.depends_on ?? []).map((item) => item.trim()).filter(Boolean)
      )
    ],
    acceptance_criteria: [
      "bridge implementation satisfies the cited spec sections without inventing uncited behavior",
      "dependent stories can proceed without the audited blocker remaining unresolved"
    ],
    required_tests: [
      "add targeted regression tests for the cited bridge behavior",
      "update or add tests that prove the dependent story path is unblocked"
    ],
    repo_rules: defaultRepoRules(area),
    ambiguity_policy: "fail_and_escalate",
    agent: {
      packet_path: "",
      implementation_skill: "spec-story-implementation",
      review_skill: "spec-story-review"
    }
  };

  const id = nextStoryId(chooseIdPrefix(provisional));
  const story: Story = {
    ...provisional,
    id,
    agent: {
      ...provisional.agent,
      packet_path: `agent-packets/generated/${id}.packet.md`
    }
  };
  validateStory(story, sectionLookup);

  const outputPath = `stories/generated/${story.id}.story.yaml`;
  writeUtf8(outputPath, storyToYaml(story));
  printJson({
    ok: true,
    story,
    path: outputPath
  });
}

main();
