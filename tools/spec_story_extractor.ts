import {
  createGeneratedStory,
  ensureDirectory,
  extractSectionExcerpt,
  loadSectionIndex,
  storyToYaml,
  type SectionEntry,
  type Story,
  type StorySeed,
  type StoryType,
  type StoryArea,
  type StoryPriority,
  type AmbiguityPolicy,
  writeUtf8
} from "./spec_story_lib.ts";

export interface ExtractionRule {
  id: string;
  description: string;
  requiredSpecRefs: string[];
  seed: StorySeed;
}

export interface ExtractionResult {
  matchedRules: Array<{
    id: string;
    description: string;
    requiredSpecRefs: string[];
    storyId: string;
  }>;
  stories: Story[];
  selectedSpecRefs: string[];
}

export interface LlmPromptSection {
  specRef: string;
  heading: string;
  path: string;
  excerpt: string;
}

export interface LlmPromptPack {
  mode: "story-generation";
  schemaPath: string;
  selectedSpecRefs: string[];
  sourceSections: LlmPromptSection[];
  authorityOrder: string[];
  generationRules: string[];
  outputRules: string[];
  prompt: string;
}

const COMMON_REPO_RULES = [
  "must pass pnpm verify",
  "must preserve package boundary enforcement",
  "must not introduce hidden-information leakage"
];

