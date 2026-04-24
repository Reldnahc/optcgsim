import { describe, expect, it } from "vitest";
import { checkHiddenInfoBoundaries } from "../../tools/check-hidden-info-boundaries.ts";

describe("hidden-information safeguards", () => {
  it("rejects hidden-state helper imports into client-facing production code", () => {
    const result = checkHiddenInfoBoundaries();
    expect(result.productionViolations).toEqual([]);
    expect(result.negativeFixtureViolations.length).toBeGreaterThan(0);
    expect(
      result.negativeFixtureViolations.some((violation) =>
        violation.file.includes("illegal-client-hidden-helper-import.ts")
      )
    ).toBe(true);
  });
});
