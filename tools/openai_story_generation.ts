import {
  buildSectionLookup,
  loadSectionIndex,
  type Story,
  validateStory
} from "./spec_story_lib.ts";
import { buildLlmPromptPack } from "./spec_story_extractor.ts";

export interface OpenAiGenerationOptions {
  model: string;
  selectedSpecRefs: string[];
  existingStories?: Story[];
  apiKey?: string;
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

function createStoryArraySchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["stories"],
    properties: {
      stories: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "spec_version",
            "spec_package_name",
            "story_schema_version",
            "id",
            "title",
            "type",
            "area",
            "priority",
            "status",
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
            spec_version: { type: "string", enum: ["v6"] },
            spec_package_name: { type: "string", enum: ["optcg-md-specs-v6"] },
            story_schema_version: { type: "string", enum: ["1.0.0"] },
            id: { type: "string", pattern: "^[A-Z]{2,}-\\d{3,}$" },
            title: { type: "string", minLength: 1 },
            type: {
              type: "string",
              enum: [
                "design",
                "implementation",
                "verification",
                "refactor",
                "tooling",
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
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"]
            },
            status: { type: "string", enum: ["generated"] },
            summary: { type: "string", minLength: 1 },
            spec_refs: {
              type: "array",
              minItems: 1,
              items: {
                type: "string",
                pattern: "^[A-Za-z0-9_-]+\\.s\\d{3}( \\(.+\\))?$"
              }
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
              items: { type: "string", minLength: 1 }
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
        }
      }
    }
  };
}

function buildResponseTextFormat(): OpenAiResponsesTextFormat {
  return {
    type: "json_schema",
    name: "story_candidates",
    strict: true,
    schema: createStoryArraySchema()
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

function summarizeExistingStories(existingStories: Story[]): string {
  if (existingStories.length === 0) {
    return "No existing backlog stories were provided.";
  }

  return existingStories
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((story) => {
      const specRefs = story.spec_refs.slice(0, 4).join(", ");
      return `${story.id} | ${story.area} | ${story.type} | ${story.title} | refs: ${specRefs}`;
    })
    .join("\n");
}

export async function generateStoriesWithOpenAi(
  options: OpenAiGenerationOptions
): Promise<{
  stories: Story[];
  model: string;
  promptPreview: string;
}> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the environment.");
  }

  const promptPack = buildLlmPromptPack(options.selectedSpecRefs);
  const backlogSummary = summarizeExistingStories(
    options.existingStories ?? []
  );
  const requestBody = {
    model: options.model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              promptPack.prompt,
              "",
              "Dependency rules:",
              "- Dependencies may reference only existing backlog story IDs listed below or other IDs you define in the same response.",
              "- Do not emit placeholder IDs such as STORY-0001.",
              "- If a dependency is uncertain, omit it instead of guessing.",
              "- Prefer refining or replacing existing backlog slices over duplicating them.",
              "",
              "Existing backlog story index:",
              backlogSummary,
              "",
              "Source section excerpts:",
              ...promptPack.sourceSections.map((section) => {
                return [
                  `SECTION ${section.specRef} (${section.heading})`,
                  `PATH ${section.path}`,
                  section.excerpt
                ].join("\n");
              })
            ].join("\n\n")
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
  const text = getResponseText(payload);
  const parsed = JSON.parse(text) as { stories?: Story[] };
  if (!Array.isArray(parsed.stories) || parsed.stories.length === 0) {
    throw new Error("OpenAI output did not contain a non-empty stories array.");
  }

  const sectionLookup = buildSectionLookup(loadSectionIndex());
  for (const story of parsed.stories) {
    validateStory(story, sectionLookup);
  }

  return {
    stories: parsed.stories,
    model: options.model,
    promptPreview: promptPack.prompt
  };
}
