import { createHash } from "node:crypto";
import type {
  Action,
  CardInstance,
  CardRef,
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
  PublicCardRef,
  PublicCardView,
  PublicCardSelectionRequest,
  PublicDecision,
  PublicDecisionCardRef,
  PublicDecisionVisibility,
  PublicEffectOption,
  PublicLegalAction,
  PublicLifeAreaView,
  PublicPaymentCardRef,
  PublicPaymentOption,
  PublicReplacementOption,
  PublicTargetRequest,
  PublicTriggerOrderOption,
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

function assertExactlyTwoPlayers(state: Pick<GameState, "players">): void {
  const playerCount = Object.keys(state.players).length;
  if (playerCount !== 2) {
    throw new Error(
      `ENG-001 bootstrap expects exactly two players, received ${playerCount}`
    );
  }
}

function getOpponentId(state: GameState, playerId: PlayerId): PlayerId {
  assertExactlyTwoPlayers(state);
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

function setIndexedZone(
  cards: CardInstance[],
  zone: "deck" | "hand",
  playerId: PlayerId
): void {
  cards.forEach((card, index) => {
    card.zone = {
      zone,
      playerId,
      index
    };
  });
}

function deterministicShuffleCards(
  cards: CardInstance[],
  rng: GameState["rng"]
): CardInstance[] {
  const shuffleSeed = createHash("sha256")
    .update(
      [
        rng.algorithm,
        rng.seed ?? "",
        rng.seedCommitment ?? "",
        rng.internalState,
        String(rng.callCount)
      ].join("|")
    )
    .digest("hex");

  const shuffled = [...cards].sort((left, right) => {
    const leftRank = createHash("sha256")
      .update(`${shuffleSeed}|${left.instanceId}`)
      .digest("hex");
    const rightRank = createHash("sha256")
      .update(`${shuffleSeed}|${right.instanceId}`)
      .digest("hex");
    return (
      compareStrings(leftRank, rightRank) ||
      compareStrings(left.instanceId, right.instanceId)
    );
  });

  rng.internalState = shuffleSeed;
  rng.callCount += 1;

  return shuffled;
}

function applyMulliganRedraw(player: PlayerState, rng: GameState["rng"]): void {
  const handCount = player.hand.length;
  const shuffled = deterministicShuffleCards(
    [...player.deck, ...player.hand],
    rng
  );
  player.hand = shuffled.slice(0, handCount);
  player.deck = shuffled.slice(handCount);
  setIndexedZone(player.hand, "hand", player.playerId);
  setIndexedZone(player.deck, "deck", player.playerId);
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

function isCardRefPubliclyVisibleToViewer(ref: CardRef): boolean {
  if (ref.zone === undefined) {
    return false;
  }

  switch (ref.zone.zone) {
    case "trash":
    case "leaderArea":
    case "characterArea":
    case "stageArea":
    case "costArea":
      return true;
    case "hand":
    case "deck":
    case "donDeck":
    case "life":
    case "attached":
    case "noZone":
      return false;
  }
}

function toPublicDecisionVisibility(
  pendingDecision: PendingDecision
): PublicDecisionVisibility {
  const visibility = pendingDecision.visibility;
  if (visibility.type === "public") {
    return { type: "public" };
  }
  if (visibility.type === "private") {
    return {
      type: "private",
      playerIds: [...visibility.playerIds]
    };
  }
  return {
    type: "private",
    playerIds: [pendingDecision.playerId]
  };
}

function canViewerSeePendingDecisionLive(
  pendingDecision: PendingDecision,
  viewerId: PlayerId
): boolean {
  return (
    pendingDecision.visibility.type === "public" ||
    (pendingDecision.visibility.type === "private" &&
      pendingDecision.visibility.playerIds.includes(viewerId))
  );
}

function canChooserAnswerPendingDecisionLive(
  state: Pick<GameState, "status">,
  pendingDecision: PendingDecision
): boolean {
  return (
    state.status === "setup" &&
    pendingDecision.type === "mulligan" &&
    canViewerSeePendingDecisionLive(pendingDecision, pendingDecision.playerId)
  );
}

function canChooserSeePendingDecisionLive(
  pendingDecision: PendingDecision
): boolean {
  return canViewerSeePendingDecisionLive(
    pendingDecision,
    pendingDecision.playerId
  );
}

function hasResolvedSetupMulligan(player: PlayerState): boolean {
  return player.hasMulliganed || player.keptOpeningHand;
}

function assertSetupMulliganOrder(state: GameState): void {
  if (!state.pendingDecision || state.pendingDecision.type !== "mulligan") {
    return;
  }

  const firstPlayerId = state.turn.firstPlayer;
  const secondPlayerId = getOpponentId(state, firstPlayerId);
  const firstPlayer = state.players[firstPlayerId];
  const secondPlayer = state.players[secondPlayerId];
  if (!firstPlayer || !secondPlayer) {
    throw new Error("Setup mulligan order references a missing player");
  }

  const firstResolved = hasResolvedSetupMulligan(firstPlayer);
  const secondResolved = hasResolvedSetupMulligan(secondPlayer);
  if (!firstResolved && secondResolved) {
    throw new Error("Setup mulligan order is invalid");
  }

  if (state.pendingDecision.playerId === firstPlayerId) {
    if (firstResolved || secondResolved) {
      throw new Error("Setup mulligan order is invalid");
    }
    return;
  }

  if (state.pendingDecision.playerId === secondPlayerId) {
    if (!firstResolved || secondResolved) {
      throw new Error("Setup mulligan order is invalid");
    }
    return;
  }

  throw new Error("Setup mulligan chooser is not part of this match");
}

function getSetupMulliganPlayerOrder(state: GameState): [PlayerId, PlayerId] {
  const firstPlayerId = state.turn.firstPlayer;
  const secondPlayerId = getOpponentId(state, firstPlayerId);
  return [firstPlayerId, secondPlayerId];
}

function requireInstanceId(
  ref: CardRef,
  context: string
): NonNullable<CardRef["instanceId"]> {
  if (ref.instanceId === undefined) {
    throw new Error(`${context} requires CardRef.instanceId`);
  }
  return ref.instanceId;
}

function toPublicCardRef(ref: CardRef): PublicCardRef {
  return {
    instanceId: requireInstanceId(ref, "Live public card ref"),
    cardId: ref.cardId,
    owner: ref.owner,
    controller: ref.controller
  };
}

function toPublicDecisionCardRef(ref: CardRef): PublicDecisionCardRef {
  return {
    instanceId: requireInstanceId(ref, "Live public decision card ref"),
    owner: ref.owner,
    controller: ref.controller,
    cardId: ref.cardId
  };
}

function toPublicPaymentCardRef(ref: CardRef): PublicPaymentCardRef {
  if (ref.zone === undefined) {
    throw new Error("Live public payment card ref requires CardRef.zone");
  }

  return {
    ...toPublicCardRef(ref),
    zone: ref.zone
  };
}

function toPublicTargetRequest(
  request: Extract<PendingDecision, { type: "selectTargets" }>["request"]
): PublicTargetRequest {
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
  request: Extract<PendingDecision, { type: "selectCards" }>["request"]
): PublicCardSelectionRequest {
  if (request.visibility === "replayOnly") {
    throw new Error(
      "Live public card selection request cannot use replayOnly visibility"
    );
  }

  const publicRequest: PublicCardSelectionRequest = {
    chooser: request.chooser,
    min: request.min,
    max: request.max,
    allowFewerIfUnavailable: request.allowFewerIfUnavailable,
    visibility: request.visibility === "public" ? "public" : "privateToChooser"
  };
  if (request.zone !== undefined) {
    publicRequest.zone = request.zone;
  }
  if (request.player !== undefined) {
    publicRequest.player = request.player;
  }
  return publicRequest;
}

function toPublicDecision(
  pendingDecision: PendingDecision,
  viewerId: PlayerId
): PublicDecision | undefined {
  const viewerIsChooser = pendingDecision.playerId === viewerId;
  const decisionIsPublic = pendingDecision.visibility.type === "public";
  const viewerCanSeeDecision = canViewerSeePendingDecisionLive(
    pendingDecision,
    viewerId
  );

  if (!viewerCanSeeDecision) {
    return undefined;
  }

  const base: {
    id: PendingDecision["id"];
    type: PendingDecision["type"];
    playerId: PlayerId;
    visibility: PublicDecisionVisibility;
    prompt?: string;
    timeoutMs?: number;
    defaultResponse?: DecisionResponse;
  } = {
    id: pendingDecision.id,
    type: pendingDecision.type,
    playerId: pendingDecision.playerId,
    visibility: toPublicDecisionVisibility(pendingDecision)
  };
  if (pendingDecision.prompt !== undefined) {
    base.prompt = pendingDecision.prompt;
  }
  if (pendingDecision.timeoutMs !== undefined) {
    base.timeoutMs = pendingDecision.timeoutMs;
  }
  if (viewerIsChooser && pendingDecision.defaultResponse !== undefined) {
    base.defaultResponse = cloneValue(pendingDecision.defaultResponse);
  }

  switch (pendingDecision.type) {
    case "mulligan":
      return {
        ...base,
        type: "mulligan",
        handCount: pendingDecision.handCount
      };
    case "chooseTriggerOrder":
      return {
        ...base,
        type: "chooseTriggerOrder",
        triggers: pendingDecision.triggerIds.map(
          (triggerId): PublicTriggerOrderOption => ({
            triggerId
          })
        )
      };
    case "chooseOptionalActivation":
      return {
        ...base,
        type: "chooseOptionalActivation",
        effectId: pendingDecision.effectId,
        source: toPublicCardRef(pendingDecision.source),
        options: ["activate", "decline"]
      };
    case "payCost":
      return {
        ...base,
        type: "payCost",
        cost: cloneValue(pendingDecision.cost),
        options: pendingDecision.options.map((option): PublicPaymentOption => {
          const publicOption: PublicPaymentOption = {
            id: option.id,
            cost: cloneValue(option.cost),
            min: option.min,
            max: option.max
          };
          if (viewerIsChooser && option.selectableCards !== undefined) {
            publicOption.selectableCards = option.selectableCards.map(
              toPublicPaymentCardRef
            );
          } else if (decisionIsPublic && option.selectableCards !== undefined) {
            publicOption.selectableCards = option.selectableCards
              .filter((ref) => isCardRefPubliclyVisibleToViewer(ref))
              .map(toPublicPaymentCardRef);
          }
          if (viewerIsChooser && option.selectableDon !== undefined) {
            publicOption.selectableDon = option.selectableDon.map(
              toPublicPaymentCardRef
            );
          } else if (decisionIsPublic && option.selectableDon !== undefined) {
            publicOption.selectableDon = option.selectableDon
              .filter((ref) => isCardRefPubliclyVisibleToViewer(ref))
              .map(toPublicPaymentCardRef);
          }
          return publicOption;
        })
      };
    case "selectTargets":
      return {
        ...base,
        type: "selectTargets",
        request: toPublicTargetRequest(pendingDecision.request),
        candidates:
          viewerIsChooser || pendingDecision.request.visibility === "public"
            ? pendingDecision.candidates.map((candidate) => ({
                card: toPublicDecisionCardRef(candidate)
              }))
            : []
      };
    case "selectCards":
      return {
        ...base,
        type: "selectCards",
        request: toPublicCardSelectionRequest(pendingDecision.request),
        candidates:
          pendingDecision.request.visibility === "public" ||
          (viewerIsChooser &&
            pendingDecision.request.visibility === "privateToChooser")
            ? pendingDecision.candidates.map((candidate) => ({
                card: toPublicDecisionCardRef(candidate)
              }))
            : []
      };
    case "chooseEffectOption":
      return {
        ...base,
        type: "chooseEffectOption",
        options: pendingDecision.options.map((option): PublicEffectOption => {
          const publicOption: PublicEffectOption = {
            id: option.id,
            label: option.label
          };
          if (option.availability !== undefined) {
            publicOption.availability = option.availability;
          }
          return publicOption;
        }),
        min: pendingDecision.min,
        max: pendingDecision.max
      };
    case "confirmTriggerFromLife":
      return {
        ...base,
        type: "confirmTriggerFromLife",
        card: toPublicCardRef(pendingDecision.card),
        options: ["activateTrigger", "addToHand"]
      };
    case "chooseReplacement":
      return {
        ...base,
        type: "chooseReplacement",
        processId: pendingDecision.processId,
        replacements: pendingDecision.replacementIds.map(
          (replacementId): PublicReplacementOption => ({
            replacementId
          })
        ),
        optional: pendingDecision.optional
      };
    case "orderCards":
      return {
        ...base,
        type: "orderCards",
        cards: viewerIsChooser
          ? pendingDecision.cards.map(toPublicDecisionCardRef)
          : decisionIsPublic
            ? pendingDecision.cards
                .filter((ref) => isCardRefPubliclyVisibleToViewer(ref))
                .map(toPublicDecisionCardRef)
            : [],
        destination: pendingDecision.destination
      };
    case "chooseCharacterToTrashForOverflow":
      return {
        ...base,
        type: "chooseCharacterToTrashForOverflow",
        candidates: viewerIsChooser
          ? pendingDecision.candidates.map(toPublicCardRef)
          : decisionIsPublic
            ? pendingDecision.candidates
                .filter((ref) => isCardRefPubliclyVisibleToViewer(ref))
                .map(toPublicCardRef)
            : []
      };
  }
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

function assertCardsRespectZoneOwnership(state: GameState): void {
  for (const entry of collectRawCards(state)) {
    if (entry.card.controller !== entry.playerId) {
      throw new Error(
        `Card ${entry.card.instanceId} has controller ${entry.card.controller} but is stored under player ${entry.playerId}`
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
        if (referenced.has(attachedId)) {
          throw new Error(
            `Host ${host.instanceId} references duplicate attached card ${attachedId}`
          );
        }
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

  if (!canChooserSeePendingDecisionLive(state.pendingDecision)) {
    throw new Error("Pending decision chooser cannot see the live decision");
  }

  if (state.pendingDecision.type === "mulligan") {
    if (state.status !== "setup") {
      throw new Error("Mulligan decisions are only valid during setup");
    }
    const pendingPlayer = state.players[state.pendingDecision.playerId];
    if (!pendingPlayer) {
      throw new Error("Pending decision references a missing player");
    }
    if (state.pendingDecision.handCount !== pendingPlayer.hand.length) {
      throw new Error("Mulligan handCount does not match the chooser hand");
    }
    assertSetupMulliganOrder(state);
  }

  if (
    canChooserAnswerPendingDecisionLive(state, state.pendingDecision) &&
    !hasLegalResponsesForDecision(state.pendingDecision)
  ) {
    throw new Error("Pending decision has no legal responses");
  }

  for (const playerId of getPlayerIds(state)) {
    if (canViewerSeePendingDecisionLive(state.pendingDecision, playerId)) {
      toPublicDecision(state.pendingDecision, playerId);
    }
  }
}

function assertEffectQueueEntriesAreResolvableOrCancelled(
  state: GameState
): void {
  const liveCardsById = new Map(
    collectAllCards(state).map((card) => [card.instanceId, card])
  );
  const eventIds = new Set(state.eventJournal.map((event) => event.id));

  for (const entry of state.effectQueue) {
    if (
      entry.state !== "pending" &&
      entry.state !== "resolving" &&
      entry.state !== "resolved" &&
      entry.state !== "cancelled"
    ) {
      throw new Error(`Unexpected effect queue state for ${entry.id}`);
    }

    if (
      entry.sourcePresencePolicy !== "mustRemainInSameZone" &&
      entry.sourcePresencePolicy !== "resolveFromDestinationZone" &&
      entry.sourcePresencePolicy !== "resolveFromLastKnownInformation" &&
      entry.sourcePresencePolicy !== "noSourceRequired"
    ) {
      throw new Error(
        `Unexpected source presence policy for effect queue entry ${entry.id}`
      );
    }

    if (
      entry.triggerEventId !== undefined &&
      !eventIds.has(entry.triggerEventId)
    ) {
      throw new Error(
        `Effect queue entry ${entry.id} references missing trigger event ${entry.triggerEventId}`
      );
    }

    if (entry.sourcePresencePolicy === "noSourceRequired") {
      continue;
    }

    const sourceInstanceId =
      entry.source.instanceId ?? entry.sourceSnapshot.instanceId;
    if (sourceInstanceId === undefined) {
      throw new Error(
        `Effect queue entry ${entry.id} requires a source instance id`
      );
    }

    const liveSource = liveCardsById.get(sourceInstanceId);
    if (!liveSource) {
      if (entry.sourcePresencePolicy === "resolveFromLastKnownInformation") {
        continue;
      }

      throw new Error(
        `Effect queue entry ${entry.id} references missing source ${sourceInstanceId}`
      );
    }

    if (entry.sourcePresencePolicy === "mustRemainInSameZone") {
      if (entry.state === "cancelled") {
        continue;
      }
      const expectedZone = entry.source.zone ?? entry.sourceSnapshot.zone;
      if (stableStringify(liveSource.zone) !== stableStringify(expectedZone)) {
        throw new Error(
          `Effect queue entry ${entry.id} source ${sourceInstanceId} moved out of its required zone`
        );
      }
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
  assertExactlyTwoPlayers(state);
  assertAllCardsInExactlyOneLocation(state);
  assertCardsRespectZoneOwnership(state);
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
    timers: cloneValue(input.timers),
    turn: cloneValue(input.turn),
    effectQueue: [],
    continuousEffects: [],
    oncePerTurn: [],
    replacementState: [],
    eventJournal: [],
    status: input.status ?? "active"
  };

  assertExactlyTwoPlayers(state);

  if (input.battle) {
    state.battle = cloneValue(input.battle);
  }
  if (input.pendingDecision) {
    state.pendingDecision = cloneValue(input.pendingDecision);
  }
  if (input.winner !== undefined) {
    state.winner = cloneValue(input.winner);
  }

  assertPendingDecisionIsValid(state);

  if (isTestMode()) {
    runInvariantChecks(state);
  }

  return state;
}

export function hashGameState(state: GameState): Sha256 {
  const sanitizedState = cloneValue(state);
  sanitizedState.cardManifest = {
    ...sanitizedState.cardManifest,
    createdAt: ""
  };
  if (sanitizedState.timers.disconnect) {
    sanitizedState.timers.disconnect = {
      ...sanitizedState.timers.disconnect,
      startedAt: "",
      expiresAt: ""
    };
  }

  return toSha256(
    createHash("sha256")
      .update(stableStringify(sanitizedState), "utf8")
      .digest("hex")
  );
}

function legalResponsesForDecision(pendingDecision: PendingDecision): Action[] {
  switch (pendingDecision.type) {
    case "mulligan":
      return [
        {
          type: "respondToDecision",
          decisionId: pendingDecision.id,
          response: { type: "keepOpeningHand" }
        },
        {
          type: "respondToDecision",
          decisionId: pendingDecision.id,
          response: { type: "mulligan" }
        }
      ];
    default:
      return [];
  }
}

function hasLegalResponsesForDecision(
  pendingDecision: PendingDecision
): boolean {
  return pendingDecision.type === "mulligan";
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId
): Action[] {
  if (!(playerId in state.players)) {
    return [];
  }

  if (state.status === "completed" || state.status === "errored") {
    return [];
  }

  if (state.status === "frozen") {
    return [{ type: "concede", playerId }];
  }

  if (state.pendingDecision) {
    if (
      state.pendingDecision.playerId !== playerId ||
      !canChooserAnswerPendingDecisionLive(state, state.pendingDecision)
    ) {
      return [{ type: "concede", playerId }];
    }

    return [
      ...legalResponsesForDecision(state.pendingDecision),
      { type: "concede", playerId }
    ];
  }

  return [
    {
      type: "concede",
      playerId
    }
  ];
}

export function applyAction(state: GameState, action: Action): EngineResult {
  if (state.status === "completed" || state.status === "errored") {
    throw new Error("Cannot mutate a terminal match");
  }

  if (state.status === "frozen" && action.type !== "concede") {
    throw new Error("Cannot mutate a frozen match except by concession");
  }

  if (action.type === "respondToDecision") {
    if (!state.pendingDecision) {
      throw new Error("No pending decision is active");
    }
    if (state.pendingDecision.id !== action.decisionId) {
      throw new Error("Decision response does not match the active decision");
    }
    return resumeDecision(state, action.response);
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
  response: DecisionResponse
): EngineResult {
  if (
    state.status === "frozen" ||
    state.status === "completed" ||
    state.status === "errored"
  ) {
    throw new Error("Cannot resolve decisions in a frozen or terminal match");
  }

  if (!state.pendingDecision) {
    throw new Error("No pending decision is active");
  }

  if (state.pendingDecision.type !== "mulligan") {
    throw new Error(
      `Unsupported pending decision in ENG-001 bootstrap: ${state.pendingDecision.type}`
    );
  }

  if (state.status !== "setup") {
    throw new Error("Mulligan decisions cannot resolve after setup completes");
  }

  if (response.type !== "keepOpeningHand" && response.type !== "mulligan") {
    throw new Error(
      "Mulligan decisions only accept keepOpeningHand or mulligan responses"
    );
  }

  const nextState = cloneStateForMutation(state);
  nextState.stateSeq = toStateSeq(Number(nextState.stateSeq) + 1);
  nextState.actionSeq = toActionSeq(Number(nextState.actionSeq) + 1);

  const pendingDecision = cloneValue(state.pendingDecision);
  delete nextState.pendingDecision;

  const player = nextState.players[pendingDecision.playerId];
  if (!player) {
    throw new Error(`Unknown player ${pendingDecision.playerId} for mulligan`);
  }
  if (pendingDecision.handCount !== player.hand.length) {
    throw new Error("Mulligan handCount does not match the chooser hand");
  }

  if (response.type === "mulligan") {
    applyMulliganRedraw(player, nextState.rng);
    player.hasMulliganed = true;
    player.keptOpeningHand = false;
  } else {
    player.hasMulliganed = false;
    player.keptOpeningHand = true;
  }

  if (state.status === "setup") {
    const waitingPlayerId = getSetupMulliganPlayerOrder(state).find(
      (candidateId) => {
        const candidate = nextState.players[candidateId];
        return (
          candidate !== undefined &&
          !candidate.hasMulliganed &&
          !candidate.keptOpeningHand
        );
      }
    );

    if (waitingPlayerId && waitingPlayerId !== pendingDecision.playerId) {
      const waitingPlayer = nextState.players[waitingPlayerId];
      if (!waitingPlayer) {
        throw new Error(`Unknown setup player ${waitingPlayerId}`);
      }
      nextState.pendingDecision = {
        id: `setup-mulligan-${waitingPlayerId}` as PendingDecision["id"],
        type: "mulligan",
        playerId: waitingPlayerId,
        handCount: waitingPlayer.hand.length,
        visibility: { type: "private", playerIds: [waitingPlayerId] }
      };
    }
  }

  const event = appendEvent(nextState, {
    type: "mulliganResolved",
    actor: pendingDecision.playerId,
    payload: toJsonValue({
      playerId: pendingDecision.playerId,
      choice: response.type
    }),
    causedBy: { type: "decision", decisionId: pendingDecision.id },
    visibility: { type: "private", playerIds: [pendingDecision.playerId] }
  });

  return finalizeResult(nextState, [event]);
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

  const publicDecision = state.pendingDecision
    ? toPublicDecision(state.pendingDecision, playerId)
    : undefined;

  const legalActions: PublicLegalAction[] = [];
  const seenDecisionIds = new Set<string>();
  for (const action of getLegalActions(state, playerId)) {
    if (action.type === "respondToDecision") {
      if (
        publicDecision === undefined ||
        publicDecision.id !== action.decisionId
      ) {
        continue;
      }
      if (seenDecisionIds.has(action.decisionId)) {
        continue;
      }
      seenDecisionIds.add(action.decisionId);
      legalActions.push({
        type: "respondToDecision",
        decisionId: action.decisionId
      });
      continue;
    }

    legalActions.push(cloneValue(action) as PublicLegalAction);
  }

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
    timers: cloneValue(state.timers)
  };

  if (state.battle) {
    view.battle = cloneValue(state.battle);
  }

  if (publicDecision) {
    view.pendingDecision = publicDecision;
  }

  return view;
}
