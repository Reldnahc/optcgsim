import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Story } from "./spec_story_lib.ts";
import {
  ROOT,
  buildSectionLookup,
  listStoryFiles,
  loadSectionIndex,
  loadStory,
  normalizeSpecRef,
  parseArgs,
  printJson,
  relativeToRoot,
  validateStory
} from "./spec_story_lib.ts";

const DEFAULT_SYNC_DIR = "stories/.sync";
const DEFAULT_CONFIG_PATH = "tools/github-board.config.example.json";
const DEFAULT_STORIES_ROOT = "stories/approved";

const DEFAULT_PROJECT_FIELD_MAPPING = {
  Status: {
    source: "status",
    option_map: {
      generated: "Backlog",
      approved: "Todo",
      in_progress: "In Progress",
      in_review: "In Review",
      changes_requested: "Changes Requested",
      blocked: "Blocked",
      done: "Done",
      replaced: "Canceled"
    }
  },
  Priority: { source: "priority" },
  Area: { source: "area" },
  Type: { source: "type" },
  "Spec Version": { source: "spec_version" },
  "Story ID": { source: "id" },
  Estimate: { source: "board.estimate" },
  Iteration: { source: "board.iteration" }
} as const;

const DEFAULT_LABEL_COLORS: Record<string, string> = {
  type: "8a8a8a",
  area: "1d76db",
  priority: "fbca04",
  status: "0e8a16",
  risk: "5319e7",
  needs: "b60205"
};

const DEFAULT_LABEL_DESCRIPTIONS: Record<string, string> = {
  type: "Spec story dimension",
  area: "Spec subsystem dimension",
  priority: "Delivery priority",
  status: "Story execution status",
  risk: "Review or platform risk marker",
  needs: "Workflow attention marker"
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface SyncStoriesOptions {
  configPath?: string;
  syncDir?: string;
  storyPaths?: string[];
  dryRun?: boolean;
  writePreview?: boolean;
}

interface ResolvedSpecRef {
  raw: string;
  section_ref: string;
  doc_id: string;
  path: string;
  heading: string;
  level: number;
}

interface SyncMetadata extends JsonObject {
  story_id?: string;
  issue_number?: number;
  issue_url?: string;
  issue_node_id?: string;
  branch_name?: string;
  branch_base?: string;
  branch_pushed?: boolean;
  pr_number?: number;
  pr_url?: string;
  pr_title?: string;
  pr_state?: string;
  pr_draft?: boolean;
  pr_head_ref?: string;
  pr_base_ref?: string;
  _metadata_path?: string;
}

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

class StorySyncError extends Error {}
class GitHubSyncError extends StorySyncError {}

function resolveCommand(command: string): string {
  if (command !== "gh") {
    return command;
  }

  const candidates = [
    "gh",
    "gh.exe",
    path.join(process.env.ProgramFiles ?? "", "GitHub CLI", "gh.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "GitHub CLI", "gh.exe")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], {
      cwd: ROOT,
      encoding: "utf8"
    });
    if ((probe.status ?? 1) === 0) {
      return candidate;
    }
  }

  return command;
}

