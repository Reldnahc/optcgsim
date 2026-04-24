import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;

interface FixtureResult {
  path: string;
  valid: boolean;
  errors: string[];
}

interface ContractAndSchemaResult {
  contractCompile: {
    ok: boolean;
    stdout: string;
    stderr: string;
  };
  validFixtures: FixtureResult[];
  invalidFixtures: FixtureResult[];
}

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function relative(filePath: string): string {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function scanJsonFiles(rootDir: string): string[] {
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
      if (entry.isFile() && absolutePath.endsWith(".json")) {
        results.push(absolutePath);
      }
    }
  };
  walk(absoluteRoot);
  return results.sort();
}

function compileContracts(): { ok: boolean; stdout: string; stderr: string } {
  const tscEntrypoint = path.resolve(
    ROOT,
    "node_modules/typescript/lib/tsc.js"
  );
  const result = spawnSync(
    process.execPath,
    [tscEntrypoint, "-p", "contracts/tsconfig.json"],
    {
      cwd: ROOT,
      encoding: "utf8"
    }
  );
  return {
    ok: (result.status ?? 1) === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export function checkContractsAndSchema(): ContractAndSchemaResult {
  const schemaPath = path.resolve(ROOT, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const evaluateFixture = (fixturePath: string): FixtureResult => {
    const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const valid = Boolean(validate(payload));
    return {
      path: relative(fixturePath),
      valid,
      errors: (validate.errors ?? []).map(
        (error: ErrorObject) =>
          `${error.instancePath || "/"} ${error.message ?? "validation error"}`
      )
    };
  };

  return {
    contractCompile: compileContracts(),
    validFixtures: scanJsonFiles("fixtures/effect-dsl/valid").map(
      evaluateFixture
    ),
    invalidFixtures: scanJsonFiles("fixtures/effect-dsl/invalid").map(
      evaluateFixture
    )
  };
}

function main(): void {
  const result = checkContractsAndSchema();
  const ok =
    result.contractCompile.ok &&
    result.validFixtures.every((fixture) => fixture.valid) &&
    result.invalidFixtures.every((fixture) => !fixture.valid) &&
    result.invalidFixtures.length > 0;
  printJson({ ok, ...result });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
