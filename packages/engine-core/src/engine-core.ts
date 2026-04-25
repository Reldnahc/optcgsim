import { createHash } from "node:crypto";
import type {
  Action,
  CardInstance,
  DecisionResponse,
  EngineEvent,
  EngineResult,
  GameState,
  HiddenZoneView,
  InstanceId,
  JsonValue,
  LifeCard,
  PendingDecision,
  PlayerId,
  PlayerState,
  PlayerView,
  PublicCardView,
  PublicLegalAction,
  PublicLifeAreaView,
  PublicTimerState,
  Sha256,
  StateSeq
} from "@optcg/types";
import type {
  ComputedCardView,
  ComputedGameView,
  CreateInitialStateInput
} from "./types.js";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function toJsonValue<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value).filter(
    ([, entry]) => entry !== undefined
  );
  entries.sort(([left], [right]) => compareStrings(left, right));

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function isTestMode(): boolean {
  return (
    process.env["OPTCG_ENGINE_TEST_MODE"] === "true" ||
    process.env["NODE_ENV"] === "test" ||
    process.env["VITEST"] === "true"
  );
}

function getPlayerIds(state: GameState): PlayerId[] {
  return Object.keys(state.players) as PlayerId[];
}

function getOpponentId(state: GameState, playerId: PlayerId): PlayerId {
  return (
    getPlayerIds(state).find((candidate) => candidate !== playerId) ?? playerId
  );
}

function toStateSeq(value: number): StateSeq {
  return value as StateSeq;
}

function toActionSeq(value: number): GameState["actionSeq"] {
  return value as GameState["actionSeq"];
}

function toSha256(value: string): Sha256 {
  return value as Sha256;
}

function resolveCardMetadata(state: GameState, card: CardInstance) {
  const manifestCard = state.cardManifest.cards[card.cardId];
  return {
    keywords: manifestCard?.printedKeywords
      ? [...manifestCard.printedKeywords]
      : [],
    power: manifestCard?.power,
    cost: manifestCard?.cost
  };
}

function toPublicCardView(
  state: GameState,
  card: CardInstance
): PublicCardView {
  const metadata = resolveCardMetadata(state, card);
  const publicCard: PublicCardView = {
    instanceId: card.instanceId,
    cardId: card.cardId,
    controller: card.controller,
    owner: card.owner,
    state: card.state,
    attachedDonCount: card.attachedDon.length,
    keywords: [...metadata.keywords]
  };

  if (metadata.power !== undefined) {
    publicCard.computedPower = metadata.power;
  }

  if (metadata.cost !== undefined) {
    publicCard.computedCost = metadata.cost;
  }

  return publicCard;
}

function toHiddenZoneView(cards: CardInstance[]): HiddenZoneView {
  return { count: cards.length };
}

function buildLifeView(
  state: GameState,
  life: LifeCard[],
  viewerOwnsLife: boolean
): PublicLifeAreaView {
  const faceUpCards =
    viewerOwnsLife || life.some((entry) => entry.faceUp)
      ? life
          .filter((entry) => entry.faceUp)
          .map((entry) => toPublicCardView(state, entry.card))
      : [];

  return {
    count: life.length,
    faceUpCards
  };
}

function buildVisiblePlayerState(state: GameState, player: PlayerState) {
  const visible = {
    playerId: player.playerId,
    deck: toHiddenZoneView(player.deck),
    donDeck: toHiddenZoneView(player.donDeck),
    hand: player.hand.map((card) => toPublicCardView(state, card)),
    trash: player.trash.map((card) => toPublicCardView(state, card)),
    leader: toPublicCardView(state, player.leader),
    characters: player.characters.map((card) => toPublicCardView(state, card)),
    costArea: player.costArea.map((card) => toPublicCardView(state, card)),
    life: buildLifeView(state, player.life, true)
  };

  if (player.stage) {
    return {
      ...visible,
      stage: toPublicCardView(state, player.stage)
    };
  }

  return visible;
}