function runCommand(
  args: string[],
  cwd = ROOT,
  stdinText?: string
): CommandResult {
  const executable = resolveCommand(args[0]);
  const result = spawnSync(executable, args.slice(1), {
    cwd,
    input: stdinText,
    encoding: "utf8"
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function ensureGhAvailable(): void {
  const result = runCommand(["gh", "--version"]);
  if (result.status !== 0) {
    throw new GitHubSyncError(
      "GitHub CLI (`gh`) is required for live sync mode."
    );
  }
}

function ghApiJson(args: string[], stdinText?: string): JsonObject {
  const result = runCommand(["gh", ...args], ROOT, stdinText);
  if (result.status !== 0) {
    throw new GitHubSyncError(
      `GitHub CLI command failed:\n${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
  }
  return result.stdout.trim() ? (JSON.parse(result.stdout) as JsonObject) : {};
}

function loadConfig(configPath?: string): JsonObject {
  if (!configPath) {
    return {};
  }
  const absolutePath = path.resolve(ROOT, configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new StorySyncError(`Config file not found: ${configPath}`);
  }
  const data = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as Json;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new StorySyncError(
      `Config file must contain a top-level object: ${configPath}`
    );
  }
  return data as JsonObject;
}

function computeSha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function storySyncMetadataPath(syncDir: string, storyId: string): string {
  return path.resolve(ROOT, syncDir, `${storyId}.github.json`);
}

function titleCaseSlug(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractSpecRefLabel(specRef: string): string | undefined {
  const start = specRef.indexOf(" (");
  if (start === -1 || !specRef.endsWith(")")) {
    return undefined;
  }
  return specRef.slice(start + 2, -1).trim() || undefined;
}

function resolveSpecRefs(
  story: Story,
  sectionLookup: ReturnType<typeof buildSectionLookup>
): ResolvedSpecRef[] {
  const resolved: ResolvedSpecRef[] = [];
  const missing: string[] = [];
  const staleLabels: string[] = [];
  for (const raw of story.spec_refs) {
    const sectionRef = normalizeSpecRef(raw);
    const section = sectionLookup.get(sectionRef);
    if (!section) {
      missing.push(raw);
      continue;
    }
    const suppliedLabel = extractSpecRefLabel(raw);
    if (suppliedLabel && suppliedLabel !== section.heading) {
      staleLabels.push(
        `${raw} -> actual heading is ${JSON.stringify(section.heading)}`
      );
    }
    resolved.push({
      raw,
      section_ref: sectionRef,
      doc_id: section.doc_id,
      path: section.path,
      heading: section.heading,
      level: section.level
    });
  }
  if (missing.length > 0) {
    throw new StorySyncError(
      `Story references missing section refs: ${missing.join(", ")}`
    );
  }
  if (staleLabels.length > 0) {
    throw new StorySyncError(
      `Story references use stale or incorrect heading labels\n- ${staleLabels.join("\n- ")}`
    );
  }
  return resolved;
}

function buildIssueTitle(story: Story): string {
  return `[${story.id}] ${story.title}`;
}

function labelSetForStory(
  story: Story,
  includeStatus: boolean,
  defaults: string[]
): string[] {
  const labels = [
    ...defaults.filter(Boolean),
    `type:${story.type}`,
    `area:${story.area}`,
    `priority:${story.priority}`
  ];
  if (includeStatus) {
    labels.push(`status:${story.status}`);
  }
  for (const label of story.board?.labels ?? []) {
    const text = String(label).trim();
    if (text) {
      labels.push(text);
    }
  }
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    if (!seen.has(label)) {
      seen.add(label);
      ordered.push(label);
    }
  }
  return ordered;
}

function loadSyncIndex(syncDir: string): Map<string, SyncMetadata> {
  const index = new Map<string, SyncMetadata>();
  const absoluteDir = path.resolve(ROOT, syncDir);
  if (!fs.existsSync(absoluteDir)) {
    return index;
  }
  const walk = (dirPath: string): void => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".github.json")) {
        continue;
      }
      try {
        const payload = JSON.parse(
          fs.readFileSync(entryPath, "utf8")
        ) as SyncMetadata;
        if (typeof payload.story_id === "string" && payload.story_id) {
          payload._metadata_path = relativeToRoot(entryPath);
          index.set(payload.story_id, payload);
        }
      } catch {
        // ignore malformed metadata files in index construction
      }
    }
  };
  walk(absoluteDir);
  return index;
}

function renderDependencies(
  dependencies: string[],
  syncIndex: Map<string, SyncMetadata>
): string[] {
  const rendered: string[] = [];
  for (const dependency of dependencies) {
    const metadata = syncIndex.get(dependency);
    if (typeof metadata?.issue_number === "number") {
      rendered.push(`- ${dependency} (#${metadata.issue_number})`);
      continue;
    }
    if (typeof metadata?.issue_url === "string" && metadata.issue_url) {
      rendered.push(`- ${dependency} (${metadata.issue_url})`);
      continue;
    }
    rendered.push(`- ${dependency}`);
  }
  return rendered.length > 0 ? rendered : ["- none"];
}

function renderIssueBody(
  story: Story,
  storyPath: string,
  resolvedSpecRefs: ResolvedSpecRef[],
  syncIndex: Map<string, SyncMetadata>,
  syncMetadataRelPath: string
): string {
  const lines: string[] = [];
  lines.push(
    "<!-- Generated by tools/spec_board_sync.ts from the approved story file. -->"
  );
  lines.push("");
  lines.push(
    "_This issue is a synchronized projection of the approved story. Edit the story file, then rerun the sync tool instead of hand-editing authoritative sections here._"
  );
  lines.push("");
  lines.push("## Summary");
  lines.push(story.summary.trim());
  lines.push("");
  lines.push(`**Story ID:** \`${story.id}\`  `);
  lines.push(`**Spec Version:** \`${story.spec_version}\`  `);
  lines.push(`**Type:** \`${story.type}\`  `);
  lines.push(`**Area:** \`${story.area}\`  `);
  lines.push(`**Priority:** \`${story.priority}\`  `);
  lines.push(`**Status:** \`${story.status}\``);
  lines.push("");
  lines.push("## Authoritative Spec References");
  for (const ref of resolvedSpecRefs) {
    lines.push(`- ${ref.section_ref}${ref.heading ? ` (${ref.heading})` : ""}`);
  }
  lines.push("");
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
  lines.push("## Dependencies");
  lines.push(...renderDependencies(story.dependencies, syncIndex));
  lines.push("");
  lines.push("## Acceptance Criteria");
  for (const item of story.acceptance_criteria) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");
  lines.push("## Required Tests");
  for (const item of story.required_tests) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Repo Rules");
  for (const item of story.repo_rules) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Ambiguity Policy");
  lines.push(story.ambiguity_policy);
  lines.push("");
  lines.push("## Packet / implementation links");
  lines.push(`- story file: \`${storyPath}\``);
  if (story.agent?.packet_path) {
    lines.push(`- packet: \`${story.agent.packet_path}\``);
  }
  if (story.agent?.implementation_skill) {
    lines.push(
      `- implementation skill: \`${story.agent.implementation_skill}\``
    );
  }
  if (story.agent?.review_skill) {
    lines.push(`- review skill: \`${story.agent.review_skill}\``);
  }
  lines.push(`- sync metadata: \`${syncMetadataRelPath}\``);
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}

function writeTempJsonFile(payload: JsonObject): string {
  const tempPath = path.join(
    os.tmpdir(),
    `story-sync-${crypto.randomUUID()}.json`
  );
  fs.writeFileSync(tempPath, JSON.stringify(payload), "utf8");
  return tempPath;
}

function ensureLabelsExist(
  repo: string,
  labels: string[],
  config: JsonObject
): void {
  const labelsConfig = (config.labels as JsonObject | undefined) ?? {};
  if (!labelsConfig.ensure) {
    return;
  }
  const colors = {
    ...DEFAULT_LABEL_COLORS,
    ...(((labelsConfig.colors as JsonObject | undefined) ?? {}) as Record<
      string,
      string
    >)
  };
  const descriptions = ((labelsConfig.descriptions as JsonObject | undefined) ??
    {}) as Record<string, string>;
  for (const label of labels) {
    const encodedLabel = label.replaceAll("/", "%2F");
    const getResult = runCommand([
      "gh",
      "api",
      `repos/${repo}/labels/${encodedLabel}`
    ]);
    if (getResult.status === 0) {
      continue;
    }
    const family = label.includes(":") ? label.split(":", 1)[0] : "type";
    const color = colors[family] ?? "8a8a8a";
    const description =
      descriptions[label] ??
      DEFAULT_LABEL_DESCRIPTIONS[family] ??
      "Spec workflow label";
    const createResult = runCommand([
      "gh",
      "api",
      `repos/${repo}/labels`,
      "--method",
      "POST",
      "-f",
      `name=${label}`,
      "-f",
      `color=${color}`,
      "-f",
      `description=${description}`
    ]);
    if (
      createResult.status !== 0 &&
      !createResult.stderr.includes("already_exists")
    ) {
      throw new GitHubSyncError(
        `Failed to ensure label ${JSON.stringify(label)} in ${repo}:\n${createResult.stdout}\n${createResult.stderr}`
      );
    }
  }
}

function createOrUpdateIssue(
  repo: string,
  title: string,
  body: string,
  labels: string[],
  existingMetadata?: SyncMetadata
): JsonObject {
  const issueFile = writeTempJsonFile({ title, body });
  const labelsFile = writeTempJsonFile({ labels });
  try {
    if (typeof existingMetadata?.issue_number === "number") {
      const issueNumber = existingMetadata.issue_number;
      const payload = ghApiJson([
        "api",
        `repos/${repo}/issues/${issueNumber}`,
        "--method",
        "PATCH",
        "--input",
        issueFile
      ]);
      ghApiJson([
        "api",
        `repos/${repo}/issues/${issueNumber}/labels`,
        "--method",
        "PUT",
        "--input",
        labelsFile
      ]);
      return payload;
    }
    const payload = ghApiJson([
      "api",
      `repos/${repo}/issues`,
      "--method",
      "POST",
      "--input",
      issueFile
    ]);
    if (typeof payload.number === "number") {
      ghApiJson([
        "api",
        `repos/${repo}/issues/${payload.number}/labels`,
        "--method",
        "PUT",
        "--input",
        labelsFile
      ]);
    }
    return payload;
  } finally {
    fs.rmSync(issueFile, { force: true });
    fs.rmSync(labelsFile, { force: true });
  }
}

function getIssueNodeId(repo: string, issueNumber: number): string {
  const payload = ghApiJson(["api", `repos/${repo}/issues/${issueNumber}`]);
  if (typeof payload.node_id !== "string" || !payload.node_id) {
    throw new GitHubSyncError(
      `Could not resolve node_id for issue #${issueNumber} in ${repo}`
    );
  }
  return payload.node_id;
}

function resolveGitHubOwnerType(owner: string): "user" | "organization" {
  const payload = ghApiJson(["api", `users/${owner}`]);
  const ownerType = String(payload.type ?? "")
    .trim()
    .toLowerCase();
  if (ownerType === "user" || ownerType === "organization") {
    return ownerType;
  }
  throw new GitHubSyncError(
    `Could not resolve GitHub owner type for ${JSON.stringify(owner)}`
  );
}

function resolveProject(config: JsonObject): JsonObject | undefined {
  const projectConfig = (config.project as JsonObject | undefined) ?? {};
  const owner = projectConfig.owner;
  const number = projectConfig.number;
  if (typeof owner !== "string" || owner === "" || typeof number !== "number") {
    return undefined;
  }
  const ownerType = resolveGitHubOwnerType(owner);
  const ownerField = ownerType === "organization" ? "organization" : "user";
  const query = `
    query($owner: String!, $number: Int!) {
      ${ownerField}(login: $owner) {
        projectV2(number: $number) {
          id
          title
          fields(first: 100) {
            nodes {
              __typename
              ... on ProjectV2FieldCommon {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options { id name }
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
                configuration {
                  iterations { id title startDate duration }
                }
              }
            }
          }
        }
      }
    }
  `.trim();
  const payload = ghApiJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `number=${number}`
  ]);
  const project = (
    (payload.data as JsonObject | undefined)?.[ownerField] as
      | JsonObject
      | undefined
  )?.projectV2 as JsonObject | undefined;
  if (!project) {
    throw new GitHubSyncError(
      `Could not resolve project owner=${JSON.stringify(owner)} number=${number}`
    );
  }
  project.owner = owner;
  project.owner_type = ownerType;
  return project;
}

function findExistingProjectItem(
  issueNodeId: string,
  projectId: string
): string | undefined {
  const query = `
    query($issueId: ID!) {
      node(id: $issueId) {
        ... on Issue {
          projectItems(first: 50) {
            nodes { id project { id } }
          }
        }
      }
    }
  `.trim();
  const payload = ghApiJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `issueId=${issueNodeId}`
  ]);
  const items =
    ((
      ((payload.data as JsonObject | undefined)?.node as JsonObject | undefined)
        ?.projectItems as JsonObject | undefined
    )?.nodes as Json[] | undefined) ?? [];
  for (const item of items) {
    const itemObject = item as JsonObject;
    const project = itemObject.project as JsonObject | undefined;
    if (
      typeof project?.id === "string" &&
      project.id === projectId &&
      typeof itemObject.id === "string"
    ) {
      return itemObject.id;
    }
  }
  return undefined;
}

