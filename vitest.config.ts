import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/infra/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"]
    }
  }
});