function buildOpponentVisibleState(state: GameState, player: PlayerState) {
  const visible = {
    playerId: player.playerId,
    deck: toHiddenZoneView(player.deck),
    donDeck: toHiddenZoneView(player.donDeck),
    hand: toHiddenZoneView(player.hand),
    trash: player.trash.map((card) => toPublicCardView(state, card)),
    leader: toPublicCardView(state, player.leader),
    characters: player.characters.map((card) => toPublicCardView(state, card)),
    costArea: player.costArea.map((card) => toPublicCardView(state, card)),
    life: buildLifeView(state, player.life, false)
  };

  if (player.stage) {
    return {
      ...visible,
      stage: toPublicCardView(state, player.stage)
    };
  }

  return visible;
}

function buildTimerState(state: GameState): PublicTimerState {
  const players = Object.fromEntries(
    getPlayerIds(state).map((playerId) => [
      playerId,
      {
        playerId,
        remainingMs: 0,
        isRunning: false
      }
    ])
  ) as PublicTimerState["players"];

  return { players };
}

interface PlayerCardEntry {
  card: CardInstance;
  storage:
    | "deck"
    | "donDeck"
    | "hand"
    | "trash"
    | "leader"
    | "characters"
    | "stage"
    | "costArea"
    | "life"
    | "attachedCards";
  playerId: PlayerId;
  index?: number;
}

function collectRawCardsFromPlayerState(
  player: PlayerState
): PlayerCardEntry[] {
  const entries: PlayerCardEntry[] = [];

  player.deck.forEach((card, index) => {
    entries.push({ card, storage: "deck", playerId: player.playerId, index });
  });
  player.donDeck.forEach((card, index) => {
    entries.push({
      card,
      storage: "donDeck",
      playerId: player.playerId,
      index
    });
  });
  player.hand.forEach((card, index) => {
    entries.push({ card, storage: "hand", playerId: player.playerId, index });
  });
  player.trash.forEach((card, index) => {
    entries.push({ card, storage: "trash", playerId: player.playerId, index });
  });

  entries.push({
    card: player.leader,
    storage: "leader",
    playerId: player.playerId
  });

  player.characters.forEach((card, index) => {
    entries.push({
      card,
      storage: "characters",
      playerId: player.playerId,
      index
    });
  });

  if (player.stage) {
    entries.push({
      card: player.stage,
      storage: "stage",
      playerId: player.playerId
    });
  }

  player.costArea.forEach((card, index) => {
    entries.push({
      card,
      storage: "costArea",
      playerId: player.playerId,
      index
    });
  });

  player.life.forEach((lifeCard, index) => {
    entries.push({
      card: lifeCard.card,
      storage: "life",
      playerId: player.playerId,
      index
    });
  });

  player.attachedCards.forEach((card, index) => {
    entries.push({
      card,
      storage: "attachedCards",
      playerId: player.playerId,
      index
    });
  });

  return entries;
}

function collectRawCards(state: GameState): PlayerCardEntry[] {
  return getPlayerIds(state).flatMap((playerId) => {
    const player = state.players[playerId];
    if (!player) {
      return [];
    }
    return collectRawCardsFromPlayerState(player);
  });
}

function collectAllCards(state: GameState): CardInstance[] {
  const seen = new Set<string>();
  const cards: CardInstance[] = [];

  for (const entry of collectRawCards(state)) {
    if (seen.has(entry.card.instanceId)) {
      continue;
    }
    seen.add(entry.card.instanceId);
    cards.push(entry.card);
  }

  return cards;
}

function expectedZoneName(
  entry: PlayerCardEntry
): CardInstance["zone"]["zone"] {
  switch (entry.storage) {
    case "deck":
      return "deck";
    case "donDeck":
      return "donDeck";
    case "hand":
      return "hand";
    case "trash":
      return "trash";
    case "leader":
      return "leaderArea";
    case "characters":
      return "characterArea";
    case "stage":
      return "stageArea";
    case "costArea":
      return "costArea";
    case "life":
      return "life";
    case "attachedCards":
      return "attached";
  }
}