function addIssueToProject(issueNodeId: string, projectId: string): string {
  const query = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `.trim();
  const payload = ghApiJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `projectId=${projectId}`,
    "-F",
    `contentId=${issueNodeId}`
  ]);
  const itemId = (
    (
      (payload.data as JsonObject | undefined)?.addProjectV2ItemById as
        | JsonObject
        | undefined
    )?.item as JsonObject | undefined
  )?.id;
  if (typeof itemId !== "string" || !itemId) {
    throw new GitHubSyncError(
      "Failed to add issue to project: missing item id in GraphQL response"
    );
  }
  return itemId;
}

function getNestedValue(
  payload: JsonObject,
  dottedPath: string
): Json | undefined {
  let current: Json | undefined = payload;
  for (const part of dottedPath.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonObject)[part];
  }
  return current;
}

function normalizeChoice(value: Json | undefined): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function chooseSingleSelectOption(
  field: JsonObject,
  rawValue: Json | undefined,
  optionMap: Record<string, string>
): string | undefined {
  const mappedValue = optionMap[String(rawValue)] ?? String(rawValue ?? "");
  const normalizedCandidate = normalizeChoice(mappedValue);
  const variants = new Set<string>(
    [
      normalizedCandidate,
      titleCaseSlug(normalizedCandidate),
      normalizedCandidate.toLowerCase(),
      titleCaseSlug(String(rawValue ?? "")),
      String(rawValue ?? "").replaceAll("_", " "),
      titleCaseSlug(String(rawValue ?? ""))
    ].filter(Boolean)
  );
  const options = (field.options as Json[] | undefined) ?? [];
  for (const option of options) {
    const optionObject = option as JsonObject;
    const name = String(optionObject.name ?? "").trim();
    if (!name) {
      continue;
    }
    const matches = [...variants].some(
      (variant) => variant.toLowerCase() === name.toLowerCase()
    );
    if (matches && typeof optionObject.id === "string") {
      return optionObject.id;
    }
  }
  return undefined;
}

function chooseIterationId(
  field: JsonObject,
  rawValue: Json | undefined
): string | undefined {
  const target = normalizeChoice(rawValue);
  const configuration = (field.configuration as JsonObject | undefined) ?? {};
  const iterations = (configuration.iterations as Json[] | undefined) ?? [];
  for (const iteration of iterations) {
    const iterationObject = iteration as JsonObject;
    if (
      String(iterationObject.title ?? "").trim() === target &&
      typeof iterationObject.id === "string"
    ) {
      return iterationObject.id;
    }
  }
  return undefined;
}

function updateProjectField(
  projectId: string,
  itemId: string,
  field: JsonObject,
  rawValue: Json | undefined,
  optionMap: Record<string, string>
): void {
  if (rawValue === undefined || rawValue === "") {
    return;
  }
  const dataType = String(field.dataType ?? "").toUpperCase();
  const fieldId = String(field.id ?? "");
  if (!fieldId) {
    throw new GitHubSyncError(
      `Project field missing id: ${JSON.stringify(field)}`
    );
  }
  let valueFragment = "";
  if (dataType === "SINGLE_SELECT") {
    const optionId = chooseSingleSelectOption(field, rawValue, optionMap);
    if (!optionId) {
      throw new GitHubSyncError(
        `Could not match single-select option for field ${JSON.stringify(field.name)} and value ${JSON.stringify(rawValue)}`
      );
    }
    valueFragment = `singleSelectOptionId: "${optionId}"`;
  } else if (dataType === "TEXT") {
    valueFragment = `text: ${JSON.stringify(String(rawValue))}`;
  } else if (dataType === "NUMBER") {
    valueFragment = `number: ${Number(rawValue)}`;
  } else if (dataType === "DATE") {
    valueFragment = `date: ${JSON.stringify(String(rawValue))}`;
  } else if (dataType === "ITERATION") {
    const iterationId = chooseIterationId(field, rawValue);
    if (!iterationId) {
      throw new GitHubSyncError(
        `Could not match iteration option for field ${JSON.stringify(field.name)} and value ${JSON.stringify(rawValue)}`
      );
    }
    valueFragment = `iterationId: "${iterationId}"`;
  } else {
    throw new GitHubSyncError(
      `Unsupported project field type ${JSON.stringify(dataType)} for field ${JSON.stringify(field.name)}`
    );
  }
  const query = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: { ${valueFragment} }
        }
      ) {
        projectV2Item { id }
      }
    }
  `.trim();
  ghApiJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `projectId=${projectId}`,
    "-F",
    `itemId=${itemId}`,
    "-F",
    `fieldId=${fieldId}`
  ]);
}

