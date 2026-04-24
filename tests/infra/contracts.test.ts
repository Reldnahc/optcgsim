import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkContractsAndSchema } from "../../tools/check-contract-and-schema.ts";

describe("contracts and effect schema", () => {
  it("compiles contracts/canonical-types.ts through the repo toolchain", () => {
    const result = checkContractsAndSchema();
    expect(
      result.contractCompile.ok,
      result.contractCompile.stderr || result.contractCompile.stdout
    ).toBe(true);
  });

  it("accepts valid effect DSL fixtures and rejects invalid fixtures", () => {
    const result = checkContractsAndSchema();
    expect(result.validFixtures.length).toBeGreaterThan(0);
    expect(result.validFixtures.every((fixture) => fixture.valid)).toBe(true);
    expect(result.invalidFixtures.length).toBeGreaterThan(0);
    expect(result.invalidFixtures.every((fixture) => !fixture.valid)).toBe(
      true
    );
  });

  it("keeps the @optcg/types package contract mirror aligned with contracts/canonical-types.ts", () => {
    const canonical = fs.readFileSync(
      path.resolve("contracts/canonical-types.ts"),
      "utf8"
    );
    const packageMirror = fs.readFileSync(
      path.resolve("packages/types/src/canonical-types.ts"),
      "utf8"
    );
    expect(packageMirror).toBe(canonical);
  });
});