const DEFAULT_PROFILE_REFS = {
  "initial-foundation": [
    "00-project-overview.s019",
    "01-system-architecture.s004",
    "01-system-architecture.s005",
    "01-system-architecture.s007",
    "01-system-architecture.s008",
    "01-system-architecture.s009",
    "07-match-server-protocol.s002",
    "07-match-server-protocol.s004",
    "07-match-server-protocol.s005",
    "07-match-server-protocol.s007",
    "07-match-server-protocol.s008",
    "07-match-server-protocol.s009",
    "07-match-server-protocol.s010",
    "07-match-server-protocol.s011",
    "07-match-server-protocol.s012",
    "07-match-server-protocol.s013",
    "07-match-server-protocol.s017",
    "08-replay-rollback-recovery.s002",
    "08-replay-rollback-recovery.s003",
    "08-replay-rollback-recovery.s004",
    "08-replay-rollback-recovery.s005",
    "08-replay-rollback-recovery.s006",
    "08-replay-rollback-recovery.s007",
    "08-replay-rollback-recovery.s022",
    "08-replay-rollback-recovery.s025",
    "10-database-schema.s002",
    "10-database-schema.s003",
    "10-database-schema.s010",
    "10-database-schema.s011",
    "10-database-schema.s013",
    "10-database-schema.s017",
    "11-testing-quality.s010",
    "11-testing-quality.s012",
    "11-testing-quality.s013",
    "15-implementation-kickoff.s002",
    "15-implementation-kickoff.s010",
    "15-implementation-kickoff.s015",
    "18-acceptance-tests.s006",
    "18-acceptance-tests.s008",
    "18-acceptance-tests.s010",
    "18-acceptance-tests.s012",
    "22-v6-implementation-tightening.s002",
    "22-v6-implementation-tightening.s007",
    "22-v6-implementation-tightening.s020",
    "22-v6-implementation-tightening.s021",
    "22-v6-implementation-tightening.s022",
    "23-repo-tooling-and-enforcement.s022",
    "29-game-types-queues-and-lobbies.s002",
    "29-game-types-queues-and-lobbies.s004",
    "29-game-types-queues-and-lobbies.s005",
    "29-game-types-queues-and-lobbies.s006",
    "29-game-types-queues-and-lobbies.s007",
    "29-game-types-queues-and-lobbies.s008",
    "29-game-types-queues-and-lobbies.s009",
    "29-game-types-queues-and-lobbies.s010",
    "30-formats-and-ranked-competition.s003",
    "30-formats-and-ranked-competition.s004",
    "30-formats-and-ranked-competition.s005",
    "30-formats-and-ranked-competition.s006",
    "30-formats-and-ranked-competition.s007",
    "30-formats-and-ranked-competition.s008",
    "30-formats-and-ranked-competition.s009",
    "30-formats-and-ranked-competition.s010",
    "30-formats-and-ranked-competition.s011"
  ],
  "engine-core": [
    "00-project-overview.s009",
    "00-project-overview.s010",
    "00-project-overview.s012",
    "00-project-overview.s013",
    "00-project-overview.s015",
    "01-system-architecture.s005",
    "01-system-architecture.s013",
    "02-engine-mechanics.s002",
    "02-engine-mechanics.s003",
    "02-engine-mechanics.s004",
    "02-engine-mechanics.s005",
    "02-engine-mechanics.s006",
    "02-engine-mechanics.s008",
    "02-engine-mechanics.s009",
    "02-engine-mechanics.s010",
    "02-engine-mechanics.s016",
    "02-engine-mechanics.s017",
    "02-engine-mechanics.s023",
    "02-engine-mechanics.s024",
    "02-engine-mechanics.s025",
    "02-engine-mechanics.s026",
    "02-engine-mechanics.s027",
    "02-engine-mechanics.s028",
    "02-engine-mechanics.s031",
    "02-engine-mechanics.s032",
    "02-engine-mechanics.s033",
    "02-engine-mechanics.s035",
    "02-engine-mechanics.s036",
    "02-engine-mechanics.s037",
    "02-engine-mechanics.s038",
    "02-engine-mechanics.s039",
    "02-engine-mechanics.s041",
    "02-engine-mechanics.s042",
    "02-engine-mechanics.s043",
    "02-engine-mechanics.s044",
    "03-game-state-events-decisions.s002",
    "03-game-state-events-decisions.s003",
    "03-game-state-events-decisions.s004",
    "03-game-state-events-decisions.s005",
    "03-game-state-events-decisions.s006",
    "03-game-state-events-decisions.s007",
    "03-game-state-events-decisions.s008",
    "03-game-state-events-decisions.s009",
    "03-game-state-events-decisions.s010",
    "03-game-state-events-decisions.s011",
    "03-game-state-events-decisions.s012",
    "03-game-state-events-decisions.s013",
    "03-game-state-events-decisions.s014",
    "03-game-state-events-decisions.s015",
    "03-game-state-events-decisions.s016",
    "03-game-state-events-decisions.s017",
    "03-game-state-events-decisions.s018",
    "03-game-state-events-decisions.s019",
    "03-game-state-events-decisions.s020",
    "03-game-state-events-decisions.s021",
    "03-game-state-events-decisions.s022",
    "03-game-state-events-decisions.s023",
    "12-roadmap.s005",
    "15-implementation-kickoff.s010",
    "18-acceptance-tests.s003",
    "18-acceptance-tests.s009"
  ],
  "cards-and-effects": [
    "00-project-overview.s012",
    "00-project-overview.s013",
    "00-project-overview.s014",
    "00-project-overview.s020",
    "01-system-architecture.s007",
    "01-system-architecture.s008",
    "01-system-architecture.s023",
    "04-effect-runtime.s002",
    "04-effect-runtime.s003",
    "04-effect-runtime.s004",
    "04-effect-runtime.s005",
    "04-effect-runtime.s006",
    "04-effect-runtime.s007",
    "04-effect-runtime.s008",
    "04-effect-runtime.s009",
    "04-effect-runtime.s010",
    "04-effect-runtime.s011",
    "04-effect-runtime.s012",
    "04-effect-runtime.s013",
    "04-effect-runtime.s014",
    "04-effect-runtime.s015",
    "04-effect-runtime.s016",
    "04-effect-runtime.s017",
    "04-effect-runtime.s018",
    "04-effect-runtime.s019",
    "05-effect-dsl-reference.s002",
    "05-effect-dsl-reference.s003",
    "05-effect-dsl-reference.s004",
    "05-effect-dsl-reference.s005",
    "05-effect-dsl-reference.s006",
    "05-effect-dsl-reference.s007",
    "05-effect-dsl-reference.s008",
    "05-effect-dsl-reference.s009",
    "05-effect-dsl-reference.s010",
    "05-effect-dsl-reference.s011",
    "05-effect-dsl-reference.s012",
    "05-effect-dsl-reference.s013",
    "05-effect-dsl-reference.s014",
    "09-card-data-and-support-policy.s002",
    "09-card-data-and-support-policy.s004",
    "09-card-data-and-support-policy.s005",
    "09-card-data-and-support-policy.s006",
    "09-card-data-and-support-policy.s013",
    "09-card-data-and-support-policy.s015",
    "09-card-data-and-support-policy.s019",
    "09-card-data-and-support-policy.s020",
    "17-first-card-fixtures.s003",
    "17-first-card-fixtures.s004",
    "17-first-card-fixtures.s005",
    "17-first-card-fixtures.s006",
    "17-first-card-fixtures.s007",
    "17-first-card-fixtures.s008",
    "18-acceptance-tests.s004",
    "18-acceptance-tests.s007",
    "18-acceptance-tests.s011",
    "18-acceptance-tests.s013",
    "18-acceptance-tests.s014",
    "18-acceptance-tests.s016",
    "20-card-implementation-examples.s003",
    "20-card-implementation-examples.s004",
    "20-card-implementation-examples.s005",
    "20-card-implementation-examples.s006",
    "20-card-implementation-examples.s007",
    "20-card-implementation-examples.s008",
    "20-card-implementation-examples.s009",
    "20-card-implementation-examples.s010",
    "20-card-implementation-examples.s011",
    "20-card-implementation-examples.s012",
    "20-card-implementation-examples.s013",
    "20-card-implementation-examples.s014",
    "20-card-implementation-examples.s015",
    "22-v6-implementation-tightening.s007"
  ],
  "gameplay-rules": [
    "00-project-overview.s009",
    "00-project-overview.s010",
    "00-project-overview.s011",
    "00-project-overview.s012",
    "00-project-overview.s013",
    "00-project-overview.s015",
    "02-engine-mechanics.s003",
    "02-engine-mechanics.s004",
    "02-engine-mechanics.s005",
    "02-engine-mechanics.s006",
    "02-engine-mechanics.s008",
    "02-engine-mechanics.s010",
    "02-engine-mechanics.s011",
    "02-engine-mechanics.s012",
    "02-engine-mechanics.s013",
    "02-engine-mechanics.s014",
    "02-engine-mechanics.s015",
    "02-engine-mechanics.s016",
    "02-engine-mechanics.s017",
    "02-engine-mechanics.s018",
    "02-engine-mechanics.s019",
    "02-engine-mechanics.s020",
    "02-engine-mechanics.s021",
    "02-engine-mechanics.s022",
    "02-engine-mechanics.s023",
    "02-engine-mechanics.s024",
    "02-engine-mechanics.s025",
    "02-engine-mechanics.s026",
    "02-engine-mechanics.s027",
    "02-engine-mechanics.s028",
    "02-engine-mechanics.s035",
    "02-engine-mechanics.s036",
    "02-engine-mechanics.s037",
    "02-engine-mechanics.s038",
    "02-engine-mechanics.s039",
    "02-engine-mechanics.s040",
    "02-engine-mechanics.s041",
    "02-engine-mechanics.s042",
    "02-engine-mechanics.s043",
    "03-game-state-events-decisions.s002",
    "03-game-state-events-decisions.s004",
    "03-game-state-events-decisions.s005",
    "03-game-state-events-decisions.s006",
    "03-game-state-events-decisions.s007",
    "03-game-state-events-decisions.s009",
    "03-game-state-events-decisions.s010",
    "03-game-state-events-decisions.s011",
    "03-game-state-events-decisions.s012",
    "03-game-state-events-decisions.s013",
    "03-game-state-events-decisions.s014",
    "03-game-state-events-decisions.s015",
    "03-game-state-events-decisions.s016",
    "03-game-state-events-decisions.s017",
    "03-game-state-events-decisions.s018",
    "03-game-state-events-decisions.s019",
    "03-game-state-events-decisions.s020",
    "03-game-state-events-decisions.s021",
    "03-game-state-events-decisions.s022",
    "06-visibility-security.s003",
    "06-visibility-security.s005",
    "06-visibility-security.s006",
    "06-visibility-security.s007",
    "06-visibility-security.s017",
    "06-visibility-security.s018",
    "06-visibility-security.s021",
    "12-roadmap.s005",
    "12-roadmap.s006",
    "18-acceptance-tests.s003",
    "18-acceptance-tests.s004",
    "18-acceptance-tests.s009"
  ],
  "client-and-view": [
    "01-system-architecture.s006",
    "01-system-architecture.s011",
    "01-system-architecture.s013",
    "01-system-architecture.s014",
    "03-game-state-events-decisions.s003",
    "03-game-state-events-decisions.s006",
    "03-game-state-events-decisions.s018",
    "03-game-state-events-decisions.s024",
    "06-visibility-security.s004",
    "06-visibility-security.s005",
    "06-visibility-security.s007",
    "06-visibility-security.s008",
    "06-visibility-security.s016",
    "06-visibility-security.s019",
    "06-visibility-security.s020",
    "06-visibility-security.s021",
    "06-visibility-security.s023",
    "10-database-schema.s020",
    "12-roadmap.s007",
    "12-roadmap.s009",
    "12-roadmap.s015",
    "18-acceptance-tests.s005",
    "18-acceptance-tests.s007",
    "18-acceptance-tests.s015"
  ],
  "social-and-accounts": [
    "01-system-architecture.s010",
    "01-system-architecture.s011",
    "03-game-state-events-decisions.s024",
    "10-database-schema.s005",
    "10-database-schema.s006",
    "10-database-schema.s007",
    "10-database-schema.s014",
    "10-database-schema.s020",
    "12-roadmap.s009",
    "12-roadmap.s011",
    "12-roadmap.s015",
    "18-acceptance-tests.s007",
    "18-acceptance-tests.s015"
  ],
  "tournaments-and-moderation": [
    "06-visibility-security.s008",
    "06-visibility-security.s015",
    "06-visibility-security.s018",
    "06-visibility-security.s020",
    "08-replay-rollback-recovery.s011",
    "08-replay-rollback-recovery.s013",
    "08-replay-rollback-recovery.s014",
    "08-replay-rollback-recovery.s015",
    "08-replay-rollback-recovery.s016",
    "08-replay-rollback-recovery.s017",
    "08-replay-rollback-recovery.s018",
    "08-replay-rollback-recovery.s019",
    "08-replay-rollback-recovery.s020",
    "08-replay-rollback-recovery.s028",
    "10-database-schema.s012",
    "10-database-schema.s015",
    "12-roadmap.s011",
    "12-roadmap.s012",
    "12-roadmap.s013",
    "12-roadmap.s014",
    "18-acceptance-tests.s008",
    "18-acceptance-tests.s010",
    "18-acceptance-tests.s012"
  ]
} as const;

