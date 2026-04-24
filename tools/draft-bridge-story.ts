import { fileURLToPath } from "node:url";
import fs from "node:fs";
import {
  buildSectionLookup,
  enrichSpecRefs,
  extractSectionExcerpt,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  normalizeSpecRef,
  parseArgs,
  printJson,
  storyToYaml,
  validateStory,
  writeUtf8,
  type AmbiguityPolicy,
  type Story,
  type StoryArea,
  type StoryPriority,
  type StoryType
} from "./spec_story_lib.ts";
import { chooseIdPrefix } from "./story_id_policy.ts";

interface CrossStoryHole {
  title: string;
  reason: string;
  affected_story_ids: string[];
  suggested_spec_refs: string[];
}

interface BridgeStoryCandidate {
  title: string;
  summary: string;
  depends_on: string[];
  spec_refs: string[];
}

interface StoryAuditReport {
  mode: "story-audit";
  target: {
    plan_path: string | null;
    story_ids: string[];
  };
  summary: {
    overall_verdict: "usable" | "needs_revision" | "blocked";
    summary: string;
  };
  cross_story_holes: CrossStoryHole[];
  bridge_story_candidates: BridgeStoryCandidate[];
}

interface OpenAiResponsesTextFormat {
  type: "json_schema";
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

interface OpenAiResponsePayload {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

interface BridgeStoryDraft {
  title: string;
  type: StoryType;
  area: StoryArea;
  priority: StoryPriority;
  summary: string;
  spec_refs: string[];
  scope: string[];
  non_scope: string[];
  dependencies: string[];
  acceptance_criteria: string[];
  required_tests: string[];
  repo_rules: string[];
  ambiguity_policy: AmbiguityPolicy;
}

function loadAuditReport(auditPath: string): StoryAuditReport {
  return JSON.parse(fs.readFileSync(auditPath, "utf8")) as StoryAuditReport;
}

function loadStoryIndex(): Map<string, { path: string; story: Story }> {
  const files = [
    ...listStoryFiles("stories/generated"),
    ...listStoryFiles("stories/approved"),
    ...listStoryFiles("stories/blocked"),
    ...listStoryFiles("stories/done")
  ];
  return new Map(
    files.map((filePath) => {
      const story = loadStory(filePath);
      return [story.id, { path: filePath, story }];
    })
  );
}

function nextStoryId(
  prefix: string,
  storyIndex: Map<string, { path: string; story: Story }>
): string {
  let next = 1;
  const matcher = new RegExp(`^${prefix}-(\\d{3,})$`);
  for (const { story } of storyIndex.values()) {
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

function getResponseText(response: OpenAiResponsePayload): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  const text = parts.join("").trim();
  if (!text) {
    throw new Error(
      response.error?.message ?? "OpenAI response did not include output text."
    );
  }
  return text;
}

function createDraftSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "type",
      "area",
      "priority",
      "summary",
      "spec_refs",
      "scope",
      "non_scope",
      "dependencies",
      "acceptance_criteria",
      "required_tests",
      "repo_rules",
      "ambiguity_policy"
    ],
    properties: {
      title: { type: "string", minLength: 1 },
      type: {
        type: "string",
        enum: [
          "implementation",
          "tooling",
          "verification",
          "design",
          "refactor",
          "ambiguity"
        ]
      },
      area: {
        type: "string",
        enum: [
          "contracts",
          "engine",
          "cards",
          "server",
          "client",
          "replay",
          "database",
          "infra",
          "docs",
          "security"
        ]
      },
      priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
      summary: { type: "string", minLength: 1 },
      spec_refs: {
        type: "array",
        minItems: 1,
        items: { type: "string", pattern: "^[A-Za-z0-9_-]+\\.s\\d{3}$" }
      },
      scope: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 }
      },
      non_scope: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 }
      },
      dependencies: {
        type: "array",
        items: { type: "string", pattern: "^[A-Z]{2,}-\\d{3,}$" }
      },
      acceptance_criteria: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 }
      },
      required_tests: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 }
      },
      repo_rules: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 }
      },
      ambiguity_policy: {
        type: "string",
        enum: ["fail_and_escalate", "implement_if_clearly_implied"]
      }
    }
  };
}

