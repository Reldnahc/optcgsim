import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "..");
const STORY_ID_RE = /^[A-Z]{2,}-\d{3,}$/;
const SPEC_REF_RE = /^[A-Za-z0-9_-]+\.s\d{3}( \(.+\))?$/;
const SECTION_REF_ONLY_RE = /^(?<ref>[A-Za-z0-9_-]+\.s\d{3})(?: \(.+\))?$/;

export const TOP_LEVEL_FIELDS = [
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
  "ambiguity_policy",
  "board",
  "agent"
] as const;

export type StoryType =
  | "design"
  | "implementation"
  | "verification"
  | "refactor"
  | "tooling"
  | "ambiguity";

export type StoryArea =
  | "contracts"
  | "engine"
  | "cards"
  | "server"
  | "client"
  | "replay"
  | "database"
  | "infra"
  | "docs"
  | "security";

export type StoryPriority = "critical" | "high" | "medium" | "low";
export type StoryStatus = "generated" | "approved" | "in_progress" | "blocked" | "done" | "replaced";
export type AmbiguityPolicy = "fail_and_escalate" | "implement_if_clearly_implied";

export interface StoryBoard {
  project?: string;
  parent_issue?: string;
  iteration?: string;
  estimate?: string | number;
  labels?: string[];
}

export interface StoryAgent {
  packet_path?: string;
  implementation_skill?: string;
  review_skill?: string;
}

export interface Story {
  spec_version: "v6";
  spec_package_name: "optcg-md-specs-v6";
  story_schema_version: "1.0.0";
  id: string;
  title: string;
  type: StoryType;
  area: StoryArea;
  priority: StoryPriority;
  status: StoryStatus;
  summary: string;
  spec_refs: string[];
  scope: string[];
  non_scope: string[];
  dependencies: string[];
  acceptance_criteria: string[];
  required_tests: string[];
  repo_rules: string[];
  ambiguity_policy: AmbiguityPolicy;
  board?: StoryBoard;
  agent?: StoryAgent;
}

export interface SectionEntry {
  doc_id: string;
  path: string;
  section_ref: string;
  level: number;
  heading: string;
}

export interface SectionIndex {
  specVersion: string;
  specPackageName: string;
  generatedFrom: string[];
  sections: SectionEntry[];
}

export interface ResolvedSpecRef extends SectionEntry {
  raw: string;
}

export interface StorySeed {
  id: string;
  title: string;
  type: StoryType;
  area: StoryArea;
  priority: StoryPriority;
  summary: string;
  specRefIds: string[];
  scope: string[];
  nonScope: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  requiredTests: string[];
  repoRules: string[];
  ambiguityPolicy: AmbiguityPolicy;
  board?: StoryBoard;
}

export function readUtf8(filePath: string): string {
  return fs.readFileSync(path.resolve(ROOT, filePath), "utf8");
}

export function writeUtf8(filePath: string, text: string): void {
  const absolutePath = path.resolve(ROOT, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, text, "utf8");
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(ROOT, filePath));
}

export function relativeToRoot(absolutePath: string): string {
  return path.relative(ROOT, absolutePath).replace(/\\/g, "/");
}

export function loadSectionIndex(): SectionIndex {
  return JSON.parse(readUtf8("section-index.json")) as SectionIndex;
}

export function buildSectionLookup(index: SectionIndex): Map<string, SectionEntry> {
  return new Map(index.sections.map((section) => [section.section_ref, section]));
}

export function normalizeSpecRef(rawSpecRef: string): string {
  const match = rawSpecRef.trim().match(SECTION_REF_ONLY_RE);
  if (!match?.groups?.ref) {
    throw new Error(`Invalid spec ref: ${rawSpecRef}`);
  }
  return match.groups.ref;
}

export function enrichSpecRefs(specRefIds: string[], sectionLookup: Map<string, SectionEntry>): string[] {
  return specRefIds.map((specRefId) => {
    const section = sectionLookup.get(specRefId);
    if (!section) {
      throw new Error(`Missing section ref in section-index.json: ${specRefId}`);
    }
    return `${specRefId} (${section.heading})`;
  });
}