function assertAllCardsInExactlyOneLocation(state: GameState): void {
  for (const entry of collectRawCards(state)) {
    const expectedZone = expectedZoneName(entry);
    if (entry.card.zone.zone !== expectedZone) {
      throw new Error(
        `Card ${entry.card.instanceId} stored in ${entry.storage} but zone says ${entry.card.zone.zone}`
      );
    }

    if (
      entry.card.zone.zone !== "noZone" &&
      "playerId" in entry.card.zone &&
      entry.card.zone.playerId !== entry.playerId
    ) {
      throw new Error(
        `Card ${entry.card.instanceId} has mismatched playerId in zone metadata`
      );
    }

    if (
      entry.index !== undefined &&
      entry.card.zone.zone !== "leaderArea" &&
      entry.card.zone.zone !== "stageArea" &&
      entry.card.zone.zone !== "noZone" &&
      entry.card.zone.index !== undefined &&
      entry.card.zone.index !== entry.index
    ) {
      throw new Error(
        `Card ${entry.card.instanceId} has stale index metadata for ${entry.storage}`
      );
    }
  }
}

function assertNoDuplicateInstanceIds(state: GameState): void {
  const counts = new Map<string, number>();

  for (const entry of collectRawCards(state)) {
    counts.set(
      entry.card.instanceId,
      (counts.get(entry.card.instanceId) ?? 0) + 1
    );
  }

  const duplicate = [...counts.entries()].find(([, count]) => count > 1)?.[0];
  if (duplicate) {
    throw new Error(`Duplicate instance id detected: ${duplicate}`);
  }
}

function assertCharacterAreaSizeAtMostFive(state: GameState): void {
  for (const playerId of getPlayerIds(state)) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }
    if (player.characters.length > 5) {
      throw new Error(`Player ${playerId} exceeds character area limit`);
    }
  }
}

function assertStageAreaSizeAtMostOne(state: GameState): void {
  for (const playerId of getPlayerIds(state)) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }
    if (
      Array.isArray((player as { stage?: CardInstance | CardInstance[] }).stage)
    ) {
      throw new Error(`Player ${playerId} has multiple stage cards`);
    }
  }
}

function assertLeaderAreaExactlyOne(state: GameState): void {
  for (const playerId of getPlayerIds(state)) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }
    if (!player.leader) {
      throw new Error(`Player ${playerId} is missing a leader`);
    }
    if (player.leader.zone.zone !== "leaderArea") {
      throw new Error(`Player ${playerId} leader has invalid zone metadata`);
    }
  }
}

function assertAttachedDonConsistency(state: GameState): void {
  for (const playerId of getPlayerIds(state)) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }
    const attachedById = new Map(
      player.attachedCards.map((card) => [card.instanceId, card])
    );

    const hosts = [player.leader, ...player.characters];
    const referenced = new Set<string>();

    for (const host of hosts) {
      for (const attachedId of host.attachedDon) {
        referenced.add(attachedId);
        const attached = attachedById.get(attachedId);
        if (!attached) {
          throw new Error(
            `Host ${host.instanceId} references missing attached card ${attachedId}`
          );
        }
        if (attached.zone.zone !== "attached") {
          throw new Error(
            `Attached card ${attachedId} is not in attached zone`
          );
        }
        if (attached.zone.playerId !== player.playerId) {
          throw new Error(
            `Attached card ${attachedId} has wrong controller metadata`
          );
        }
        if (
          attached.zone.zone !== "attached" ||
          attached.zone.hostInstanceId !== host.instanceId
        ) {
          throw new Error(
            `Attached card ${attachedId} points at the wrong host`
          );
        }
        if (attached.state !== "attached") {
          throw new Error(
            `Attached card ${attachedId} must use attached state`
          );
        }
      }
    }

    for (const attached of player.attachedCards) {
      if (attached.zone.zone !== "attached") {
        throw new Error(
          `Attached storage card ${attached.instanceId} must be in attached zone`
        );
      }
      if (attached.zone.playerId !== player.playerId) {
        throw new Error(
          `Attached storage card ${attached.instanceId} has wrong playerId`
        );
      }
      const host = hosts.find((candidate) => {
        return (
          attached.zone.zone === "attached" &&
          candidate.instanceId === attached.zone.hostInstanceId
        );
      });
      if (!host) {
        throw new Error(
          `Attached storage card ${attached.instanceId} points at missing host`
        );
      }
      if (!referenced.has(attached.instanceId)) {
        throw new Error(
          `Attached storage card ${attached.instanceId} is not referenced by its host`
        );
      }
    }
  }
}

function assertPendingDecisionIsValid(state: GameState): void {
  if (!state.pendingDecision) {
    return;
  }

  if (!(state.pendingDecision.playerId in state.players)) {
    throw new Error("Pending decision references a missing player");
  }
}

