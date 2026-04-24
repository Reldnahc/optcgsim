import { fileURLToPath } from "node:url";
import {
  buildSectionLookup,
  extractSectionExcerpt,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  normalizeSpecRef,
  parseArgs,
  printJson,
  readUtf8,
  writeUtf8,
  type Story
} from "./spec_story_lib.ts";

interface TranchePlan {
  ok: true;
  selected: Array<{ id: string; title: string }>;
  ready_after?: Array<{
    id: string;
    title: string;
    unmet_story_dependencies?: string[];
  }>;
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

interface StoryAssessment {
  id: string;
  verdict: "complete_enough" | "blocked" | "underspecified" | "overscoped";
  summary: string;
  blocking_questions: string[];
  missing_prerequisites: string[];
  missing_tests: string[];
  ambiguities: string[];
  scope_risks: string[];
  dependency_risks: string[];
}

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
  story_assessments: StoryAssessment[];
  cross_story_holes: CrossStoryHole[];
  bridge_story_candidates: BridgeStoryCandidate[];
}

const DEFAULT_PLAN_PATH = "stories/tranches/tranche-001.json";
const STORY_DIRS = [
  "stories/generated",
  "stories/approved",
  "stories/blocked",
  "stories/done",
  "stories/ambiguities"
] as const;

function createAuditSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "mode",
      "target",
      "summary",
      "story_assessments",
      "cross_story_holes",
      "bridge_story_candidates"
    ],
    properties: {
      mode: { type: "string", enum: ["story-audit"] },
      target: {
        type: "object",
        additionalProperties: false,
        required: ["plan_path", "story_ids"],
        properties: {
          plan_path: { type: ["string", "null"] },
          story_ids: {
            type: "array",
            minItems: 1,
            items: { type: "string", pattern: "^[A-Z]{2,}-\\d{3,}$" }
          }
        }
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["overall_verdict", "summary"],
        properties: {
          overall_verdict: {
            type: "string",
            enum: ["usable", "needs_revision", "blocked"]
          },
          summary: { type: "string", minLength: 1 }
        }
      },
      story_assessments: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "verdict",
            "summary",
            "blocking_questions",
            "missing_prerequisites",
            "missing_tests",
            "ambiguities",
            "scope_risks",
            "dependency_risks"
          ],
          properties: {
            id: { type: "string", pattern: "^[A-Z]{2,}-\\d{3,}$" },
            verdict: {
              type: "string",
              enum: [
                "complete_enough",
                "blocked",
                "underspecified",
                "overscoped"
              ]
            },
            summary: { type: "string", minLength: 1 },
            blocking_questions: { type: "array", items: { type: "string" } },
            missing_prerequisites: { type: "array", items: { type: "string" } },
            missing_tests: { type: "array", items: { type: "string" } },
            ambiguities: { type: "array", items: { type: "string" } },
            scope_risks: { type: "array", items: { type: "string" } },
            dependency_risks: { type: "array", items: { type: "string" } }
          }
        }
      },
      cross_story_holes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "reason",
            "affected_story_ids",
            "suggested_spec_refs"
          ],
          properties: {
            title: { type: "string", minLength: 1 },
            reason: { type: "string", minLength: 1 },
            affected_story_ids: {
              type: "array",
              items: { type: "string", pattern: "^[A-Z]{2,}-\\d{3,}$" }
            },
            suggested_spec_refs: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      },
      bridge_story_candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "depends_on", "spec_refs"],
          properties: {
            title: { type: "string", minLength: 1 },
            summary: { type: "string", minLength: 1 },
            depends_on: {
              type: "array",
              items: { type: "string", pattern: "^[A-Z]{2,}-\\d{3,}$" }
            },
            spec_refs: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      }
    }
  };
}