export function createGeneratedStory(seed: StorySeed, sectionLookup: Map<string, SectionEntry>): Story {
  return {
    spec_version: "v6",
    spec_package_name: "optcg-md-specs-v6",
    story_schema_version: "1.0.0",
    id: seed.id,
    title: seed.title,
    type: seed.type,
    area: seed.area,
    priority: seed.priority,
    status: "generated",
    summary: seed.summary.trim(),
    spec_refs: enrichSpecRefs(seed.specRefIds, sectionLookup),
    scope: seed.scope.map((item) => item.trim()),
    non_scope: seed.nonScope.map((item) => item.trim()),
    dependencies: seed.dependencies.map((item) => item.trim()),
    acceptance_criteria: seed.acceptanceCriteria.map((item) => item.trim()),
    required_tests: seed.requiredTests.map((item) => item.trim()),
    repo_rules: seed.repoRules.map((item) => item.trim()),
    ambiguity_policy: seed.ambiguityPolicy,
    board: seed.board,
    agent: {
      packet_path: `agent-packets/generated/${seed.id}.packet.md`,
      implementation_skill: "spec-story-implementation",
      review_skill: "spec-story-review"
    }
  };
}

export function validateStory(story: Story, sectionLookup: Map<string, SectionEntry>, options?: { requireApproved?: boolean }): void {
  const errors: string[] = [];
  const seenKeys = new Set(Object.keys(story));

  if (story.spec_version !== "v6") {
    errors.push(`spec_version must be "v6", got ${JSON.stringify(story.spec_version)}`);
  }
  if (story.spec_package_name !== "optcg-md-specs-v6") {
    errors.push(`spec_package_name must be "optcg-md-specs-v6", got ${JSON.stringify(story.spec_package_name)}`);
  }
  if (story.story_schema_version !== "1.0.0") {
    errors.push(`story_schema_version must be "1.0.0", got ${JSON.stringify(story.story_schema_version)}`);
  }
  if (!STORY_ID_RE.test(story.id)) {
    errors.push(`id must match ${STORY_ID_RE.source}`);
  }
  for (const key of ["title", "summary"] as const) {
    if (!String(story[key] ?? "").trim()) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  const enumChecks = {
    type: ["design", "implementation", "verification", "refactor", "tooling", "ambiguity"],
    area: ["contracts", "engine", "cards", "server", "client", "replay", "database", "infra", "docs", "security"],
    priority: ["critical", "high", "medium", "low"],
    status: ["generated", "approved", "in_progress", "blocked", "done", "replaced"],
    ambiguity_policy: ["fail_and_escalate", "implement_if_clearly_implied"]
  } as const;

  for (const [key, allowed] of Object.entries(enumChecks)) {
    const value = String((story as Record<string, unknown>)[key] ?? "");
    if (!allowed.includes(value as never)) {
      errors.push(`${key} must be one of ${allowed.join(", ")}, got ${JSON.stringify(value)}`);
    }
  }

  if (options?.requireApproved && story.status !== "approved") {
    errors.push(`story status must be "approved" to build a packet, got ${JSON.stringify(story.status)}`);
  }

  const listFields = [
    "spec_refs",
    "scope",
    "non_scope",
    "dependencies",
    "acceptance_criteria",
    "required_tests",
    "repo_rules"
  ] as const;
  for (const field of listFields) {
    const items = story[field];
    if (!Array.isArray(items)) {
      errors.push(`${field} must be a list`);
      continue;
    }
    if (field !== "dependencies" && items.length === 0) {
      errors.push(`${field} must have at least one item`);
    }
    for (const item of items) {
      const text = String(item ?? "").trim();
      if (!text) {
        errors.push(`${field} must not contain blank items`);
        continue;
      }
      if (field === "spec_refs") {
        if (!SPEC_REF_RE.test(text)) {
          errors.push(`spec_refs contains invalid ref ${JSON.stringify(text)}`);
          continue;
        }
        const specRefId = normalizeSpecRef(text);
        const section = sectionLookup.get(specRefId);
        if (!section) {
          errors.push(`spec_refs references missing section ${specRefId}`);
        }
      }
    }
  }

  const unexpectedTopLevelKeys = [...seenKeys].filter((key) => !TOP_LEVEL_FIELDS.includes(key as never));
  if (unexpectedTopLevelKeys.length > 0) {
    errors.push(`unexpected top-level fields: ${unexpectedTopLevelKeys.join(", ")}`);
  }

  if (errors.length > 0) {
    throw new Error(`Story validation failed for ${story.id}:\n- ${errors.join("\n- ")}`);
  }
}

function yamlQuoteIfNeeded(value: string): string {
  if (
    value === "" ||
    /[:{}\[\],&*#?|<>=!%@`]/.test(value) ||
    /^\s|\s$/.test(value) ||
    /^(true|false|null|yes|no|on|off)$/i.test(value) ||
    /^-?\d+(\.\d+)?$/.test(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function emitStringList(lines: string[], key: string, items: string[]): void {
  lines.push(`${key}:`);
  for (const item of items) {
    lines.push(`  - ${yamlQuoteIfNeeded(item)}`);
  }
}

function emitObject(lines: string[], key: string, value: Record<string, unknown>): void {
  const entries = Object.entries(value).filter(([, itemValue]) => itemValue !== undefined && itemValue !== null);
  if (entries.length === 0) {
    return;
  }
  lines.push(`${key}:`);
  for (const [entryKey, entryValue] of entries) {
    if (Array.isArray(entryValue)) {
      lines.push(`  ${entryKey}:`);
      for (const item of entryValue) {
        lines.push(`    - ${yamlQuoteIfNeeded(String(item))}`);
      }
      continue;
    }
    lines.push(`  ${entryKey}: ${yamlQuoteIfNeeded(String(entryValue))}`);
  }
}

export function storyToYaml(story: Story): string {
  const lines: string[] = [];
  lines.push(`spec_version: ${story.spec_version}`);
  lines.push(`spec_package_name: ${story.spec_package_name}`);
  lines.push(`story_schema_version: ${story.story_schema_version}`);
  lines.push(`id: ${story.id}`);
  lines.push(`title: ${yamlQuoteIfNeeded(story.title)}`);
  lines.push(`type: ${story.type}`);
  lines.push(`area: ${story.area}`);
  lines.push(`priority: ${story.priority}`);
  lines.push(`status: ${story.status}`);
  lines.push("summary: >");
  for (const summaryLine of story.summary.split(/\r?\n/)) {
    lines.push(`  ${summaryLine.trimEnd()}`);
  }
  emitStringList(lines, "spec_refs", story.spec_refs);
  emitStringList(lines, "scope", story.scope);
  emitStringList(lines, "non_scope", story.non_scope);
  emitStringList(lines, "dependencies", story.dependencies);
  emitStringList(lines, "acceptance_criteria", story.acceptance_criteria);
  emitStringList(lines, "required_tests", story.required_tests);
  emitStringList(lines, "repo_rules", story.repo_rules);
  lines.push(`ambiguity_policy: ${story.ambiguity_policy}`);
  if (story.board) {
    emitObject(lines, "board", story.board as Record<string, unknown>);
  }
  if (story.agent) {
    emitObject(lines, "agent", story.agent as Record<string, unknown>);
  }
  return `${lines.join("\n")}\n`;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function parseScalar(rawValue: string): string | number | boolean {
  const value = rawValue.trim();
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return JSON.parse(value);
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
  return value;
}

function collectIndentedBlock(lines: string[], startIndex: number, minimumIndent: number): [string[], number] {
  const collected: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      collected.push(line);
      index += 1;
      continue;
    }
    if (indentOf(line) < minimumIndent) {
      break;
    }
    collected.push(line);
    index += 1;
  }
  return [collected, index];
}

function parseBlockScalar(lines: string[], folded: boolean): string {
  const normalized = lines.map((line) => (line.startsWith("  ") ? line.slice(2) : line.trimStart()));
  if (!folded) {
    return normalized.join("\n").trim();
  }
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of normalized) {
    if (!line.trim()) {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }
    current.push(line.trim());
  }
  if (current.length > 0) {
    paragraphs.push(current.join(" ").trim());
  }
  return paragraphs.join("\n\n").trim();
}

function parseListBlock(lines: string[], indent: number): string[] {
  const items: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    if (indentOf(line) !== indent || !line.slice(indent).startsWith("- ")) {
      throw new Error(`Unsupported YAML list fragment: ${line}`);
    }
    items.push(String(parseScalar(line.slice(indent + 2))));
  }
  return items;
}

function parseMappingBlock(lines: string[], indent: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (indentOf(line) !== indent) {
      throw new Error(`Unsupported YAML mapping fragment: ${line}`);
    }
    const trimmed = line.slice(indent);
    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      throw new Error(`Unsupported YAML mapping line: ${line}`);
    }
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    index += 1;
    if (!rawValue) {
      const [nested, nextIndex] = collectIndentedBlock(lines, index, indent + 2);
      index = nextIndex;
      result[key] = parseIndentedValue(nested, indent + 2);
      continue;
    }
    result[key] = parseScalar(rawValue);
  }
  return result;
}