function assertEffectQueueEntriesAreResolvableOrCancelled(
  state: GameState
): void {
  for (const entry of state.effectQueue) {
    if (
      entry.state !== "pending" &&
      entry.state !== "resolving" &&
      entry.state !== "resolved" &&
      entry.state !== "cancelled"
    ) {
      throw new Error(`Unexpected effect queue state for ${entry.id}`);
    }
  }
}

function assertNoIllegalHiddenInfoInViews(state: GameState): void {
  for (const playerId of getPlayerIds(state)) {
    const view = filterStateForPlayer(state, playerId);
    const opponentId = getOpponentId(state, playerId);
    const actualOpponent = state.players[opponentId];
    if (!actualOpponent) {
      continue;
    }

    const opponentHand = view.opponent.hand as HiddenZoneView & {
      cards?: unknown;
    };
    if ("cards" in opponentHand) {
      throw new Error("Opponent hand contents leaked into PlayerView");
    }
    if (opponentHand.count !== actualOpponent.hand.length) {
      throw new Error("Opponent hand count mismatch in PlayerView");
    }
    if ("rng" in (view as unknown as Record<string, unknown>)) {
      throw new Error("RNG state leaked into PlayerView");
    }
    if ("effectQueue" in (view as unknown as Record<string, unknown>)) {
      throw new Error("Effect queue leaked into PlayerView");
    }
  }
}

function assertStateHashStable(state: GameState): void {
  const first = hashGameState(state);
  const second = hashGameState(state);
  if (first !== second) {
    throw new Error("State hash is not stable across repeated runs");
  }
}

function runInvariantChecks(state: GameState): void {
  assertAllCardsInExactlyOneLocation(state);
  assertNoDuplicateInstanceIds(state);
  assertCharacterAreaSizeAtMostFive(state);
  assertStageAreaSizeAtMostOne(state);
  assertLeaderAreaExactlyOne(state);
  assertAttachedDonConsistency(state);
  assertPendingDecisionIsValid(state);
  assertEffectQueueEntriesAreResolvableOrCancelled(state);
  assertNoIllegalHiddenInfoInViews(state);
  assertStateHashStable(state);
}

function appendEvent(
  state: GameState,
  event: Omit<EngineEvent, "id" | "eventSeq" | "stateSeq">
): EngineEvent {
  const engineEvent: EngineEvent = {
    id: `evt-${state.eventJournal.length + 1}` as unknown as EngineEvent["id"],
    eventSeq: state.eventJournal.length + 1,
    stateSeq: state.stateSeq,
    ...event
  };
  state.eventJournal.push(engineEvent);
  return engineEvent;
}

function finalizeResult(state: GameState, events: EngineEvent[]): EngineResult {
  if (isTestMode()) {
    runInvariantChecks(state);
  }

  const stateHash = hashGameState(state);
  const result: EngineResult = {
    state,
    events,
    publicEvents: [],
    stateHash
  };

  if (state.pendingDecision) {
    result.pendingDecision = state.pendingDecision;
  }

  return result;
}

function cloneStateForMutation(state: GameState): GameState {
  return cloneValue(state);
}

export function createInitialState(input: CreateInitialStateInput): GameState {
  const state: GameState = {
    matchId: input.matchId,
    stateSeq: toStateSeq(0),
    actionSeq: toActionSeq(0),
    rulesVersion: input.rulesVersion,
    engineVersion: input.engineVersion,
    cardManifest: cloneValue(input.cardManifest),
    matchConfig: cloneValue(input.matchConfig),
    rng: cloneValue(input.rng),
    players: cloneValue(input.players),
    turn: cloneValue(input.turn),
    effectQueue: [],
    continuousEffects: [],
    oncePerTurn: [],
    replacementState: [],
    eventJournal: [],
    status: input.status ?? "active"
  };

  if (input.battle) {
    state.battle = cloneValue(input.battle);
  }
  if (input.pendingDecision) {
    state.pendingDecision = cloneValue(input.pendingDecision);
  }
  if (input.winner !== undefined) {
    state.winner = cloneValue(input.winner);
  }

  if (isTestMode()) {
    runInvariantChecks(state);
  }

  return state;
}

