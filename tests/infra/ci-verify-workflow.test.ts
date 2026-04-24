import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("verify workflow", () => {
  it("runs pnpm verify in CI", () => {
    const workflowPath = path.resolve(
      process.cwd(),
      ".github/workflows/verify.yml"
    );
    const workflow = fs.readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("pnpm verify");
  });
});
