import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "specs/source-original-pdfs/**",
      "specs/source-official-rules/**",
      "stories/review/index.html",
      "fixtures/effect-dsl/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        process: "readonly",
        Buffer: "readonly",
        fetch: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "no-undef": "off",
      "no-fallthrough": "error",
      "no-restricted-imports": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          "ts-nocheck": true
        }
      ]
    }
  },
  {
    files: [
      "contracts/**/*.ts",
      "packages/**/*.ts",
      "tests/**/*.ts",
      "fixtures/**/*.ts",
      "vitest.config.ts",
      "tools/check-contract-and-schema.ts",
      "tools/check-hidden-info-boundaries.ts",
      "tools/check-package-boundaries.ts"
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["tsconfig.repo.json"],
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        process: "readonly",
        Buffer: "readonly",
        fetch: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error"
    }
  },
  {
    files: ["packages/engine-core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "react",
            "react-dom",
            "ws",
            "redis",
            "ioredis",
            "pg",
            "postgres",
            "axios",
            "node-fetch",
            "undici",
            "@optcg/client",
            "@optcg/api",
            "@optcg/match-server"
          ]
        }
      ],
      "no-console": "error"
    }
  },
  {
    files: ["packages/view-engine/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@optcg/api",
            "@optcg/match-server",
            "@optcg/testing/hidden-state"
          ]
        }
      ],
      "no-console": "error"
    }
  },
  {
    files: ["packages/client/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@optcg/api",
            "@optcg/match-server",
            "@optcg/testing/hidden-state"
          ]
        }
      ],
      "no-console": "error"
    }
  }
];