function buildResponseTextFormat(): OpenAiResponsesTextFormat {
  return {
    type: "json_schema",
    name: "story_audit",
    strict: true,
    schema: createAuditSchema()
  };
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

function loadStoryIndex(): Map<string, { path: string; story: Story }> {
  const files = [
    ...new Set(STORY_DIRS.flatMap((directory) => listStoryFiles(directory)))
  ];
  return new Map(
    files.map((filePath) => {
      const story = loadStory(filePath);
      return [story.id, { path: filePath, story }];
    })
  );
}

function parseIds(rawValue: string): string[] {
  return [
    ...new Set(
      rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function loadPlan(planPath: string): TranchePlan {
  return JSON.parse(readUtf8(planPath)) as TranchePlan;
}

function resolveTargetIds(args: Map<string, string | boolean>): {
  planPath: string | null;
  ids: string[];
  adjacentReadyAfter: Array<{
    id: string;
    title: string;
    unmet_story_dependencies?: string[];
  }>;
} {
  const rawIds =
    typeof args.get("ids") === "string" ? String(args.get("ids")) : "";
  if (rawIds) {
    return {
      planPath: null,
      ids: parseIds(rawIds),
      adjacentReadyAfter: []
    };
  }

  const planPath =
    typeof args.get("plan") === "string"
      ? String(args.get("plan"))
      : DEFAULT_PLAN_PATH;
  const plan = loadPlan(planPath);
  return {
    planPath,
    ids: plan.selected.map((entry) => entry.id),
    adjacentReadyAfter: plan.ready_after ?? []
  };
}

function dependencySummary(
  story: Story,
  storyIndex: Map<string, { path: string; story: Story }>
): string[] {
  return story.dependencies.map((dependency) => {
    const linked = storyIndex.get(dependency);
    if (linked) {
      return `${dependency} | status=${linked.story.status} | ${linked.story.title}`;
    }
    return dependency;
  });
}

function buildPrompt(
  targetStories: Array<{ path: string; story: Story }>,
  storyIndex: Map<string, { path: string; story: Story }>,
  adjacentReadyAfter: Array<{
    id: string;
    title: string;
    unmet_story_dependencies?: string[];
  }>
): string {
  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const uniqueSpecRefs = [
    ...new Set(
      targetStories.flatMap((entry) =>
        entry.story.spec_refs.map((specRef) => normalizeSpecRef(specRef))
      )
    )
  ].sort();
  const excerptBlocks = uniqueSpecRefs.map((specRef) => {
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

  const storyBlocks = targetStories.map(({ path, story }) => {
    return [
      `STORY ${story.id}`,
      `PATH ${path}`,
      `TITLE ${story.title}`,
      `TYPE ${story.type}`,
      `AREA ${story.area}`,
      `PRIORITY ${story.priority}`,
      `SUMMARY ${story.summary}`,
      `SPEC REFS`,
      ...story.spec_refs.map((specRef) => `- ${specRef}`),
      `SCOPE`,
      ...story.scope.map((item) => `- ${item}`),
      `NON-SCOPE`,
      ...story.non_scope.map((item) => `- ${item}`),
      `DEPENDENCIES`,
      ...dependencySummary(story, storyIndex).map((item) => `- ${item}`),
      `ACCEPTANCE`,
      ...story.acceptance_criteria.map((item) => `- ${item}`),
      `REQUIRED TESTS`,
      ...story.required_tests.map((item) => `- ${item}`),
      `REPO RULES`,
      ...story.repo_rules.map((item) => `- ${item}`)
    ].join("\n");
  });

  const adjacentBlock =
    adjacentReadyAfter.length === 0
      ? "No adjacent ready-after stories were provided."
      : adjacentReadyAfter
          .slice(0, 25)
          .map((entry) => {
            const unmet = entry.unmet_story_dependencies?.length
              ? ` | unmet: ${entry.unmet_story_dependencies.join(", ")}`
              : "";
            return `- ${entry.id}: ${entry.title}${unmet}`;
          })
          .join("\n");

  return [
    "Audit the following OPTCG story tranche for holes, blockers, and missing bridge work.",
    "",
    "Authority rules:",
    "1. Cited spec sections are authoritative.",
    "2. Do not invent gameplay or platform behavior.",
    "3. If a story depends on missing prerequisites, ambiguous contracts, or omitted tests, call that out explicitly.",
    "4. Prefer concrete blocker questions over vague concerns.",
    "5. Only propose bridge stories when there is a real uncovered obligation between the current stories.",
    "",
    "Audit goals:",
    "- decide whether each story is complete enough to approve, blocked, underspecified, or overscoped",
    "- identify missing prerequisites, missing tests, ambiguity points, and dependency risks",
    "- identify cross-story holes in the tranche",
    "- propose bridge story candidates only when needed",
    "",
    "Adjacent backlog context (selected tranche neighbors that are not yet ready):",
    adjacentBlock,
    "",
    "Target stories:",
    ...storyBlocks,
    "",
    "Authoritative spec excerpts:",
    ...excerptBlocks
  ].join("\n\n");
}

async function auditWithOpenAi(params: {
  model: string;
  apiKey?: string;
  targetIds: string[];
  planPath: string | null;
  targetStories: Array<{ path: string; story: Story }>;
  storyIndex: Map<string, { path: string; story: Story }>;
  adjacentReadyAfter: Array<{
    id: string;
    title: string;
    unmet_story_dependencies?: string[];
  }>;
}): Promise<StoryAuditReport> {
  const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the environment.");
  }

  const prompt = buildPrompt(
    params.targetStories,
    params.storyIndex,
    params.adjacentReadyAfter
  );
  const requestBody = {
    model: params.model,
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
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Responses API error (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as OpenAiResponsePayload;
  const parsed = JSON.parse(getResponseText(payload)) as StoryAuditReport;
  if (
    !Array.isArray(parsed.story_assessments) ||
    parsed.story_assessments.length === 0
  ) {
    throw new Error("Audit output did not contain story assessments.");
  }

  return parsed;
}

function defaultOutputPath(
  planPath: string | null,
  targetIds: string[]
): string {
  if (planPath) {
    const base =
      planPath
        .split("/")
        .pop()
        ?.replace(/\.json$/i, "") ?? "tranche";
    return `stories/audits/${base}.audit.json`;
  }
  const base = targetIds.join("-").toLowerCase();
  return `stories/audits/${base}.audit.json`;
}

function printSummary(
  report: StoryAuditReport,
  outputPath: string | null
): void {
  const lines: string[] = [];
  lines.push(`Audit verdict: ${report.summary.overall_verdict}`);
  lines.push(report.summary.summary);
  lines.push("");
  lines.push("Story assessments:");
  for (const assessment of report.story_assessments) {
    lines.push(
      `- ${assessment.id}: ${assessment.verdict} - ${assessment.summary}`
    );
    for (const question of assessment.blocking_questions.slice(0, 3)) {
      lines.push(`  question: ${question}`);
    }
  }
  if (report.cross_story_holes.length > 0) {
    lines.push("");
    lines.push("Cross-story holes:");
    for (const hole of report.cross_story_holes) {
      lines.push(`- ${hole.title}: ${hole.reason}`);
    }
  }
  if (report.bridge_story_candidates.length > 0) {
    lines.push("");
    lines.push("Bridge story candidates:");
    for (const bridge of report.bridge_story_candidates) {
      lines.push(`- ${bridge.title}: ${bridge.summary}`);
    }
  }
  if (outputPath) {
    lines.push("");
    lines.push(`Audit written to ${outputPath}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { planPath, ids, adjacentReadyAfter } = resolveTargetIds(args);
  const model =
    typeof args.get("model") === "string"
      ? String(args.get("model"))
      : "gpt-5.2";
  const outputPath =
    typeof args.get("output") === "string"
      ? String(args.get("output"))
      : defaultOutputPath(planPath, ids);
  const storyIndex = loadStoryIndex();
  const targetStories = ids.map((id) => {
    const entry = storyIndex.get(id);
    if (!entry) {
      throw new Error(`Could not find story ${id} in repo story directories.`);
    }
    return entry;
  });

  const report = await auditWithOpenAi({
    model,
    targetIds: ids,
    planPath,
    targetStories,
    storyIndex,
    adjacentReadyAfter
  });

  if (!args.get("no-write")) {
    writeUtf8(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (args.get("json")) {
    printJson(report);
    return;
  }

  printSummary(report, args.get("no-write") ? null : outputPath);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  void main();
}