function parseIndentedValue(lines: string[], indent: number): unknown {
  const firstNonBlank = lines.find((line) => line.trim());
  if (!firstNonBlank) {
    return [];
  }
  if (firstNonBlank.slice(indent).startsWith("- ")) {
    return parseListBlock(lines, indent);
  }
  return parseMappingBlock(lines, indent);
}

export function parseStoryYaml(text: string): Story {
  const lines = text.split(/\r?\n/);
  const result: Record<string, unknown> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---" || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }
    if (indentOf(line) !== 0) {
      throw new Error(`Unsupported top-level indentation in story YAML: ${line}`);
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      throw new Error(`Unsupported top-level story YAML line: ${line}`);
    }
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    index += 1;

    if (rawValue === ">" || rawValue === "|") {
      const [block, nextIndex] = collectIndentedBlock(lines, index, 2);
      result[key] = parseBlockScalar(block, rawValue === ">");
      index = nextIndex;
      continue;
    }
    if (rawValue) {
      result[key] = parseScalar(rawValue);
      continue;
    }
    const [block, nextIndex] = collectIndentedBlock(lines, index, 2);
    result[key] = parseIndentedValue(block, 2);
    index = nextIndex;
  }

  return result as Story;
}

export function loadStory(filePath: string): Story {
  return parseStoryYaml(readUtf8(filePath));
}

