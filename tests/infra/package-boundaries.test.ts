import { describe, expect, it } from "vitest";
import { checkPackageBoundaries } from "../../tools/check-package-boundaries.ts";

describe("package boundaries", () => {
  it("keeps production packages clean and rejects the negative boundary regression fixture", () => {
    const result = checkPackageBoundaries();
    expect(result.productionViolations).toEqual([]);
    expect(result.negativeFixtureViolations.length).toBeGreaterThan(0);
    expect(
      result.negativeFixtureViolations.some((violation) =>
        violation.file.includes("illegal-client-import.ts")
      )
    ).toBe(true);
  });
});
