import type { StorySeed } from "./spec_story_lib.ts";

const COMMON_REPO_RULES = [
  "must pass pnpm verify",
  "must preserve package boundary enforcement",
  "must not introduce hidden-information leakage"
];

export const INITIAL_BACKLOG_SEEDS: StorySeed[] = [
  {
    id: "INF-001",
    title: "Bootstrap the root monorepo workspace and verification baseline",
    type: "tooling",
    area: "infra",
    priority: "critical",
    summary:
      "Establish the root monorepo workspace, verification command, and CI enforcement baseline required before package work scales.",
    specRefIds: [
      "00-project-overview.s019",
      "15-implementation-kickoff.s010",
      "23-repo-tooling-and-enforcement.s004",
      "23-repo-tooling-and-enforcement.s022",
      "23-repo-tooling-and-enforcement.s023"
    ],
    scope: [
      "add the root workspace files needed for the monorepo and shared toolchain baseline",
      "define a root pnpm verify command that runs lint, tests, schema validation, and boundary checks",
      "add CI workflow steps that mirror the main local verification path",
      "wire package-boundary enforcement and contract/schema validation into repo verification"
    ],
    nonScope: [
      "implementing runtime behavior inside engine, server, or client packages",
      "building browser UI or match server features",
      "broad non-vanilla card automation"
    ],
    dependencies: [
      "contracts/canonical-types.ts",
      "contracts/effect-dsl.schema.json"
    ],
    acceptanceCriteria: [
      "root workspace files exist and support one documented bootstrap path",
      "pnpm verify exists and fails on real lint, schema, or boundary violations",
      "CI runs the verification baseline on pull requests",
      "package-boundary enforcement and hidden-information regression lanes are part of repo verification"
    ],
    requiredTests: [
      "verification smoke test proving pnpm verify runs in CI",
      "negative schema fixture proving the contract validation lane fails invalid inputs",
      "illegal cross-package import regression proving boundary rules reject forbidden dependencies"
    ],
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy: "implement_if_clearly_implied"
  },
  {
    id: "CON-001",
    title: "Bootstrap @optcg/types from the canonical contract bundle",
    type: "implementation",
    area: "contracts",
    priority: "critical",
    summary:
      "Create the shared types package from the canonical contract so IDs, DTOs, views, and action contracts have one compile-checked source of truth.",
    specRefIds: [
      "15-implementation-kickoff.s002",
      "15-implementation-kickoff.s005",
      "22-v6-implementation-tightening.s006",
      "01-system-architecture.s004"
    ],
    scope: [
      "create packages/types seeded from contracts/canonical-types.ts",
      "export branded ids, action and decision contracts, player and spectator views, and card metadata interfaces",
      "keep the package free of runtime dependencies on engine, database, websocket, or browser code",
      "wire type-checking so contract drift is caught automatically"
    ],
    nonScope: [
      "full engine behavior",
      "match-server transport handling",
      "browser view helpers"
    ],
    dependencies: [
      "INF-001"
    ],
    acceptanceCriteria: [
      "packages/types exports the shared ids, DTOs, and view contracts required by the kickoff spec",
      "the canonical contract compiles through the repo toolchain without undefined symbols",
      "the package has no runtime dependency on app or infrastructure packages"
    ],
    requiredTests: [
      "contract compile check covering contracts/canonical-types.ts through the repo toolchain",
      "import-boundary regression proving app packages are not pulled into packages/types",
      "API-surface regression covering the initial shared exports"
    ],
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy: "implement_if_clearly_implied"
  },
  {
    id: "ENG-001",
    title: "Bootstrap the deterministic engine-core API skeleton",
    type: "implementation",
    area: "engine",
    priority: "critical",
    summary:
      "Create the authoritative engine-core package with the canonical entry points, deterministic state hashing, and player-view filtering contracts.",
    specRefIds: [
      "15-implementation-kickoff.s006",
      "15-implementation-kickoff.s008",
      "15-implementation-kickoff.s011",
      "01-system-architecture.s005",
      "11-testing-quality.s008"
    ],
    scope: [
      "create packages/engine-core with the canonical createInitialState, getLegalActions, applyAction, resumeDecision, computeView, filterStateForPlayer, and hashGameState exports",
      "establish a deterministic GameState skeleton with hidden zones, event journal, and state sequence handling",
      "wire invariant assertions and state hashing into engine test mode",
      "preserve the server-only boundary for authoritative state handling"
    ],
    nonScope: [
      "full non-vanilla effect runtime behavior",
      "websocket room management",
      "browser-safe presentation helpers"
    ],
    dependencies: [
      "INF-001",
      "CON-001"
    ],
    acceptanceCriteria: [
      "packages/engine-core exports the canonical engine entry points named in the kickoff contract",
      "hashGameState is stable across repeated runs with the same seed and action log",
      "filterStateForPlayer omits opponent hand, deck order, face-down life, rng state, and effect queue internals",
      "the engine package does not import browser, websocket, database, or live Poneglyph code"
    ],
    requiredTests: [
      "invariant regression covering post-action and post-decision state checks",
      "state hash stability test for repeated seed and action-log playback",
      "hidden-information regression for filterStateForPlayer output"
    ],
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy: "fail_and_escalate"
  },
  {
    id: "CAR-001",
    title: "Add a fixture-backed @optcg/cards adapter for Poneglyph-shaped records",
    type: "implementation",
    area: "cards",
    priority: "high",
    summary:
      "Build the early cards adapter around checked-in Poneglyph fixtures so the engine can consume normalized card records before live HTTP exists.",
    specRefIds: [
      "15-implementation-kickoff.s009",
      "15-implementation-kickoff.s013",
      "01-system-architecture.s008",
      "19-poneglyph-api-contract.s003",
      "19-poneglyph-api-contract.s007"
    ],
    scope: [
      "create packages/cards fixture loading, validation, normalization, and variant-key helpers",
      "use the checked-in Poneglyph fixtures for contract tests and early local card loading",
      "preserve source payloads for audit while exposing normalized engine-safe records",
      "keep the adapter separate from live HTTP calls during the fixture-first phase"
    ],
    nonScope: [
      "live Poneglyph HTTP integration",
      "deck builder UI work",
      "unsupported-card full policy automation"
    ],
    dependencies: [
      "INF-001",
      "CON-001"
    ],
    acceptanceCriteria: [
      "packages/cards can load the provided fixture card ids through a typed adapter",
      "normalized card records expose canonical engine-facing fields without handing the raw payload directly to the engine",
      "fixture-based loading works without live network dependencies"
    ],
    requiredTests: [
      "fixture contract test covering the provided sample Poneglyph card payloads",
      "normalization regression covering representative leader and character fields",
      "invalid fixture regression proving the adapter fails closed on malformed card input"
    ],
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy: "implement_if_clearly_implied"
  },
  {
    id: "CON-002",
    title: "Validate effect-definition fixtures against the canonical DSL schema",
    type: "tooling",
    area: "contracts",
    priority: "high",
    summary:
      "Add the schema-validation path that gates broad effect and card automation until DSL fixtures are checked against the canonical contract.",
    specRefIds: [
      "15-implementation-kickoff.s002",
      "22-v6-implementation-tightening.s002",
      "22-v6-implementation-tightening.s007",
      "23-repo-tooling-and-enforcement.s022"
    ],
    scope: [
      "add a repeatable schema-validation command for effect-definition fixtures",
      "wire the validation lane into repo verification and CI",
      "define the initial positive and negative fixture coverage needed to prove the lane works"
    ],
    nonScope: [
      "implementing the effect runtime itself",
      "broad card handler automation",
      "browser-side effect authoring workflows"
    ],
    dependencies: [
      "INF-001"
    ],
    acceptanceCriteria: [
      "a schema-validation command exists for effect-definition fixtures",
      "invalid DSL fixtures fail verification",
      "repo verification and CI both execute the DSL schema lane"
    ],
    requiredTests: [
      "positive schema fixture test",
      "negative schema fixture test",
      "CI regression proving the schema lane runs as part of repo verification"
    ],
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy: "implement_if_clearly_implied"
  },
  {
    id: "ENG-002",
    title: "Build the terminal CLI runner for two-sided vanilla matches",
    type: "implementation",
    area: "engine",
    priority: "high",
    summary:
      "Create the terminal runner that lets one developer play both sides and inspect state sequence, legal actions, and state hash after every move.",
    specRefIds: [
      "15-implementation-kickoff.s007",
      "15-implementation-kickoff.s008",
      "18-acceptance-tests.s003",
      "22-v6-implementation-tightening.s002"
    ],
    scope: [
      "create a CLI runner with the canonical show, hand, play, attach-don, attack, counter, pass, respond, concede, and hash commands",
      "print state sequence, current phase, pending decision, legal actions, and state hash after every action",
      "support two-sided local vanilla play for the kickoff milestone"
    ],
    nonScope: [
      "browser UI",
      "matchmaking or Redis-backed sessions",
      "ranked queue or spectator support"
    ],
    dependencies: [
      "INF-001",
      "CON-001",
      "ENG-001",
      "CAR-001"
    ],
    acceptanceCriteria: [
      "the CLI supports the canonical command set needed for local two-sided play",
      "state sequence, phase, pending decision, legal actions, and state hash are visible after every action",
      "a local vanilla match can end by damage, deck-out, or concession"
    ],
    requiredTests: [
      "terminal integration test covering a local concession flow",
      "terminal integration test covering damage or deck-out completion",
      "output regression covering state sequence and state-hash reporting"
    ],
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy: "fail_and_escalate"
  },
  {
    id: "SEC-001",
    title: "Add hidden-information and replay-drift verification lanes",
    type: "verification",
    area: "security",
    priority: "high",
    summary:
      "Add the hidden-information and replay-drift checks that protect view filtering and deterministic playback while the engine foundation is still being built.",
    specRefIds: [
      "11-testing-quality.s011",
      "11-testing-quality.s012",
      "15-implementation-kickoff.s010",
      "22-v6-implementation-tightening.s002"
    ],
    scope: [
      "add hidden-information fixtures covering opponent hand, deck order, face-down life, rng state, effect queue internals, and temporary reveal filtering",
      "add replay drift checks comparing checkpoint hashes across known logs",
      "wire both lanes into repo verification and CI"
    ],
    nonScope: [
      "new spectator product features",
      "public replay browser work",
      "match-server reconnect behavior"
    ],
    dependencies: [
      "INF-001",
      "ENG-001"
    ],
    acceptanceCriteria: [
      "hidden-information regressions fail if filtered views expose protected data",
      "replay drift checks fail on unexpected checkpoint-hash changes",
      "intentional replay drift requires an explicit migration or version-pin note"
    ],
    requiredTests: [
      "hidden-information fixtures covering reveal and no-reveal scenarios",
      "golden replay regression with checkpoint hash comparison",
      "CI regression proving both verification lanes run from repo verification"
    ],
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy: "fail_and_escalate"
  }
];