function createSeed(
  id: string,
  title: string,
  type: StoryType,
  area: StoryArea,
  priority: StoryPriority,
  summary: string,
  specRefIds: string[],
  scope: string[],
  nonScope: string[],
  dependencies: string[],
  acceptanceCriteria: string[],
  requiredTests: string[],
  ambiguityPolicy: AmbiguityPolicy
): StorySeed {
  return {
    id,
    title,
    type,
    area,
    priority,
    summary,
    specRefIds,
    scope,
    nonScope,
    dependencies,
    acceptanceCriteria,
    requiredTests,
    repoRules: COMMON_REPO_RULES,
    ambiguityPolicy
  };
}

export const EXTRACTION_RULES: ExtractionRule[] = [
  {
    id: "effects-fixtures-foundation",
    description:
      "Promote the effects package and schema-valid fixture lane from architecture and kickoff refs.",
    requiredSpecRefs: [
      "01-system-architecture.s007",
      "15-implementation-kickoff.s002",
      "22-v6-implementation-tightening.s007",
      "23-repo-tooling-and-enforcement.s022"
    ],
    seed: createSeed(
      "EFF-001",
      "Bootstrap @optcg/effects with schema-valid fixture definitions",
      "implementation",
      "engine",
      "high",
      "Create the first @optcg/effects package boundary with schema-valid fixture definitions, registry wiring, and coverage hooks so effect work starts from the canonical DSL instead of ad hoc handler code.",
      [
        "01-system-architecture.s007",
        "15-implementation-kickoff.s002",
        "22-v6-implementation-tightening.s007",
        "23-repo-tooling-and-enforcement.s011",
        "23-repo-tooling-and-enforcement.s022"
      ],
      [
        "create packages/effects with checked-in canonical fixture definitions and a registry entry point",
        "validate committed effect fixtures against contracts/effect-dsl.schema.json before use",
        "separate fixture definitions from engine execution paths so schema drift is caught outside runtime logic",
        "add coverage/report scaffolding for implemented fixtures and custom handlers"
      ],
      [
        "broad non-vanilla card runtime behavior",
        "browser-side effect authoring workflows",
        "live card fetch integration"
      ],
      ["INF-001", "CON-001", "CON-002"],
      [
        "packages/effects exists with a typed registry entry point and canonical fixture location",
        "committed effect fixtures are rejected when they drift from contracts/effect-dsl.schema.json",
        "the engine consumes effect definitions through package boundaries rather than inlined ad hoc objects"
      ],
      [
        "fixture-validation regression covering one valid and one invalid effect definition",
        "boundary regression proving packages/effects stays separate from browser and transport code",
        "coverage/report smoke test for the initial effect registry"
      ],
      "fail_and_escalate"
    )
  },
  {
    id: "match-server-protocol-foundation",
    description:
      "Extract the first match-server protocol story from the protocol and acceptance-test refs.",
    requiredSpecRefs: [
      "01-system-architecture.s009",
      "07-match-server-protocol.s004",
      "07-match-server-protocol.s005",
      "07-match-server-protocol.s007",
      "07-match-server-protocol.s008"
    ],
    seed: createSeed(
      "SRV-001",
      "Implement the match-server action envelope and idempotent sequencing baseline",
      "implementation",
      "server",
      "high",
      "Build the first @optcg/match-server protocol path around canonical client envelopes, idempotent action handling, committed-state broadcast ordering, and actor-specific filtered results.",
      [
        "01-system-architecture.s009",
        "07-match-server-protocol.s002",
        "07-match-server-protocol.s004",
        "07-match-server-protocol.s005",
        "07-match-server-protocol.s007",
        "07-match-server-protocol.s008",
        "18-acceptance-tests.s006"
      ],
      [
        "create the client action envelope and server action result contracts used by live match transport",
        "enforce clientActionId plus actionHash idempotency and expectedStateSeq validation",
        "commit state before per-recipient broadcasts and include monotonic serverSeq values on non-heartbeat messages",
        "route respondToDecision through resumeDecision instead of applyAction"
      ],
      [
        "queue entry and lobby creation flows before a match exists",
        "spectator policy tuning beyond the protocol defaults required for accepted action broadcasts",
        "full process-crash recovery and persisted replay storage"
      ],
      ["INF-001", "CON-001", "ENG-001"],
      [
        "duplicate clientActionId with the same actionHash returns the stored result without reapplying the action",
        "duplicate clientActionId with a different actionHash is rejected as idempotencyConflict",
        "all non-heartbeat server messages include monotonic serverSeq and committed stateSeq where applicable",
        "decision responses resume the engine through the decision path instead of the normal action path"
      ],
      [
        "protocol test covering duplicate clientActionId idempotency",
        "protocol test covering stale expectedStateSeq rejection",
        "protocol test covering monotonic serverSeq ordering",
        "protocol test covering respondToDecision routing"
      ],
      "fail_and_escalate"
    )
  },
  {
    id: "reconnect-timers-spectators",
    description:
      "Extract reconnect, timer, and spectator delivery work from the protocol sections.",
    requiredSpecRefs: [
      "07-match-server-protocol.s011",
      "07-match-server-protocol.s012",
      "07-match-server-protocol.s013",
      "07-match-server-protocol.s017",
      "18-acceptance-tests.s006"
    ],
    seed: createSeed(
      "SRV-002",
      "Add reconnect, timer ownership, and spectator subscription handling",
      "implementation",
      "server",
      "high",
      "Extend the match-server baseline with reconnect recovery, holding-player timer drainage, and spectator subscriptions that obey configured visibility policy.",
      [
        "07-match-server-protocol.s011",
        "07-match-server-protocol.s012",
        "07-match-server-protocol.s013",
        "07-match-server-protocol.s017",
        "18-acceptance-tests.s006",
        "22-v6-implementation-tightening.s014"
      ],
      [
        "implement reconnect requests that restore the current filtered view, pending decision, and timer state",
        "enforce one primary game timer per player plus disconnect grace behavior",
        "drain time only for the player currently holding up game progress",
        "add spectator subscription handling that selects an allowed mode from match configuration and policy"
      ],
      [
        "ranked queue creation",
        "historical replay export",
        "tournament-only spectator policies"
      ],
      ["SRV-001"],
      [
        "reconnect returns the current filtered PlayerView and pending decision when one exists",
        "only the player currently holding up progress loses timer time",
        "disconnect grace and forfeit behavior follows the configured policy without requiring a separate decision timer",
        "spectators receive filtered views only under allowed subscription modes"
      ],
      [
        "protocol test covering reconnect sends current filtered PlayerView",
        "protocol test covering pending decision restoration after reconnect",
        "protocol test covering timer drainage ownership",
        "spectator policy regression covering delayed-filtered delivery without early leakage"
      ],
      "fail_and_escalate"
    )
  },
  {
    id: "replay-contracts-and-drift",
    description:
      "Extract replay artifact and drift protection from replay and testing docs.",
    requiredSpecRefs: [
      "08-replay-rollback-recovery.s002",
      "08-replay-rollback-recovery.s003",
      "08-replay-rollback-recovery.s004",
      "08-replay-rollback-recovery.s006",
      "08-replay-rollback-recovery.s007"
    ],
    seed: createSeed(
      "RPL-001",
      "Define the replay artifact contract and checkpoint drift verification lane",
      "implementation",
      "replay",
      "high",
      "Build the replay header, deterministic log, checkpoint model, and golden-drift verification lane so matches can be reconstructed and regression-checked against pinned runtime versions.",
      [
        "08-replay-rollback-recovery.s002",
        "08-replay-rollback-recovery.s003",
        "08-replay-rollback-recovery.s004",
        "08-replay-rollback-recovery.s005",
        "08-replay-rollback-recovery.s006",
        "08-replay-rollback-recovery.s007",
        "11-testing-quality.s010",
        "11-testing-quality.s012",
        "18-acceptance-tests.s008"
      ],
      [
        "define replay header and reconstruction-source contracts with pinned runtime versions and manifest hash",
        "record deterministic entries separately from audit envelopes",
        "store replay checkpoints and compare checkpoint hashes in CI",
        "reject replay artifacts that cannot reconstruct from either an initial snapshot or a revealed seed plus deck orders"
      ],
      [
        "judge rollback administration",
        "public replay browser UI",
        "cross-version migration tooling for intentional drift"
      ],
      ["ENG-001", "SEC-001"],
      [
        "replay artifacts include the required version bundle, manifestHash, and reconstruction source",
        "deterministic replay entries exclude audit-only transport metadata",
        "golden replay checks fail on unexpected checkpoint hash drift",
        "replay artifacts without a valid reconstruction source are rejected"
      ],
      [
        "golden replay regression comparing checkpoint hashes",
        "contract test rejecting a replay artifact missing both initialSnapshot and seed-plus-deck-orders",
        "replay serialization test proving audit-only metadata does not affect deterministic entries"
      ],
      "fail_and_escalate"
    )
  },
  {
    id: "database-match-replay-foundation",
    description:
      "Extract durable match and replay persistence work from schema and replay refs.",
    requiredSpecRefs: [
      "10-database-schema.s002",
      "10-database-schema.s003",
      "10-database-schema.s010",
      "10-database-schema.s011",
      "10-database-schema.s017"
    ],
    seed: createSeed(
      "DB-001",
      "Implement the durable match, replay, and Redis recovery persistence baseline",
      "implementation",
      "database",
      "high",
      "Create the first persistence slice for active-match Redis state and durable Postgres match and replay records so live orchestration has canonical storage contracts before ranked or recovery work expands.",
      [
        "10-database-schema.s002",
        "10-database-schema.s003",
        "10-database-schema.s010",
        "10-database-schema.s011",
        "10-database-schema.s017",
        "08-replay-rollback-recovery.s022",
        "08-replay-rollback-recovery.s025"
      ],
      [
        "implement the durable match and match_replays persistence contract from contracts/database-schema-v6.sql",
        "persist active-match state, metadata, action logs, and decision logs under canonical Redis keys",
        "store gameType, formatId, ladderId, runtime versions, manifest hash, and spectator policy with match records",
        "store replay reconstruction source and checkpoints in durable replay rows"
      ],
      [
        "full auth and social schema implementation",
        "moderation dashboards",
        "object-storage offloading for large snapshots"
      ],
      ["INF-001", "RPL-001", "SRV-001"],
      [
        "match rows preserve gameType, formatId, optional ladderId, runtime versions, and manifest snapshot fields",
        "replay rows require a valid reconstruction source and persist checkpoints and deterministic entries",
        "Redis active-match keys match the canonical naming and recovery payload split",
        "queue, lobby, and recovery code consume the shared persistence contract instead of ad hoc record shapes"
      ],
      [
        "database contract test covering required match columns and ranked ladderId constraint",
        "database contract test covering replay reconstruction-source constraint",
        "Redis key-shape regression covering state, meta, actions, and decisions payloads"
      ],
      "fail_and_escalate"
    )
  },
  {
    id: "queue-ticket-and-match-stamping",
    description:
      "Extract queue-backed entry work from game-type and format sections.",
    requiredSpecRefs: [
      "29-game-types-queues-and-lobbies.s004",
      "29-game-types-queues-and-lobbies.s005",
      "29-game-types-queues-and-lobbies.s006",
      "29-game-types-queues-and-lobbies.s009",
      "30-formats-and-ranked-competition.s005"
    ],
    seed: createSeed(
      "QUE-001",
      "Implement queue tickets and queue-created match stamping for ranked and unranked",
      "implementation",
      "server",
      "high",
      "Add the queue-backed session-entry contracts that validate gameType and format pairing, require ladder identity for ranked, and stamp immutable queue context onto created matches.",
      [
        "29-game-types-queues-and-lobbies.s002",
        "29-game-types-queues-and-lobbies.s004",
        "29-game-types-queues-and-lobbies.s005",
        "29-game-types-queues-and-lobbies.s006",
        "29-game-types-queues-and-lobbies.s009",
        "29-game-types-queues-and-lobbies.s010",
        "30-formats-and-ranked-competition.s005",
        "30-formats-and-ranked-competition.s011",
        "18-acceptance-tests.s010",
        "18-acceptance-tests.s012"
      ],
      [
        "implement queue tickets keyed by gameType and formatId for ranked and unranked entry",
        "require ladderId for ranked tickets and omit it for unranked tickets",
        "create matches only through validated server-side queue flow rather than client-constructed match payloads",
        "stamp created matches with immutable gameType, formatId, ladderId when applicable, and queue provenance"
      ],
      [
        "custom lobby creation and password handling",
        "Elo update calculations",
        "tournament organizer flows"
      ],
      ["SRV-001", "DB-001"],
      [
        "ranked queue admits only queue-eligible and rating-eligible formats",
        "unranked queue-created matches stamp gameType and formatId correctly without ladder updates",
        "queue-created matches do not expose host-tunable fairness knobs such as arbitrary spectator settings",
        "clients cannot bypass server validation by constructing a match directly"
      ],
      [
        "protocol or service test covering ranked queue eligibility by format",
        "protocol or service test covering queue-created unranked match stamping",
        "service test covering ladderId presence for ranked and absence for unranked"
      ],
      "fail_and_escalate"
    )
  },
  {
    id: "custom-lobby-baseline",
    description:
      "Extract custom lobby creation and join rules from the game-type spec.",
    requiredSpecRefs: [
      "29-game-types-queues-and-lobbies.s007",
      "29-game-types-queues-and-lobbies.s008",
      "29-game-types-queues-and-lobbies.s009",
      "29-game-types-queues-and-lobbies.s010",
      "18-acceptance-tests.s010"
    ],
    seed: createSeed(
      "LOB-001",
      "Implement custom lobby creation, join, and spectator-policy constraints",
      "implementation",
      "server",
      "medium",
      "Build the first custom-lobby session flow with optional password support, allowed spectator-policy selection, and immutable lobby-derived match metadata.",
      [
        "29-game-types-queues-and-lobbies.s007",
        "29-game-types-queues-and-lobbies.s008",
        "29-game-types-queues-and-lobbies.s009",
        "29-game-types-queues-and-lobbies.s010",
        "18-acceptance-tests.s010",
        "11-testing-quality.s013"
      ],
      [
        "implement custom-lobby creation and join flows with optional password hashing",
        "restrict host-configurable spectator modes to allowed policy bounds",
        "carry lobby-derived formatId and spectator policy into created matches as immutable session metadata",
        "support rematch-friendly lobby workflow without turning custom into a rated path"
      ],
      [
        "ranked queue entry",
        "rating updates",
        "tournament-only organizer layers"
      ],
      ["SRV-001", "QUE-001"],
      [
        "custom lobbies can be created and joined with optional password support",
        "incorrect passwords are rejected without writing plaintext password material to durable logs",
        "hosts can select only allowed spectator policies for custom sessions",
        "custom matches never update Elo or ladder history"
      ],
      [
        "service test covering custom lobby creation and passworded join",
        "service test covering rejection of incorrect password",
        "policy test covering allowed spectator mode selection",
        "service test proving custom matches do not stamp ladder updates"
      ],
      "fail_and_escalate"
    )
  },
  {
    id: "format-registry-and-ranked-policy",
    description:
      "Extract format, ladder, Elo, and disconnect discipline work from ranked-policy sections.",
    requiredSpecRefs: [
      "30-formats-and-ranked-competition.s003",
      "30-formats-and-ranked-competition.s004",
      "30-formats-and-ranked-competition.s006",
      "30-formats-and-ranked-competition.s007",
      "30-formats-and-ranked-competition.s008"
    ],
    seed: createSeed(
      "FMT-001",
      "Implement the format registry, ladderId derivation, and simple Elo policy baseline",
      "implementation",
      "contracts",
      "high",
      "Define the first format registry and ranked-policy contract so queue eligibility, ladder identity, Elo updates, and disconnect discipline are driven by explicit profiles instead of loose strings.",
      [
        "22-v6-implementation-tightening.s021",
        "22-v6-implementation-tightening.s022",
        "30-formats-and-ranked-competition.s003",
        "30-formats-and-ranked-competition.s004",
        "30-formats-and-ranked-competition.s005",
        "30-formats-and-ranked-competition.s006",
        "30-formats-and-ranked-competition.s007",
        "30-formats-and-ranked-competition.s008",
        "30-formats-and-ranked-competition.s009",
        "30-formats-and-ranked-competition.s010",
        "30-formats-and-ranked-competition.s011",
        "10-database-schema.s013",
        "18-acceptance-tests.s012"
      ],
      [
        "define the canonical FormatProfile registry and ladderId derivation rule for the first ranked wave",
        "implement simple Elo calculations with the specified launch defaults",
        "classify grace-expired disconnect outcomes and compute ranked lockout escalation policy",
        "keep ranked eligibility tied to explicit queueEligible and ratingEligible format flags"
      ],
      [
        "rank tiers, decay, placements, or bonus systems beyond simple Elo v1",
        "tournament-specific ladder overlays",
        "custom and unranked rating updates"
      ],
      ["CON-001", "QUE-001", "DB-001"],
      [
        "format profiles drive queue eligibility and rating eligibility rather than ad hoc string checks",
        "ladderId derives as ranked:formatId:seasonId for the initial ranked wave",
        "simple Elo updates use the canonical formula and launch defaults",
        "grace-expired ranked disconnects classify correctly and feed disconnect discipline escalation"
      ],
      [
        "contract test covering canonical FormatProfile shape and ladderId derivation",
        "service or unit test covering simple Elo update math",
        "policy test covering ranked disconnect strike escalation and lockout mapping",
        "service test proving unranked and custom do not update Elo"
      ],
      "fail_and_escalate"
    )
  }
];

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function lookupSections(specRefs: string[]): Map<string, SectionEntry> {
  const sectionIndex = loadSectionIndex();
  const sectionLookup = new Map(
    sectionIndex.sections.map((section) => [section.section_ref, section])
  );
  for (const specRef of specRefs) {
    if (!sectionLookup.has(specRef)) {
      throw new Error(`Missing section ref in section-index.json: ${specRef}`);
    }
  }
  return sectionLookup;
}