function buildResponseTextFormat(): OpenAiResponsesTextFormat {
  return {
    type: "json_schema",
    name: "bridge_story_draft",
    strict: true,
    schema: createDraftSchema()
  };
}

function summarizeStory(entry: { path: string; story: Story }): string {
  const { path, story } = entry;
  return [
    `STORY ${story.id}`,
    `PATH ${path}`,
    `TITLE ${story.title}`,
    `TYPE ${story.type}`,
    `AREA ${story.area}`,
    `PRIORITY ${story.priority}`,
    `STATUS ${story.status}`,
    `SUMMARY ${story.summary}`,
    "SPEC REFS",
    ...story.spec_refs.map((item) => `- ${item}`),
    "SCOPE",
    ...story.scope.map((item) => `- ${item}`),
    "NON-SCOPE",
    ...story.non_scope.map((item) => `- ${item}`),
    "DEPENDENCIES",
    ...story.dependencies.map((item) => `- ${item}`),
    "ACCEPTANCE",
    ...story.acceptance_criteria.map((item) => `- ${item}`),
    "REQUIRED TESTS",
    ...story.required_tests.map((item) => `- ${item}`)
  ].join("\n");
}

function uniqueSpecRefs(
  hole: CrossStoryHole,
  candidate: BridgeStoryCandidate | null,
  affectedStories: Array<{ path: string; story: Story }>
): string[] {
  return [
    ...new Set([
      ...hole.suggested_spec_refs,
      ...(candidate?.spec_refs ?? []),
      ...affectedStories.flatMap((entry) =>
        entry.story.spec_refs.map((item) => normalizeSpecRef(item))
      )
    ])
  ].sort();
}

function buildPrompt(params: {
  audit: StoryAuditReport;
  hole: CrossStoryHole;
  candidate: BridgeStoryCandidate | null;
  affectedStories: Array<{ path: string; story: Story }>;
  storyIndex: Map<string, { path: string; story: Story }>;
}): string {
  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const specRefs = uniqueSpecRefs(
    params.hole,
    params.candidate,
    params.affectedStories
  );
  const excerptBlocks = specRefs.map((specRef) => {
    const section = sectionLookup.get(specRef);
    if (!section) {
      throw new Error(`Missing section ref in section-index.json: ${specRef}`);
    }
    return [
      `SECTION ${specRef} (${section.heading})`,
      `PATH ${section.path}`,
      extractSectionExcerpt(section)
    ].join("\n");
  });

  const affectedBlocks = params.affectedStories.map((entry) =>
    summarizeStory(entry)
  );
  const candidateBlock = params.candidate
    ? [
        `TITLE ${params.candidate.title}`,
        `SUMMARY ${params.candidate.summary}`,
        "DEPENDS ON",
        ...params.candidate.depends_on.map((item) => `- ${item}`),
        "SPEC REFS",
        ...params.candidate.spec_refs.map((item) => `- ${item}`)
      ].join("\n")
    : "No existing bridge candidate was selected. Draft a new bridge story from the hole context.";

  const existingIndex = [
    ...new Set([
      ...params.hole.affected_story_ids,
      ...(params.candidate?.depends_on ?? [])
    ])
  ]
    .map((id) => params.storyIndex.get(id)?.story)
    .filter((story): story is Story => Boolean(story))
    .map(
      (story) => `${story.id} | ${story.area} | ${story.type} | ${story.title}`
    )
    .join("\n");

  return [
    "Draft exactly one bridge story to close an audited backlog hole in the OPTCG spec-driven workflow.",
    "",
    "Authority rules:",
    "1. Cited specification sections are authoritative.",
    "2. Do not invent gameplay, protocol, visibility, replay, fairness, timer, or persistence behavior.",
    "3. Stay narrowly scoped: the bridge story should close the specific hole and unblock dependent stories, not absorb downstream work.",
    "4. Preserve explicit non-scope and ask for clarification via fail_and_escalate if the hole cannot be safely closed without new spec authority.",
    "5. Dependencies may reference only existing repo story IDs listed below.",
    "",
    "Output rules:",
    "- Draft one implementation or tooling story unless the hole is truly unresolved ambiguity.",
    "- Use exact section refs from the provided excerpts.",
    "- Include targeted required tests that prove the hole is closed.",
    "- Keep scope tight enough that an implementation agent can finish it without inventing behavior.",
    "",
    `Audit verdict: ${params.audit.summary.overall_verdict}`,
    `Audit summary: ${params.audit.summary.summary}`,
    "",
    "Target hole:",
    `TITLE ${params.hole.title}`,
    `REASON ${params.hole.reason}`,
    "AFFECTED STORIES",
    ...params.hole.affected_story_ids.map((item) => `- ${item}`),
    "SUGGESTED SPEC REFS",
    ...params.hole.suggested_spec_refs.map((item) => `- ${item}`),
    "",
    "Existing bridge candidate:",
    candidateBlock,
    "",
    "Relevant existing story index:",
    existingIndex || "None",
    "",
    "Affected story details:",
    ...affectedBlocks,
    "",
    "Authoritative spec excerpts:",
    ...excerptBlocks
  ].join("\n\n");
}

