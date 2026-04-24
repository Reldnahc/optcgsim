import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

interface HiddenInfoViolation {
  file: string;
  importTarget: string;
  message: string;
}

interface HiddenInfoCheckResult {
  productionViolations: HiddenInfoViolation[];
  negativeFixtureViolations: HiddenInfoViolation[];
}

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

const IMPORT_RE = /from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;

function scanFiles(rootDir: string): string[] {
  const absoluteRoot = path.resolve(ROOT, rootDir);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }
  const results: string[] = [];
  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (entry.isFile() && absolutePath.endsWith(".ts")) {
        results.push(absolutePath);
      }
    }
  };
  walk(absoluteRoot);
  return results.sort();
}

function collectImports(filePath: string): string[] {
  const text = fs.readFileSync(filePath, "utf8");
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(text)) !== null) {
    const target = match[1] ?? match[2];
    if (target) {
      imports.push(target);
    }
  }
  return imports;
}

function relative(filePath: string): string {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function isHiddenStateImport(importTarget: string): boolean {
  return (
    importTarget === "@optcg/testing/hidden-state" ||
    importTarget.includes("hidden-state")
  );
}

function violationsForFile(filePath: string): HiddenInfoViolation[] {
  const rel = relative(filePath);
  const imports = collectImports(filePath);
  const violations: HiddenInfoViolation[] = [];
  for (const importTarget of imports) {
    if (
      rel.startsWith("packages/client/src/") ||
      rel.startsWith("packages/view-engine/src/")
    ) {
      if (isHiddenStateImport(importTarget)) {
        violations.push({
          file: rel,
          importTarget,
          message:
            "hidden-state helpers may not enter client or view-engine production code"
        });
      }
    }
    if (
      rel.startsWith("fixtures/regressions/hidden-info/") &&
      isHiddenStateImport(importTarget)
    ) {
      violations.push({
        file: rel,
        importTarget,
        message:
          "negative hidden-info fixture correctly violates hidden-state import rules"
      });
    }
  }
  return violations;
}

export function checkHiddenInfoBoundaries(): HiddenInfoCheckResult {
  const productionFiles = [
    ...scanFiles("packages/client"),
    ...scanFiles("packages/view-engine")
  ];
  const fixtureFiles = scanFiles("fixtures/regressions/hidden-info");
  return {
    productionViolations: productionFiles.flatMap(violationsForFile),
    negativeFixtureViolations: fixtureFiles.flatMap(violationsForFile)
  };
}

function main(): void {
  const result = checkHiddenInfoBoundaries();
  const ok =
    result.productionViolations.length === 0 &&
    result.negativeFixtureViolations.length > 0;
  printJson({ ok, ...result });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