function syncIssueToProject(
  story: Story,
  config: JsonObject,
  issueNodeId: string
): JsonObject | undefined {
  const project = resolveProject(config);
  if (!project) {
    return undefined;
  }
  const projectId = String(project.id ?? "");
  if (!projectId) {
    throw new GitHubSyncError(
      "Resolved project payload did not include a valid id"
    );
  }
  let itemId = findExistingProjectItem(issueNodeId, projectId);
  if (!itemId) {
    itemId = addIssueToProject(issueNodeId, projectId);
  }
  const fieldsByName = new Map<string, JsonObject>();
  const fieldNodes =
    ((project.fields as JsonObject | undefined)?.nodes as Json[] | undefined) ??
    [];
  for (const fieldNode of fieldNodes) {
    const field = fieldNode as JsonObject;
    if (typeof field.name === "string") {
      fieldsByName.set(field.name, field);
    }
  }
  const projectConfig = (config.project as JsonObject | undefined) ?? {};
  const userMapping = ((projectConfig.field_mapping as
    | JsonObject
    | undefined) ?? {}) as Record<string, JsonObject>;
  const fieldMapping: Record<string, JsonObject> = {
    ...DEFAULT_PROJECT_FIELD_MAPPING,
    ...userMapping
  };
  const appliedFields: JsonObject = {};
  const skippedFields: JsonObject = {};
  for (const [fieldName, mapping] of Object.entries(fieldMapping)) {
    const field = fieldsByName.get(fieldName);
    if (!field) {
      skippedFields[fieldName] = "field_not_found";
      continue;
    }
    const source = mapping.source;
    if (typeof source !== "string" || !source) {
      skippedFields[fieldName] = "missing_source_mapping";
      continue;
    }
    const rawValue = getNestedValue(story as unknown as JsonObject, source);
    if (rawValue === undefined || rawValue === "") {
      skippedFields[fieldName] = "empty_source_value";
      continue;
    }
    const optionMap = ((mapping.option_map as JsonObject | undefined) ??
      {}) as Record<string, string>;
    updateProjectField(projectId, itemId, field, rawValue, optionMap);
    appliedFields[fieldName] = rawValue;
  }
  return {
    owner: project.owner as Json,
    number: projectConfig.number as Json,
    id: projectId,
    title: project.title as Json,
    item_id: itemId,
    applied_fields: appliedFields,
    skipped_fields: skippedFields
  };
}