async function draftWithOpenAi(
  model: string,
  prompt: string,
  apiKey?: string
): Promise<BridgeStoryDraft> {
  const resolvedApiKey = apiKey ?? process.env.OPENAI_API_KEY;
  if (!resolvedApiKey) {
    throw new Error("OPENAI_API_KEY is not set in the environment.");
  }

  const requestBody = {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt
          }
        ]
      }
    ],
    text: {
      format: buildResponseTextFormat()
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolvedApiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Responses API error (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as OpenAiResponsePayload;
  return JSON.parse(getResponseText(payload)) as BridgeStoryDraft;
}

function materializeStory(
  draft: BridgeStoryDraft,
  storyIndex: Map<string, { path: string; story: Story }>
): Story {
  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const provisional: Story = {
    spec_version: "v6",
    spec_package_name: "optcg-md-specs-v6",
    story_schema_version: "1.0.0",
    id: "TMP-000",
    title: draft.title.trim(),
    type: draft.type,
    area: draft.area,
    priority: draft.priority,
    status: "generated",
    summary: draft.summary.trim(),
    spec_refs: enrichSpecRefs(
      draft.spec_refs.map((item) => item.trim()).filter(Boolean),
      sectionLookup
    ),
    scope: draft.scope.map((item) => item.trim()).filter(Boolean),
    non_scope: draft.non_scope.map((item) => item.trim()).filter(Boolean),
    dependencies: [
      ...new Set(draft.dependencies.map((item) => item.trim()).filter(Boolean))
    ],
    acceptance_criteria: draft.acceptance_criteria
      .map((item) => item.trim())
      .filter(Boolean),
    required_tests: draft.required_tests
      .map((item) => item.trim())
      .filter(Boolean),
    repo_rules: draft.repo_rules.map((item) => item.trim()).filter(Boolean),
    ambiguity_policy: draft.ambiguity_policy,
    agent: {
      packet_path: "",
      implementation_skill: "spec-story-implementation",
      review_skill: "spec-story-review"
    }
  };

  const id = nextStoryId(chooseIdPrefix(provisional), storyIndex);
  const story: Story = {
    ...provisional,
    id,
    agent: {
      ...provisional.agent,
      packet_path: `agent-packets/generated/${id}.packet.md`
    }
  };
  validateStory(story, sectionLookup);
  return story;
}

function resolveCandidate(
  hole: CrossStoryHole,
  report: StoryAuditReport,
  candidateIndexRaw: string | boolean | undefined
): BridgeStoryCandidate | null {
  if (typeof candidateIndexRaw === "string") {
    const candidate =
      report.bridge_story_candidates[Number.parseInt(candidateIndexRaw, 10)];
    if (!candidate) {
      throw new Error(
        `No bridge story candidate at index ${candidateIndexRaw}.`
      );
    }
    return candidate;
  }

  const byOverlap = report.bridge_story_candidates.find((candidate) => {
    return candidate.depends_on.some((dependency) =>
      hole.affected_story_ids.includes(dependency)
    );
  });
  return byOverlap ?? null;
}

function resolveHole(
  report: StoryAuditReport,
  holeIndexRaw: string | boolean | undefined,
  candidateIndexRaw: string | boolean | undefined
): { hole: CrossStoryHole; holeIndex: number } {
  if (typeof holeIndexRaw === "string") {
    const holeIndex = Number.parseInt(holeIndexRaw, 10);
    const hole = report.cross_story_holes[holeIndex];
    if (!hole) {
      throw new Error(
        `No cross-story hole at index ${holeIndexRaw} in audit report.`
      );
    }
    return { hole, holeIndex };
  }

  if (typeof candidateIndexRaw === "string") {
    const candidateIndex = Number.parseInt(candidateIndexRaw, 10);
    const candidate = report.bridge_story_candidates[candidateIndex];
    if (!candidate) {
      throw new Error(
        `No bridge story candidate at index ${candidateIndexRaw}.`
      );
    }
    const holeIndex = report.cross_story_holes.findIndex((hole) => {
      return candidate.depends_on.some((dependency) =>
        hole.affected_story_ids.includes(dependency)
      );
    });
    if (holeIndex === -1) {
      throw new Error(
        `Could not infer a cross-story hole for bridge candidate ${candidateIndexRaw}. Pass --hole-index explicitly.`
      );
    }
    return { hole: report.cross_story_holes[holeIndex], holeIndex };
  }

  if (!report.cross_story_holes[0]) {
    throw new Error("Audit report does not contain any cross-story holes.");
  }
  return { hole: report.cross_story_holes[0], holeIndex: 0 };
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const auditPath =
    typeof args.get("from-audit") === "string"
      ? String(args.get("from-audit"))
      : "stories/audits/tranche-001.audit.json";
  const model =
    typeof args.get("model") === "string"
      ? String(args.get("model"))
      : "gpt-5.2";
  const promptOnly = Boolean(args.get("prompt-only"));
  const write = Boolean(args.get("write"));

  const audit = loadAuditReport(auditPath);
  const { hole, holeIndex } = resolveHole(
    audit,
    args.get("hole-index"),
    args.get("candidate-index")
  );

  const storyIndex = loadStoryIndex();
  const affectedStories = hole.affected_story_ids.map((id) => {
    const entry = storyIndex.get(id);
    if (!entry) {
      throw new Error(
        `Could not find affected story ${id} in repo story directories.`
      );
    }
    return entry;
  });
  const candidate = resolveCandidate(hole, audit, args.get("candidate-index"));
  const prompt = buildPrompt({
    audit,
    hole,
    candidate,
    affectedStories,
    storyIndex
  });

  if (promptOnly) {
    printJson({
      ok: true,
      audit_path: auditPath,
      hole_index: holeIndex,
      candidate,
      prompt
    });
    return;
  }

  const draft = await draftWithOpenAi(model, prompt);
  const story = materializeStory(draft, storyIndex);
  const outputPath = `stories/generated/${story.id}.story.yaml`;

  if (write) {
    writeUtf8(outputPath, storyToYaml(story));
  }

  printJson({
    ok: true,
    audit_path: auditPath,
    hole_index: holeIndex,
    candidate,
    model,
    prompt_preview: prompt,
    story,
    path: write ? outputPath : null,
    wrote: write
  });
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  void main();
}