export function getProfileSpecRefs(
  profileName: keyof typeof DEFAULT_PROFILE_REFS
): string[] {
  return [...DEFAULT_PROFILE_REFS[profileName]];
}

export function listProfileNames(): string[] {
  return Object.keys(DEFAULT_PROFILE_REFS).sort();
}

export function resolveSelectedSpecRefs(
  profileName?: string,
  explicitSpecRefs?: string[]
): string[] {
  const refs = new Set<string>();

  if (profileName) {
    if (!(profileName in DEFAULT_PROFILE_REFS)) {
      throw new Error(
        `Unknown profile ${JSON.stringify(profileName)}. Available profiles: ${listProfileNames().join(", ")}`
      );
    }
    for (const specRef of DEFAULT_PROFILE_REFS[
      profileName as keyof typeof DEFAULT_PROFILE_REFS
    ]) {
      refs.add(specRef);
    }
  }

  for (const specRef of explicitSpecRefs ?? []) {
    refs.add(specRef);
  }

  const resolved = unique(refs);
  if (resolved.length === 0) {
    throw new Error(
      "No source sections selected. Pass --profile initial-foundation or --spec-refs <comma-separated refs>."
    );
  }

  lookupSections(resolved);
  return resolved;
}

export function extractStoriesFromSpecRefs(
  selectedSpecRefs: string[]
): ExtractionResult {
  const sectionLookup = lookupSections(selectedSpecRefs);
  const selectedSet = new Set(selectedSpecRefs);

  const matchedRules = EXTRACTION_RULES.filter((rule) =>
    rule.requiredSpecRefs.every((specRef) => selectedSet.has(specRef))
  ).sort((left, right) => left.seed.id.localeCompare(right.seed.id));

  const stories = matchedRules.map((rule) =>
    createGeneratedStory(rule.seed, sectionLookup)
  );

  return {
    matchedRules: matchedRules.map((rule) => ({
      id: rule.id,
      description: rule.description,
      requiredSpecRefs: [...rule.requiredSpecRefs],
      storyId: rule.seed.id
    })),
    stories,
    selectedSpecRefs: unique(selectedSpecRefs)
  };
}