export function listStoryFiles(relativeDir: string): string[] {
  const absoluteDir = path.resolve(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const entryRelativePath = path.posix.join(relativeDir.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) {
      results.push(...listStoryFiles(entryRelativePath));
    } else if (entry.isFile() && entry.name.endsWith(".story.yaml")) {
      results.push(entryRelativePath);
    }
  }
  return results.sort();
}

export function extractSectionExcerpt(section: SectionEntry): string {
  const content = readUtf8(section.path);
  const lines = content.split(/\r?\n/);
  const refLineIndex = lines.findIndex((line) => line.includes(`Section Ref: \`${section.section_ref}\``));
  if (refLineIndex === -1) {
    throw new Error(`Could not locate section ${section.section_ref} in ${section.path}`);
  }

  let start = refLineIndex + 1;
  while (start < lines.length && !lines[start].trim()) {
    start += 1;
  }

  let end = start;
  while (end < lines.length) {
    const line = lines[end];
    if (end > start && line.includes("<!-- SECTION_REF:")) {
      break;
    }
    end += 1;
  }

  return lines
    .slice(start, end)
    .filter((line) => !line.trim().startsWith("Section Ref:"))
    .join("\n")
    .trim();
}

export function ensureDirectory(relativeDir: string): void {
  fs.mkdirSync(path.resolve(ROOT, relativeDir), { recursive: true });
}

export function parseArgs(argv: string[]): Map<string, string | boolean> {
  const options = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      continue;
    }
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options.set(key, true);
      continue;
    }
    options.set(key, next);
    index += 1;
  }
  return options;
}

export function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