export function hashGameState(state: GameState): Sha256 {
  return toSha256(
    createHash("sha256").update(stableStringify(state), "utf8").digest("hex")
  );
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId
): Action[] {
  if (!(playerId in state.players)) {
    return [];
  }

  if (
    state.status === "frozen" ||
    state.status === "completed" ||
    state.status === "errored"
  ) {
    return [];
  }

  return [
    {
      type: "concede",
      playerId
    }
  ];
}

export function applyAction(state: GameState, action: Action): EngineResult {
  if (
    state.status === "frozen" ||
    state.status === "completed" ||
    state.status === "errored"
  ) {
    throw new Error("Cannot mutate a frozen or terminal match");
  }

  if (action.type !== "concede") {
    throw new Error(`Unsupported action in ENG-001 bootstrap: ${action.type}`);
  }

  if (!(action.playerId in state.players)) {
    throw new Error("Concede references an unknown player");
  }

  const nextState = cloneStateForMutation(state);
  nextState.stateSeq = toStateSeq(Number(nextState.stateSeq) + 1);
  nextState.actionSeq = toActionSeq(Number(nextState.actionSeq) + 1);
  delete nextState.pendingDecision;
  delete nextState.battle;
  nextState.status = "completed";
  nextState.winner = getOpponentId(nextState, action.playerId);

  const event = appendEvent(nextState, {
    type: "gameOver",
    actor: action.playerId,
    payload: toJsonValue({
      reason: "concede",
      loser: action.playerId,
      winner: nextState.winner
    }),
    causedBy: { type: "action", actionSeq: nextState.actionSeq },
    visibility: { type: "public" }
  });

  return finalizeResult(nextState, [event]);
}

export function resumeDecision(
  state: GameState,
  decisionId: PendingDecision["id"],
  response: DecisionResponse
): EngineResult {
  if (
    state.status === "frozen" ||
    state.status === "completed" ||
    state.status === "errored"
  ) {
    throw new Error("Cannot resolve decisions in a frozen or terminal match");
  }

  if (!state.pendingDecision || state.pendingDecision.id !== decisionId) {
    throw new Error("No matching pending decision is active");
  }

  void response;
  throw new Error("Decision runtime is out of scope for ENG-001 bootstrap");
}

export function computeView(state: GameState): ComputedGameView {
  const cards: Record<InstanceId, ComputedCardView> = {};

  for (const card of collectAllCards(state)) {
    const metadata = resolveCardMetadata(state, card);
    const computedCard: ComputedCardView = {
      instanceId: card.instanceId,
      cardId: card.cardId,
      keywords: [...metadata.keywords],
      canAttack: false,
      canBlock: false,
      cannotBeAttacked: false,
      protectedFrom: []
    };
    if (metadata.power !== undefined) {
      computedCard.basePower = metadata.power;
      computedCard.currentPower = metadata.power;
    }
    if (metadata.cost !== undefined) {
      computedCard.baseCost = metadata.cost;
      computedCard.currentCost = metadata.cost;
    }
    cards[card.instanceId] = computedCard;
  }

  return {
    seq: state.stateSeq,
    turnPlayerId: state.turn.activePlayer,
    cards,
    legalAttackTargets: {},
    restrictions: {}
  };
}

export function filterStateForPlayer(
  state: GameState,
  playerId: PlayerId
): PlayerView {
  const self = state.players[playerId];
  if (!self) {
    throw new Error(`Unknown playerId for PlayerView: ${playerId}`);
  }

  const opponentId = getOpponentId(state, playerId);
  const opponent = state.players[opponentId];
  if (!opponent) {
    throw new Error(`Unknown opponent for PlayerView: ${playerId}`);
  }

  const legalActions = getLegalActions(state, playerId).map(
    (action): PublicLegalAction => ({ ...action })
  );

  const view: PlayerView = {
    matchId: state.matchId,
    playerId,
    stateSeq: state.stateSeq,
    actionSeq: state.actionSeq,
    turn: cloneValue(state.turn),
    self: buildVisiblePlayerState(state, self),
    opponent: buildOpponentVisibleState(state, opponent),
    legalActions,
    revealedCards: [],
    effectEvents: [],
    timers: buildTimerState(state)
  };

  if (state.battle) {
    view.battle = cloneValue(state.battle);
  }

  return view;
}