export function writeExtractedStories(
  stories: Story[],
  outputDir: string
): string[] {
  ensureDirectory(outputDir);
  const written: string[] = [];
  for (const story of [...stories].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const outputPath = `${outputDir}/${story.id}.story.yaml`;
    writeUtf8(outputPath, storyToYaml(story));
    written.push(outputPath);
  }
  return written;
}

export function buildLlmPromptPack(selectedSpecRefs: string[]): LlmPromptPack {
  const sectionLookup = lookupSections(selectedSpecRefs);
  const sourceSections = [...selectedSpecRefs].sort().map((specRef) => {
    const section = sectionLookup.get(specRef);
    if (!section) {
      throw new Error(`Missing section ref in section-index.json: ${specRef}`);
    }
    return {
      specRef,
      heading: section.heading,
      path: section.path,
      excerpt: extractSectionExcerpt(section)
    };
  });

  const authorityOrder = [
    "cited specification sections",
    "approved story file",
    "generated agent packet",
    "AGENTS.md instructions",
    "local code reality",
    "proposed patch"
  ];

  const generationRules = [
    "The specification is authoritative.",
    "Do not invent features not supported by the text.",
    "Break work into small, reviewable stories that fit one main implementation unit.",
    "Use the canonical story schema.",
    "Include exact spec references whenever possible.",
    "Include explicit scope, non-scope, acceptance criteria, required tests, and dependencies.",
    "If the specification is ambiguous, create an ambiguity story instead of silently assuming behavior.",
    "Prefer fail_and_escalate for gameplay, hidden-information, replay, fairness, timer, and persistence behavior."
  ];

  const outputRules = [
    "Output one YAML object per story, separated by ---.",
    "Set status to generated.",
    "Cite only section refs present in the provided source sections unless a cited dependency is directly required by those sections.",
    "Do not output prose outside the YAML stories."
  ];

  const prompt = [
    "Read the provided OPTCG simulator specification sections and extract implementation-ready backlog items.",
    "",
    "Authority order:",
    ...authorityOrder.map((item, index) => `${index + 1}. ${item}`),
    "",
    "Generation rules:",
    ...generationRules.map((item) => `- ${item}`),
    "",
    "Output rules:",
    ...outputRules.map((item) => `- ${item}`),
    "",
    "Schema path: contracts/story.schema.json",
    "Selected source sections:",
    ...sourceSections.map(
      (section) =>
        `- ${section.specRef} (${section.heading}) -> ${section.path}`
    )
  ].join("\n");

  return {
    mode: "story-generation",
    schemaPath: "contracts/story.schema.json",
    selectedSpecRefs: unique(selectedSpecRefs),
    sourceSections,
    authorityOrder,
    generationRules,
    outputRules,
    prompt
  };
}