function buildMetadata(
  story: Story,
  storyPath: string,
  syncPath: string,
  title: string,
  body: string,
  labels: string[],
  resolvedSpecRefs: ResolvedSpecRef[],
  existingMetadata: SyncMetadata | undefined,
  issuePayload: JsonObject | undefined,
  projectPayload: JsonObject | undefined,
  dryRun: boolean
): JsonObject {
  const metadata: JsonObject = {
    story_id: story.id,
    story_path: relativeToRoot(storyPath),
    metadata_path: relativeToRoot(syncPath),
    repo: null,
    issue_title: title,
    issue_number: null,
    issue_url: null,
    issue_node_id: null,
    labels,
    spec_version: story.spec_version,
    story_status: story.status,
    body_sha256: computeSha256(body),
    rendered_issue_body: body,
    resolved_spec_refs: resolvedSpecRefs as unknown as Json,
    project: (projectPayload ?? null) as Json,
    last_synced_at: new Date().toISOString(),
    dry_run: dryRun
  };
  const preservedKeys = [
    "branch_name",
    "branch_base",
    "branch_pushed",
    "pr_number",
    "pr_url",
    "pr_title",
    "pr_state",
    "pr_draft",
    "pr_head_ref",
    "pr_base_ref"
  ] as const;
  for (const key of preservedKeys) {
    if (existingMetadata?.[key] !== undefined) {
      metadata[key] = existingMetadata[key] as Json;
    }
  }
  if (issuePayload) {
    const repositoryUrl = String(issuePayload.repository_url ?? "");
    metadata.repo = repositoryUrl
      ? repositoryUrl.split("/repos/").slice(-1)[0]
      : null;
    metadata.issue_number = (issuePayload.number as Json | undefined) ?? null;
    metadata.issue_url = (issuePayload.html_url as Json | undefined) ?? null;
    metadata.issue_node_id = (issuePayload.node_id as Json | undefined) ?? null;
  }
  return metadata;
}

