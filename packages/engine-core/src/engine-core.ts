import { createHash } from "node:crypto";
import type {
  Action,
  CardInstance,
  CardRef,
  CardSnapshot,
  DecisionResponse,
  EngineEvent,
  EngineResult,
  EventVisibility,
  GameState,
  HiddenZoneView,
  InstanceId,
  LivePublicEffectEvent,
  LivePublicRevealRecord,
  PendingDecision,
  PlayerId,
  PlayerState,
  PlayerView,
  TargetRequest,
  CardSelectionRequest,
  PublicCardRef,
  PublicCardSelectionRequest,
  PublicCardView,
  PublicDecision,
  PublicDecisionCardRef,
  PublicDecisionVisibility,
  PublicEffectOption,
  PublicLegalAction,
  PublicLifeAreaView,
  PublicPaymentCardRef,
  PublicPaymentOption,
  PublicPlayerGameTimer,
  PublicReplacementOption,
  PublicTargetRequest,
  PublicTimerState,
  PublicTriggerOrderOption,
  Keyword,
  Sha256,
  ZoneRef
} from "@optcg/types";
import type {
  ComputedCardView,
  ComputedGameView,
  CreateInitialStateInput
} from "./types.js";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
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
  entries.sort(([left], [right]) => left.localeCompare(right));

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

function resolveCardMetadata(
  state: GameState,
  card: CardInstance | CardSnapshot
): {
  name?: string;
  power?: number;
  cost?: number;
  keywords: Keyword[];
} {
  const manifestCard = state.cardManifest.cards[card.cardId];
  const metadata: {
    name?: string;
    power?: number;
    cost?: number;
    keywords: Keyword[];
  } = {
    keywords: manifestCard?.printedKeywords
      ? [...manifestCard.printedKeywords]
      : []
  };

  const explicitName = "name" in card ? card.name : manifestCard?.name;
  if (explicitName !== undefined) {
    metadata.name = explicitName;
  }

  const explicitPower =
    "power" in card && card.power !== undefined
      ? card.power
      : manifestCard?.power;
  if (explicitPower !== undefined) {
    metadata.power = explicitPower;
  }

  const explicitCost =
    "cost" in card && card.cost !== undefined ? card.cost : manifestCard?.cost;
  if (explicitCost !== undefined) {
    metadata.cost = explicitCost;
  }

  return metadata;
}

function getCardLikeInstanceId(card: CardInstance | CardSnapshot): InstanceId {
  const instanceId = card.instanceId;
  if (!instanceId) {
    throw new Error(
      "Expected card snapshot with instanceId for public projection"
    );
  }
  return instanceId;
}