function writeMetadata(syncPath: string, metadata: JsonObject): void {
  fs.mkdirSync(path.dirname(syncPath), { recursive: true });
  fs.writeFileSync(syncPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function resolveStoryPaths(options: Map<string, string | boolean>): string[] {
  const storyValues = new Set<string>();
  const explicitStory = options.get("story");
  if (typeof explicitStory === "string") {
    storyValues.add(path.resolve(ROOT, explicitStory));
  }
  const storiesGlob = options.get("stories-glob");
  if (typeof storiesGlob === "string") {
    if (storiesGlob === "stories/approved/**/*.story.yaml") {
      for (const storyPath of listStoryFiles(DEFAULT_STORIES_ROOT)) {
        storyValues.add(path.resolve(ROOT, storyPath));
      }
    } else {
      const normalizedGlob = storiesGlob.replace(/\\/g, "/");
      for (const storyPath of [
        ...listStoryFiles("stories/approved"),
        ...listStoryFiles("stories/generated")
      ]) {
        const normalizedStoryPath = storyPath.replace(/\\/g, "/");
        if (normalizedGlob.endsWith("/**/*.story.yaml")) {
          const prefix = normalizedGlob.slice(0, -"/**/*.story.yaml".length);
          if (normalizedStoryPath.startsWith(prefix)) {
            storyValues.add(path.resolve(ROOT, storyPath));
          }
        } else if (normalizedStoryPath === normalizedGlob) {
          storyValues.add(path.resolve(ROOT, storyPath));
        }
      }
    }
  }
  if (storyValues.size === 0) {
    for (const storyPath of listStoryFiles(DEFAULT_STORIES_ROOT)) {
      storyValues.add(path.resolve(ROOT, storyPath));
    }
  }
  const includeExamples = Boolean(options.get("include-examples"));
  return [...storyValues]
    .filter(
      (storyPath) =>
        includeExamples || !storyPath.replace(/\\/g, "/").includes("/examples/")
    )
    .sort();
}

function processStory(
  storyPath: string,
  sectionLookup: ReturnType<typeof buildSectionLookup>,
  syncDir: string,
  syncIndex: Map<string, SyncMetadata>,
  config: JsonObject,
  dryRun: boolean,
  writePreview: boolean
): JsonObject {
  const story = loadStory(relativeToRoot(storyPath));
  validateStory(story, sectionLookup);
  if (!dryRun && story.status === "generated") {
    throw new StorySyncError(
      `Live sync only supports non-generated stories, got ${JSON.stringify(story.status)} for ${story.id}`
    );
  }
  const resolvedSpecRefs = resolveSpecRefs(story, sectionLookup);
  const syncPath = storySyncMetadataPath(syncDir, story.id);
  const title = buildIssueTitle(story);
  const labelsConfig = (config.labels as JsonObject | undefined) ?? {};
  const labels = labelSetForStory(
    story,
    Boolean(labelsConfig.include_status),
    ((labelsConfig.defaults as Json[] | undefined) ?? []).map(String)
  );
  const body = renderIssueBody(
    story,
    relativeToRoot(storyPath),
    resolvedSpecRefs,
    syncIndex,
    relativeToRoot(syncPath)
  );
  const existingMetadata = syncIndex.get(story.id);

  if (dryRun) {
    const metadata = buildMetadata(
      story,
      storyPath,
      syncPath,
      title,
      body,
      labels,
      resolvedSpecRefs,
      existingMetadata,
      undefined,
      undefined,
      true
    );
    if (writePreview) {
      writeMetadata(syncPath, metadata);
    }
    return {
      story_id: story.id,
      story_path: relativeToRoot(storyPath),
      sync_path: relativeToRoot(syncPath),
      title,
      labels,
      body_sha256: computeSha256(body),
      created: !existingMetadata,
      updated: Boolean(existingMetadata),
      project_synced: false,
      dry_run: true
    };
  }

  const repo = config.repo;
  if (typeof repo !== "string" || !repo) {
    throw new StorySyncError(
      "Live sync mode requires `repo` in the JSON config."
    );
  }

  ensureGhAvailable();
  ensureLabelsExist(repo, labels, config);
  const issuePayload = createOrUpdateIssue(
    repo,
    title,
    body,
    labels,
    existingMetadata
  );
  if (typeof issuePayload.number !== "number") {
    throw new GitHubSyncError(
      `GitHub issue payload did not include a number for story ${story.id}`
    );
  }
  const issueNodeId =
    typeof issuePayload.node_id === "string" && issuePayload.node_id
      ? issuePayload.node_id
      : getIssueNodeId(repo, issuePayload.number);
  const projectPayload = syncIssueToProject(story, config, issueNodeId);
  const metadata = buildMetadata(
    story,
    storyPath,
    syncPath,
    title,
    body,
    labels,
    resolvedSpecRefs,
    existingMetadata,
    issuePayload,
    projectPayload,
    false
  );
  metadata.repo = repo;
  writeMetadata(syncPath, metadata);
  return {
    story_id: story.id,
    story_path: relativeToRoot(storyPath),
    sync_path: relativeToRoot(syncPath),
    title,
    labels,
    body_sha256: computeSha256(body),
    issue_number: issuePayload.number,
    issue_url: issuePayload.html_url ?? null,
    created: !existingMetadata,
    updated: Boolean(existingMetadata),
    project_synced: Boolean(projectPayload),
    dry_run: false
  };
}

export function syncStories(options: SyncStoriesOptions = {}): JsonObject {
  const config = loadConfig(options.configPath ?? DEFAULT_CONFIG_PATH);
  const syncDir = options.syncDir ?? DEFAULT_SYNC_DIR;
  const sectionIndex = loadSectionIndex();
  const sectionLookup = buildSectionLookup(sectionIndex);
  const syncIndex = loadSyncIndex(syncDir);
  const storyPaths =
    options.storyPaths && options.storyPaths.length > 0
      ? options.storyPaths.map((storyPath) => path.resolve(ROOT, storyPath))
      : listStoryFiles(DEFAULT_STORIES_ROOT).map((storyPath) =>
          path.resolve(ROOT, storyPath)
        );
  const hasExplicitSelection = Boolean(
    options.storyPaths && options.storyPaths.length > 0
  );
  if (storyPaths.length === 0 && hasExplicitSelection) {
    throw new StorySyncError("No story files were selected.");
  }

  const dryRun = Boolean(options.dryRun);
  const writePreview = Boolean(options.writePreview);
  const results: JsonObject[] = [];
  const failures: JsonObject[] = [];

  for (const storyPath of storyPaths) {
    try {
      const result = processStory(
        storyPath,
        sectionLookup,
        syncDir,
        syncIndex,
        config,
        dryRun,
        writePreview
      );
      results.push(result);
      const syncPath = path.resolve(ROOT, String(result.sync_path));
      if ((writePreview || !dryRun) && fs.existsSync(syncPath)) {
        const metadata = JSON.parse(
          fs.readFileSync(syncPath, "utf8")
        ) as SyncMetadata;
        if (typeof metadata.story_id === "string") {
          syncIndex.set(metadata.story_id, metadata);
        }
      }
    } catch (error) {
      failures.push({
        story_path: relativeToRoot(storyPath),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    ok: failures.length === 0,
    dry_run: dryRun,
    results,
    failures
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const payload = syncStories({
    configPath:
      (options.get("config") as string | undefined) ?? DEFAULT_CONFIG_PATH,
    syncDir:
      (options.get("sync-dir") as string | undefined) ?? DEFAULT_SYNC_DIR,
    storyPaths: resolveStoryPaths(options).map((storyPath) =>
      relativeToRoot(storyPath)
    ),
    dryRun: Boolean(options.get("dry-run")),
    writePreview: Boolean(options.get("write-preview"))
  });
  const jsonOutput = Boolean(options.get("json"));

  if (jsonOutput) {
    printJson(payload);
    process.exit(payload.ok ? 0 : 1);
  }

  for (const result of payload.results as JsonObject[]) {
    const mode = result.dry_run ? "DRY-RUN" : "SYNCED";
    const status = result.dry_run
      ? "rendered"
      : result.updated
        ? "updated"
        : "created";
    process.stdout.write(
      `[${mode}] ${result.story_id} -> ${result.title} (${status})\n`
    );
    if (result.issue_url) {
      process.stdout.write(`  issue: ${result.issue_url}\n`);
    }
    process.stdout.write(`  metadata: ${result.sync_path}\n`);
  }
  for (const failure of payload.failures as JsonObject[]) {
    process.stderr.write(`[ERROR] ${failure.story_path}: ${failure.error}\n`);
  }
  process.exit(payload.ok ? 0 : 1);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