function toPublicCardView(
  state: GameState,
  card: CardInstance | CardSnapshot
): PublicCardView {
  const metadata = resolveCardMetadata(state, card);
  const publicCard: PublicCardView = {
    instanceId: getCardLikeInstanceId(card),
    cardId: card.cardId,
    controller: card.controller,
    owner: card.owner,
    state: card.state,
    attachedDonCount:
      "attachedDonCount" in card
        ? card.attachedDonCount
        : card.attachedDon.length,
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

function isZoneIdentityVisible(
  zone: ZoneRef | undefined,
  viewerId: PlayerId
): boolean {
  if (!zone) {
    return false;
  }

  switch (zone.zone) {
    case "hand":
      return zone.playerId === viewerId;
    case "deck":
    case "donDeck":
    case "life":
      return false;
    case "trash":
    case "leaderArea":
    case "characterArea":
    case "stageArea":
    case "costArea":
    case "attached":
    case "noZone":
      return true;
    default:
      return false;
  }
}

function isSnapshotVisible(
  snapshot: CardSnapshot | undefined,
  viewerId: PlayerId
): boolean {
  return isZoneIdentityVisible(snapshot?.zone, viewerId);
}

function requireInstanceId(ref: CardRef): InstanceId {
  const instanceId = ref.instanceId ?? ref.snapshot?.instanceId;
  if (!instanceId) {
    throw new Error("Expected CardRef with instanceId for public projection");
  }
  return instanceId;
}

function toPublicCardRef(ref: CardRef): PublicCardRef {
  return {
    instanceId: requireInstanceId(ref),
    cardId: ref.cardId,
    owner: ref.owner,
    controller: ref.controller
  };
}

function toPublicDecisionCardRef(
  ref: CardRef,
  viewerId: PlayerId
): PublicDecisionCardRef {
  const base: PublicDecisionCardRef = {
    instanceId: requireInstanceId(ref),
    owner: ref.owner,
    controller: ref.controller
  };

  if (
    isZoneIdentityVisible(ref.zone, viewerId) ||
    isSnapshotVisible(ref.snapshot, viewerId)
  ) {
    base.cardId = ref.cardId;
  }

  return base;
}

function toPublicPaymentCardRef(ref: CardRef): PublicPaymentCardRef {
  const zone = ref.zone ?? ref.snapshot?.zone;
  if (!zone) {
    throw new Error(
      "Expected CardRef with zone information for payment selection"
    );
  }

  const publicRef: PublicPaymentCardRef = {
    ...toPublicCardRef(ref),
    zone
  };

  return publicRef;
}

function toPublicTargetRequest(request: TargetRequest): PublicTargetRequest {
  const publicRequest: PublicTargetRequest = {
    timing: request.timing,
    chooser: request.chooser,
    zone: request.zone,
    player: request.player,
    min: request.min,
    max: request.max,
    allowFewerIfUnavailable: request.allowFewerIfUnavailable
  };

  if (request.visibility !== undefined) {
    publicRequest.visibility = request.visibility;
  }

  return publicRequest;
}

function toPublicCardSelectionRequest(
  request: CardSelectionRequest
): PublicCardSelectionRequest {
  if (request.visibility === "replayOnly") {
    throw new Error(
      "Cannot project replay-only card selection requests into PlayerView"
    );
  }

  const publicRequest: PublicCardSelectionRequest = {
    chooser: request.chooser,
    min: request.min,
    max: request.max,
    allowFewerIfUnavailable: request.allowFewerIfUnavailable,
    visibility: request.visibility
  };

  if (request.zone !== undefined) {
    publicRequest.zone = request.zone;
  }
  if (request.player !== undefined) {
    publicRequest.player = request.player;
  }

  return publicRequest;
}

function toPublicDecisionVisibility(
  visibility: EventVisibility,
  viewerId: PlayerId
): PublicDecisionVisibility | undefined {
  switch (visibility.type) {
    case "public":
      return visibility;
    case "private":
      return visibility.playerIds.includes(viewerId) ? visibility : undefined;
    case "replayOnly":
    case "serverOnly":
      return undefined;
    default:
      return undefined;
  }
}

function toPublicDecision(
  pendingDecision: PendingDecision | undefined,
  viewerId: PlayerId
): PublicDecision | undefined {
  if (!pendingDecision) {
    return undefined;
  }

  const visibility = toPublicDecisionVisibility(
    pendingDecision.visibility,
    viewerId
  );
  if (!visibility) {
    return undefined;
  }

  const base = {
    id: pendingDecision.id,
    type: pendingDecision.type,
    playerId: pendingDecision.playerId,
    visibility
  } as const;

  const withOptionalBaseFields = <T extends Record<string, unknown>>(
    value: T
  ): T => {
    const next = { ...value } as T & {
      prompt?: string;
      timeoutMs?: number;
      defaultResponse?: DecisionResponse;
    };
    if (pendingDecision.prompt !== undefined) {
      next.prompt = pendingDecision.prompt;
    }
    if (pendingDecision.timeoutMs !== undefined) {
      next.timeoutMs = pendingDecision.timeoutMs;
    }
    if (pendingDecision.defaultResponse !== undefined) {
      next.defaultResponse = pendingDecision.defaultResponse;
    }
    return next as T;
  };

  switch (pendingDecision.type) {
    case "mulligan":
      return withOptionalBaseFields({
        ...base,
        type: "mulligan",
        handCount: pendingDecision.handCount
      }) as PublicDecision;
    case "chooseTriggerOrder":
      return withOptionalBaseFields({
        ...base,
        type: "chooseTriggerOrder",
        triggers: pendingDecision.triggerIds.map<PublicTriggerOrderOption>(
          (triggerId) => ({
            triggerId,
            label: `Trigger ${triggerId}`
          })
        )
      }) as PublicDecision;
    case "chooseOptionalActivation":
      return withOptionalBaseFields({
        ...base,
        type: "chooseOptionalActivation",
        effectId: pendingDecision.effectId,
        source: toPublicCardRef(pendingDecision.source),
        options: ["activate", "decline"]
      }) as PublicDecision;
    case "payCost":
      return withOptionalBaseFields({
        ...base,
        type: "payCost",
        cost: cloneValue(pendingDecision.cost),
        options: pendingDecision.options.map<PublicPaymentOption>((option) => {
          const publicOption: PublicPaymentOption = {
            id: option.id,
            cost: cloneValue(option.cost),
            min: option.min,
            max: option.max
          };
          if (option.selectableCards !== undefined) {
            publicOption.selectableCards = option.selectableCards.map(
              toPublicPaymentCardRef
            );
          }
          if (option.selectableDon !== undefined) {
            publicOption.selectableDon = option.selectableDon.map(
              toPublicPaymentCardRef
            );
          }
          return publicOption;
        })
      }) as PublicDecision;
    case "selectTargets":
      return withOptionalBaseFields({
        ...base,
        type: "selectTargets",
        request: toPublicTargetRequest(pendingDecision.request),
        candidates: pendingDecision.candidates.map((candidate) => ({
          card: toPublicDecisionCardRef(candidate, viewerId)
        }))
      }) as PublicDecision;
    case "selectCards":
      return withOptionalBaseFields({
        ...base,
        type: "selectCards",
        request: toPublicCardSelectionRequest(pendingDecision.request),
        candidates: pendingDecision.candidates.map((candidate) => ({
          card: toPublicDecisionCardRef(candidate, viewerId)
        }))
      }) as PublicDecision;
    case "chooseEffectOption":
      return withOptionalBaseFields({
        ...base,
        type: "chooseEffectOption",
        min: pendingDecision.min,
        max: pendingDecision.max,
        options: pendingDecision.options.map<PublicEffectOption>((option) => {
          const publicOption: PublicEffectOption = {
            id: option.id,
            label: option.label
          };
          if (option.availability !== undefined) {
            publicOption.availability = option.availability;
          }
          return publicOption;
        })
      }) as PublicDecision;
    case "confirmTriggerFromLife":
      return withOptionalBaseFields({
        ...base,
        type: "confirmTriggerFromLife",
        card: toPublicCardRef(pendingDecision.card),
        options: ["activateTrigger", "addToHand"]
      }) as PublicDecision;
    case "chooseReplacement":
      return withOptionalBaseFields({
        ...base,
        type: "chooseReplacement",
        processId: pendingDecision.processId,
        optional: pendingDecision.optional,
        replacements:
          pendingDecision.replacementIds.map<PublicReplacementOption>(
            (replacementId) => ({
              replacementId,
              label: replacementId
            })
          )
      }) as PublicDecision;
    case "orderCards":
      return withOptionalBaseFields({
        ...base,
        type: "orderCards",
        destination: pendingDecision.destination,
        cards: pendingDecision.cards.map((card) =>
          toPublicDecisionCardRef(card, viewerId)
        )
      }) as PublicDecision;
    case "chooseCharacterToTrashForOverflow":
      return withOptionalBaseFields({
        ...base,
        type: "chooseCharacterToTrashForOverflow",
        candidates: pendingDecision.candidates.map(toPublicCardRef)
      }) as PublicDecision;
    default:
      return undefined;
  }
}

function buildLifeView(
  state: GameState,
  player: PlayerState
): PublicLifeAreaView {
  return {
    count: player.life.length,
    faceUpCards: player.life
      .filter((lifeCard) => lifeCard.faceUp)
      .map((lifeCard) => toPublicCardView(state, lifeCard.card))
  };
}

function buildVisiblePlayerState(state: GameState, player: PlayerState) {
  const visibleState: {
    playerId: PlayerId;
    deck: HiddenZoneView;
    donDeck: HiddenZoneView;
    hand: PublicCardView[];
    trash: PublicCardView[];
    leader: PublicCardView;
    characters: PublicCardView[];
    stage?: PublicCardView;
    costArea: PublicCardView[];
    life: PublicLifeAreaView;
  } = {
    playerId: player.playerId,
    deck: toHiddenZoneView(player.deck),
    donDeck: toHiddenZoneView(player.donDeck),
    hand: player.hand.map((card) => toPublicCardView(state, card)),
    trash: player.trash.map((card) => toPublicCardView(state, card)),
    leader: toPublicCardView(state, player.leader),
    characters: player.characters.map((card) => toPublicCardView(state, card)),
    costArea: player.costArea.map((card) => toPublicCardView(state, card)),
    life: buildLifeView(state, player)
  };
  if (player.stage) {
    visibleState.stage = toPublicCardView(state, player.stage);
  }
  return visibleState;
}

function buildOpponentVisibleState(state: GameState, player: PlayerState) {
  const visibleState: {
    playerId: PlayerId;
    deck: HiddenZoneView;
    donDeck: HiddenZoneView;
    hand: HiddenZoneView;
    trash: PublicCardView[];
    leader: PublicCardView;
    characters: PublicCardView[];
    stage?: PublicCardView;
    costArea: PublicCardView[];
    life: PublicLifeAreaView;
  } = {
    playerId: player.playerId,
    deck: toHiddenZoneView(player.deck),
    donDeck: toHiddenZoneView(player.donDeck),
    hand: { count: player.hand.length },
    trash: player.trash.map((card) => toPublicCardView(state, card)),
    leader: toPublicCardView(state, player.leader),
    characters: player.characters.map((card) => toPublicCardView(state, card)),
    costArea: player.costArea.map((card) => toPublicCardView(state, card)),
    life: buildLifeView(state, player)
  };
  if (player.stage) {
    visibleState.stage = toPublicCardView(state, player.stage);
  }
  return visibleState;
}

function buildTimerState(state: GameState): PublicTimerState {
  const players = Object.fromEntries(
    getPlayerIds(state).map((playerId) => [
      playerId,
      {
        playerId,
        remainingMs: 0,
        isRunning: false
      } satisfies PublicPlayerGameTimer
    ])
  ) as PublicTimerState["players"];

  return { players };
}

function toPublicLegalAction(action: Action): PublicLegalAction {
  switch (action.type) {
    case "playCard":
      return { type: "playCard", handInstanceId: action.handInstanceId };
    case "attachDon":
      return {
        type: "attachDon",
        donInstanceId: action.donInstanceId,
        targetInstanceId: action.targetInstanceId
      };
    case "declareAttack":
      return {
        type: "declareAttack",
        attackerInstanceId: action.attackerInstanceId,
        target: cloneValue(action.target)
      };
    case "activateBlocker":
      return {
        type: "activateBlocker",
        blockerInstanceId: action.blockerInstanceId
      };
    case "activateEffect":
      return {
        type: "activateEffect",
        sourceInstanceId: action.sourceInstanceId,
        effectId: action.effectId
      };
    case "useCounter":
      return {
        type: "useCounter",
        handInstanceId: action.handInstanceId,
        targetInstanceId: action.targetInstanceId
      };
    case "respondToDecision":
      return { type: "respondToDecision", decisionId: action.decisionId };
    case "endMainPhase":
      return { type: "endMainPhase" };
    case "concede":
      return { type: "concede" };
    default:
      throw new Error(
        `Unsupported action projection: ${(action as Action).type}`
      );
  }
}

function collectAllCards(state: GameState): CardInstance[] {
  const cards: CardInstance[] = [];
  for (const player of Object.values(state.players)) {
    cards.push(...player.deck);
    cards.push(...player.donDeck);
    cards.push(...player.hand);
    cards.push(...player.trash);
    cards.push(player.leader);
    cards.push(...player.characters);
    if (player.stage) {
      cards.push(player.stage);
    }
    cards.push(...player.costArea);
    cards.push(...player.life.map((lifeCard) => lifeCard.card));
  }
  return cards;
}

function assertAllCardsInExactlyOneLocation(state: GameState): void {
  const locations = new Map<InstanceId, string>();
  const visit = (card: CardInstance, expectedLabel: string): void => {
    const current = locations.get(card.instanceId);
    if (current) {
      throw new Error(
        `Card ${card.instanceId} exists in multiple locations: ${current}, ${expectedLabel}`
      );
    }
    locations.set(card.instanceId, expectedLabel);
  };

  for (const player of Object.values(state.players)) {
    player.deck.forEach((card, index) => {
      if (
        card.zone.zone !== "deck" ||
        card.zone.playerId !== player.playerId ||
        card.zone.index !== index
      ) {
        throw new Error(
          `Deck card ${card.instanceId} has inconsistent zone metadata`
        );
      }
      visit(card, `${player.playerId}:deck:${index}`);
    });
    player.donDeck.forEach((card, index) => {
      if (
        card.zone.zone !== "donDeck" ||
        card.zone.playerId !== player.playerId ||
        card.zone.index !== index
      ) {
        throw new Error(
          `DON deck card ${card.instanceId} has inconsistent zone metadata`
        );
      }
      visit(card, `${player.playerId}:donDeck:${index}`);
    });
    player.hand.forEach((card, index) => {
      if (
        card.zone.zone !== "hand" ||
        card.zone.playerId !== player.playerId ||
        card.zone.index !== index
      ) {
        throw new Error(
          `Hand card ${card.instanceId} has inconsistent zone metadata`
        );
      }
      visit(card, `${player.playerId}:hand:${index}`);
    });
    player.trash.forEach((card, index) => {
      if (
        card.zone.zone !== "trash" ||
        card.zone.playerId !== player.playerId ||
        card.zone.index !== index
      ) {
        throw new Error(
          `Trash card ${card.instanceId} has inconsistent zone metadata`
        );
      }
      visit(card, `${player.playerId}:trash:${index}`);
    });
    if (
      player.leader.zone.zone !== "leaderArea" ||
      player.leader.zone.playerId !== player.playerId
    ) {
      throw new Error(
        `Leader ${player.leader.instanceId} has inconsistent zone metadata`
      );
    }
    visit(player.leader, `${player.playerId}:leader`);
    player.characters.forEach((card, index) => {
      if (
        card.zone.zone !== "characterArea" ||
        card.zone.playerId !== player.playerId ||
        card.zone.index !== index
      ) {
        throw new Error(
          `Character ${card.instanceId} has inconsistent zone metadata`
        );
      }
      visit(card, `${player.playerId}:character:${index}`);
    });
    if (player.stage) {
      if (
        player.stage.zone.zone !== "stageArea" ||
        player.stage.zone.playerId !== player.playerId
      ) {
        throw new Error(
          `Stage ${player.stage.instanceId} has inconsistent zone metadata`
        );
      }
      visit(player.stage, `${player.playerId}:stage`);
    }
    player.costArea.forEach((card, index) => {
      if (
        !("playerId" in card.zone) ||
        card.zone.playerId !== player.playerId
      ) {
        throw new Error(
          `Cost-area card ${card.instanceId} has inconsistent owner metadata`
        );
      }
      visit(card, `${player.playerId}:cost:${index}`);
    });
    player.life.forEach((lifeCard, index) => {
      if (
        lifeCard.card.zone.zone !== "life" ||
        lifeCard.card.zone.playerId !== player.playerId ||
        lifeCard.card.zone.index !== index
      ) {
        throw new Error(
          `Life card ${lifeCard.card.instanceId} has inconsistent zone metadata`
        );
      }
      visit(lifeCard.card, `${player.playerId}:life:${index}`);
    });
  }
}

function assertNoDuplicateInstanceIds(state: GameState): void {
  const seen = new Set<InstanceId>();
  for (const card of collectAllCards(state)) {
    if (seen.has(card.instanceId)) {
      throw new Error(`Duplicate instanceId detected: ${card.instanceId}`);
    }
    seen.add(card.instanceId);
  }
}

function assertCharacterAreaSizeAtMostFive(state: GameState): void {
  for (const player of Object.values(state.players)) {
    if (player.characters.length > 5) {
      throw new Error(
        `Player ${player.playerId} has more than five characters`
      );
    }
  }
}

function assertStageAreaSizeAtMostOne(state: GameState): void {
  for (const player of Object.values(state.players)) {
    const stageCount = player.stage ? 1 : 0;
    if (stageCount > 1) {
      throw new Error(`Player ${player.playerId} has more than one stage`);
    }
  }
}

function assertLeaderAreaExactlyOne(state: GameState): void {
  for (const player of Object.values(state.players)) {
    if (!player.leader) {
      throw new Error(`Player ${player.playerId} is missing a leader`);
    }
  }
}

function assertAttachedDonConsistency(state: GameState): void {
  const cardIndex = new Map<InstanceId, CardInstance>();
  for (const card of collectAllCards(state)) {
    cardIndex.set(card.instanceId, card);
  }

  for (const card of collectAllCards(state)) {
    const seen = new Set<InstanceId>();
    for (const attachedDonId of card.attachedDon) {
      if (seen.has(attachedDonId)) {
        throw new Error(
          `Card ${card.instanceId} references duplicate attached DON ${attachedDonId}`
        );
      }
      seen.add(attachedDonId);
      const attachedDon = cardIndex.get(attachedDonId);
      if (!attachedDon) {
        throw new Error(
          `Card ${card.instanceId} references missing attached DON ${attachedDonId}`
        );
      }
      if (attachedDon.zone.zone !== "attached") {
        throw new Error(
          `Attached DON ${attachedDonId} is not in attached zone`
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
    throw new Error(
      `Pending decision references unknown player ${state.pendingDecision.playerId}`
    );
  }
}

function assertEffectQueueEntriesAreResolvableOrCancelled(
  state: GameState
): void {
  for (const entry of state.effectQueue) {
    if (
      !["pending", "resolving", "resolved", "cancelled"].includes(entry.state)
    ) {
      throw new Error(`Unknown effect queue state for ${entry.id}`);
    }
  }
}

function assertNoIllegalHiddenInfoInViews(state: GameState): void {
  for (const playerId of getPlayerIds(state)) {
    const view = filterStateForPlayer(state, playerId);
    const serialized = JSON.stringify(view);
    if (serialized.includes('"rng"') || serialized.includes("internalState")) {
      throw new Error("PlayerView leaked RNG state");
    }
    if (serialized.includes("effectQueue")) {
      throw new Error("PlayerView leaked effect queue internals");
    }
    if (Array.isArray((view.opponent as { hand: unknown }).hand)) {
      throw new Error("Opponent hand must not expose card identities");
    }
    const player = state.players[playerId];
    if (!player) {
      throw new Error(`Unknown player ${playerId} during invariant projection`);
    }
    if (view.self.deck.count !== player.deck.length) {
      throw new Error("Self deck count projection is inconsistent");
    }
  }
}

function assertStateHashStable(state: GameState): void {
  const left = hashGameState(state);
  const right = hashGameState(cloneValue(state));
  if (left !== right) {
    throw new Error("State hash is not stable");
  }
}

function runInvariantChecks(state: GameState): void {
  assertAllCardsInExactlyOneLocation(state);
  assertNoDuplicateInstanceIds(state);
  assertCharacterAreaSizeAtMostFive(state);
  assertStageAreaSizeAtMostOne(state);
  assertLeaderAreaExactlyOne(state);
  assertAttachedDonConsistency(state);
  assertNoIllegalHiddenInfoInViews(state);
  assertPendingDecisionIsValid(state);
  assertEffectQueueEntriesAreResolvableOrCancelled(state);
  assertStateHashStable(state);
}

function appendEvents(
  previousState: GameState,
  nextState: GameState,
  events: Array<{
    type: EngineEvent["type"];
    payload: EngineEvent["payload"];
    visibility?: EventVisibility;
  }>
): EngineEvent[] {
  const baseEventSeq = previousState.eventJournal.length;
  return [
    ...previousState.eventJournal,
    ...events.map<EngineEvent>((event, index) => ({
      id: `evt-${nextState.stateSeq}-${baseEventSeq + index + 1}` as EngineEvent["id"],
      eventSeq: baseEventSeq + index + 1,
      stateSeq: nextState.stateSeq,
      type: event.type,
      payload: cloneValue(event.payload),
      visibility: event.visibility ?? { type: "public" }
    }))
  ];
}

function finalizeResult(
  previousState: GameState,
  nextState: GameState,
  emittedEvents: Array<{
    type: EngineEvent["type"];
    payload: EngineEvent["payload"];
    visibility?: EventVisibility;
  }>
): EngineResult {
  nextState.eventJournal = appendEvents(
    previousState,
    nextState,
    emittedEvents
  );
  const stateHash = hashGameState(nextState);

  if (isTestMode()) {
    runInvariantChecks(nextState);
  }

  const result: EngineResult = {
    state: nextState,
    events: nextState.eventJournal.slice(previousState.eventJournal.length),
    publicEvents: [],
    stateHash
  };
  if (nextState.pendingDecision) {
    result.pendingDecision = nextState.pendingDecision;
  }
  return result;
}

function cloneStateForMutation(state: GameState): GameState {
  const nextState = cloneValue(state);
  nextState.stateSeq = (state.stateSeq + 1) as GameState["stateSeq"];
  nextState.actionSeq = (state.actionSeq + 1) as GameState["actionSeq"];
  return nextState;
}

function assertPendingDecisionResponseMatches(
  pendingDecision: PendingDecision,
  response: DecisionResponse
): void {
  switch (pendingDecision.type) {
    case "mulligan":
      if (response.type !== "keepOpeningHand" && response.type !== "mulligan") {
        throw new Error(
          "Mulligan decisions only accept keepOpeningHand or mulligan responses"
        );
      }
      return;
    case "chooseTriggerOrder":
      if (response.type !== "orderedIds") {
        throw new Error(
          "chooseTriggerOrder decisions require orderedIds response"
        );
      }
      return;
    case "chooseOptionalActivation":
      if (response.type !== "optionalActivationChoice") {
        throw new Error(
          "chooseOptionalActivation decisions require optionalActivationChoice response"
        );
      }
      return;
    case "payCost":
      if (response.type !== "payment") {
        throw new Error("payCost decisions require payment response");
      }
      return;
    case "selectTargets":
      if (response.type !== "targetSelection") {
        throw new Error(
          "selectTargets decisions require targetSelection response"
        );
      }
      return;
    case "selectCards":
      if (response.type !== "cardSelection") {
        throw new Error("selectCards decisions require cardSelection response");
      }
      return;
    case "chooseEffectOption":
      if (response.type !== "effectOptionSelection") {
        throw new Error(
          "chooseEffectOption decisions require effectOptionSelection response"
        );
      }
      return;
    case "confirmTriggerFromLife":
      if (response.type !== "lifeTriggerChoice") {
        throw new Error(
          "confirmTriggerFromLife decisions require lifeTriggerChoice response"
        );
      }
      return;
    case "chooseReplacement":
      if (response.type !== "replacementChoice") {
        throw new Error(
          "chooseReplacement decisions require replacementChoice response"
        );
      }
      return;
    case "orderCards":
      if (response.type !== "orderCards") {
        throw new Error("orderCards decisions require orderCards response");
      }
      return;
    case "chooseCharacterToTrashForOverflow":
      if (response.type !== "chooseCharacterToTrash") {
        throw new Error(
          "chooseCharacterToTrashForOverflow decisions require chooseCharacterToTrash response"
        );
      }
      return;
    default:
      return;
  }
}

export function createInitialState(input: CreateInitialStateInput): GameState {
  const state: GameState = {
    matchId: input.matchId,
    stateSeq: 0 as GameState["stateSeq"],
    actionSeq: 0 as GameState["actionSeq"],
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
    status: input.status ?? "setup"
  };

  if (input.pendingDecision) {
    state.pendingDecision = cloneValue(input.pendingDecision);
  }
  if (input.battle) {
    state.battle = cloneValue(input.battle);
  }
  if (input.winner) {
    state.winner = cloneValue(input.winner);
  }

  return state;
}

export function hashGameState(state: GameState): Sha256 {
  return createHash("sha256")
    .update(stableStringify(state))
    .digest("hex") as Sha256;
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId
): Action[] {
  if (
    !(playerId in state.players) ||
    state.status === "completed" ||
    state.status === "errored"
  ) {
    return [];
  }

  if (state.pendingDecision) {
    if (state.pendingDecision.playerId !== playerId) {
      return [];
    }
    return [
      {
        type: "respondToDecision",
        decisionId: state.pendingDecision.id,
        response: state.pendingDecision.defaultResponse ?? { type: "pass" }
      }
    ];
  }

  const legal: Action[] = [{ type: "concede" }];
  if (state.turn.activePlayer === playerId && state.turn.phase === "main") {
    legal.push({ type: "endMainPhase" });
  }
  return legal;
}

export function applyAction(state: GameState, action: Action): EngineResult {
  if (action.type === "respondToDecision") {
    if (
      !state.pendingDecision ||
      state.pendingDecision.id !== action.decisionId
    ) {
      throw new Error("respondToDecision requires the active pending decision");
    }
    return resumeDecision(state, action.response);
  }

  const nextState = cloneStateForMutation(state);
  switch (action.type) {
    case "concede": {
      nextState.status = "completed";
      nextState.winner = getOpponentId(state, state.turn.activePlayer);
      return finalizeResult(state, nextState, [
        {
          type: "gameOver",
          payload: {
            reason: "concede",
            winner: nextState.winner
          }
        }
      ]);
    }
    case "endMainPhase": {
      if (state.turn.phase !== "main") {
        throw new Error("endMainPhase is only valid during the main phase");
      }
      nextState.turn.phase = "end";
      return finalizeResult(state, nextState, [
        {
          type: "phaseEnded",
          payload: { phase: "main", playerId: state.turn.activePlayer }
        },
        {
          type: "phaseStarted",
          payload: { phase: "end", playerId: state.turn.activePlayer }
        }
      ]);
    }
    default:
      throw new Error(`Action ${action.type} is not implemented in ENG-001`);
  }
}

export function resumeDecision(
  state: GameState,
  response: DecisionResponse
): EngineResult {
  if (!state.pendingDecision) {
    throw new Error("resumeDecision requires an active pending decision");
  }

  assertPendingDecisionResponseMatches(state.pendingDecision, response);

  const nextState = cloneStateForMutation(state);
  const pendingDecision = cloneValue(state.pendingDecision);
  delete nextState.pendingDecision;

  if (pendingDecision.type === "mulligan") {
    const player = nextState.players[pendingDecision.playerId];
    if (!player) {
      throw new Error(
        `Unknown player ${pendingDecision.playerId} for mulligan decision`
      );
    }
    player.hasMulliganed = response.type === "mulligan";
    player.keptOpeningHand = response.type === "keepOpeningHand";
    return finalizeResult(state, nextState, [
      {
        type: "mulliganResolved",
        payload: {
          playerId: pendingDecision.playerId,
          choice: response.type
        },
        visibility: { type: "private", playerIds: [pendingDecision.playerId] }
      }
    ]);
  }

  return finalizeResult(state, nextState, [
    {
      type: "ruleProcessing",
      payload: {
        decisionId: pendingDecision.id,
        decisionType: pendingDecision.type,
        responseType: response.type
      },
      visibility: pendingDecision.visibility
    }
  ]);
}

export function computeView(state: GameState): ComputedGameView {
  const cards = Object.fromEntries(
    collectAllCards(state).map((card) => {
      const metadata = resolveCardMetadata(state, card);
      const computed: ComputedCardView = {
        instanceId: card.instanceId,
        cardId: card.cardId,
        keywords: [...metadata.keywords],
        canAttack: card.state === "active",
        canBlock: metadata.keywords.includes("blocker"),
        cannotBeAttacked: false,
        protectedFrom: []
      };
      if (metadata.power !== undefined) {
        computed.basePower = metadata.power;
        computed.currentPower = metadata.power;
      }
      if (metadata.cost !== undefined) {
        computed.baseCost = metadata.cost;
        computed.currentCost = metadata.cost;
      }
      return [card.instanceId, computed];
    })
  ) as ComputedGameView["cards"];

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
    throw new Error(`Unknown playerId ${playerId}`);
  }

  const opponentId = getOpponentId(state, playerId);
  const opponent = state.players[opponentId];
  if (!opponent) {
    throw new Error(`Unknown opponent for ${playerId}`);
  }

  const view: PlayerView = {
    matchId: state.matchId,
    playerId,
    stateSeq: state.stateSeq,
    actionSeq: state.actionSeq,
    turn: cloneValue(state.turn),
    self: buildVisiblePlayerState(state, self),
    opponent: buildOpponentVisibleState(state, opponent),
    legalActions: getLegalActions(state, playerId).map(toPublicLegalAction),
    revealedCards: [] as LivePublicRevealRecord[],
    effectEvents: [] as LivePublicEffectEvent[],
    timers: buildTimerState(state)
  };
  if (state.battle) {
    view.battle = cloneValue(state.battle);
  }
  const pendingDecision = toPublicDecision(state.pendingDecision, playerId);
  if (pendingDecision) {
    view.pendingDecision = pendingDecision;
  }
  return view;
}
