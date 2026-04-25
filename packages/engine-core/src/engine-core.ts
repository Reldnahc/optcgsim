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
  TurnState,
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

function arraysEqualUnordered(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function hasDuplicateValues(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function chooseCombinations<T>(items: T[], count: number): T[][] {
  if (count === 0) {
    return [[]];
  }
  if (count > items.length) {
    return [];
  }

  const results: T[][] = [];
  const walk = (startIndex: number, current: T[]): void => {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let index = startIndex; index < items.length; index += 1) {
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      current.push(item);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return results;
}

function chooseCombinationsInRange<T>(
  items: T[],
  minCount: number,
  maxCount: number
): T[][] {
  const normalizedMin = Math.max(0, minCount);
  const normalizedMax = Math.min(items.length, maxCount);
  const results: T[][] = [];

  for (let count = normalizedMin; count <= normalizedMax; count += 1) {
    results.push(...chooseCombinations(items, count));
  }

  return results;
}

function choosePermutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }
  const results: T[][] = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const permutation of choosePermutations(rest)) {
      results.push([item, ...permutation]);
    }
  });
  return results;
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
  viewerId: PlayerId,
  exposeCardIdentity = false
): PublicDecisionCardRef {
  const base: PublicDecisionCardRef = {
    instanceId: requireInstanceId(ref),
    owner: ref.owner,
    controller: ref.controller
  };

  if (
    exposeCardIdentity ||
    isZoneIdentityVisible(ref.zone, viewerId) ||
    isSnapshotVisible(ref.snapshot, viewerId)
  ) {
    base.cardId = ref.cardId;
  }

  return base;
}

function shouldExposeDecisionCandidateToViewer(
  ref: CardRef,
  viewerId: PlayerId
): boolean {
  return (
    isZoneIdentityVisible(ref.zone, viewerId) ||
    isSnapshotVisible(ref.snapshot, viewerId)
  );
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
      "replayOnly card selection requests must be filtered before public projection"
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

function shouldExposeDecisionCandidatesToViewer(
  pendingDecision: Extract<
    PendingDecision,
    { type: "selectTargets" | "selectCards" }
  >,
  viewerId: PlayerId
): boolean {
  if (viewerId === pendingDecision.playerId) {
    return true;
  }

  return pendingDecision.request.visibility !== "privateToChooser";
}

function toPublicDefaultResponse(
  pendingDecision: PendingDecision,
  viewerId: PlayerId
): DecisionResponse | undefined {
  const response = pendingDecision.defaultResponse;
  if (!response) {
    return undefined;
  }

  if (viewerId === pendingDecision.playerId) {
    return cloneValue(response);
  }

  switch (response.type) {
    case "keepOpeningHand":
    case "mulligan":
    case "orderedIds":
    case "optionalActivationChoice":
    case "lifeTriggerChoice":
    case "effectOptionSelection":
    case "replacementChoice":
    case "pass":
      return cloneValue(response);
    case "payment":
    case "targetSelection":
    case "cardSelection":
    case "orderCards":
    case "chooseCharacterToTrash":
    case "yesNo":
      return undefined;
    default:
      return undefined;
  }
}

function shouldExposePaymentCardRefToViewer(
  ref: CardRef,
  viewerId: PlayerId
): boolean {
  return (
    isZoneIdentityVisible(ref.zone, viewerId) ||
    isSnapshotVisible(ref.snapshot, viewerId)
  );
}

function minSelectionsRequired(
  min: number,
  candidateCount: number,
  allowFewerIfUnavailable: boolean
): number {
  return allowFewerIfUnavailable ? Math.min(min, candidateCount) : min;
}

function toPublicDecision(
  pendingDecision: PendingDecision | undefined,
  viewerId: PlayerId
): PublicDecision | undefined {
  if (!pendingDecision) {
    return undefined;
  }

  if (
    pendingDecision.type === "confirmTriggerFromLife" &&
    viewerId !== pendingDecision.playerId
  ) {
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
    const publicDefaultResponse = toPublicDefaultResponse(
      pendingDecision,
      viewerId
    );
    if (publicDefaultResponse !== undefined) {
      next.defaultResponse = publicDefaultResponse;
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
      if (
        viewerId !== pendingDecision.playerId &&
        !shouldExposeDecisionCandidateToViewer(pendingDecision.source, viewerId)
      ) {
        return undefined;
      }
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
            const visibleSelectableCards = option.selectableCards
              .filter((card) =>
                shouldExposePaymentCardRefToViewer(card, viewerId)
              )
              .map(toPublicPaymentCardRef);
            if (visibleSelectableCards.length > 0) {
              publicOption.selectableCards = visibleSelectableCards;
            }
          }
          if (option.selectableDon !== undefined) {
            const visibleSelectableDon = option.selectableDon
              .filter((card) =>
                shouldExposePaymentCardRefToViewer(card, viewerId)
              )
              .map(toPublicPaymentCardRef);
            if (visibleSelectableDon.length > 0) {
              publicOption.selectableDon = visibleSelectableDon;
            }
          }
          return publicOption;
        })
      }) as PublicDecision;
    case "selectTargets":
      return withOptionalBaseFields({
        ...base,
        type: "selectTargets",
        request: toPublicTargetRequest(pendingDecision.request),
        candidates: shouldExposeDecisionCandidatesToViewer(
          pendingDecision,
          viewerId
        )
          ? pendingDecision.candidates.flatMap((candidate) =>
              viewerId === pendingDecision.playerId ||
              shouldExposeDecisionCandidateToViewer(candidate, viewerId)
                ? [
                    {
                      card: toPublicDecisionCardRef(
                        candidate,
                        viewerId,
                        viewerId === pendingDecision.playerId
                      )
                    }
                  ]
                : []
            )
          : []
      }) as PublicDecision;
    case "selectCards":
      if (pendingDecision.request.visibility === "replayOnly") {
        return undefined;
      }
      return withOptionalBaseFields({
        ...base,
        type: "selectCards",
        request: toPublicCardSelectionRequest(pendingDecision.request),
        candidates: shouldExposeDecisionCandidatesToViewer(
          pendingDecision,
          viewerId
        )
          ? pendingDecision.candidates.flatMap((candidate) =>
              viewerId === pendingDecision.playerId ||
              shouldExposeDecisionCandidateToViewer(candidate, viewerId)
                ? [
                    {
                      card: toPublicDecisionCardRef(
                        candidate,
                        viewerId,
                        viewerId === pendingDecision.playerId
                      )
                    }
                  ]
                : []
            )
          : []
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
        card:
          viewerId === pendingDecision.playerId
            ? toPublicCardRef(pendingDecision.card)
            : toPublicDecisionCardRef(pendingDecision.card, viewerId),
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
        cards: pendingDecision.cards.flatMap((card) =>
          viewerId === pendingDecision.playerId ||
          shouldExposeDecisionCandidateToViewer(card, viewerId)
            ? [
                toPublicDecisionCardRef(
                  card,
                  viewerId,
                  viewerId === pendingDecision.playerId
                )
              ]
            : []
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
      return { type: "concede", playerId: action.playerId };
    default:
      throw new Error(
        `Unsupported action projection: ${(action as Action).type}`
      );
  }
}

function buildPublicLegalActions(
  state: GameState,
  playerId: PlayerId
): PublicLegalAction[] {
  if (state.pendingDecision) {
    const legal: PublicLegalAction[] = [{ type: "concede", playerId }];
    if (
      state.pendingDecision.playerId === playerId &&
      hasLegalResponsesForDecision(state.pendingDecision)
    ) {
      legal.push({
        type: "respondToDecision",
        decisionId: state.pendingDecision.id
      });
    }
    return legal;
  }

  const seen = new Set<string>();
  const result: PublicLegalAction[] = [];

  for (const action of getLegalActions(state, playerId)) {
    const projected = toPublicLegalAction(action);
    const key = stableStringify(projected);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(projected);
  }

  return result;
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
        card.zone.zone !== "costArea" ||
        card.zone.playerId !== player.playerId ||
        card.zone.index !== index
      ) {
        throw new Error(
          `Cost-area card ${card.instanceId} has inconsistent zone metadata`
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

function legalPaymentSelections(
  option: Extract<PendingDecision, { type: "payCost" }>["options"][number]
): Array<{
  selectedCards?: PublicPaymentCardRef[];
  selectedDon?: PublicPaymentCardRef[];
}> {
  const selectableCards = option.selectableCards ?? [];
  const selectableDon = option.selectableDon ?? [];
  const cardSelections = chooseCombinationsInRange(
    selectableCards,
    0,
    selectableCards.length
  );
  const donSelections = chooseCombinationsInRange(
    selectableDon,
    0,
    selectableDon.length
  );
  const results: Array<{
    selectedCards?: PublicPaymentCardRef[];
    selectedDon?: PublicPaymentCardRef[];
  }> = [];

  for (const selectedCards of cardSelections) {
    for (const selectedDon of donSelections) {
      const totalSelected = selectedCards.length + selectedDon.length;
      if (totalSelected < option.min || totalSelected > option.max) {
        continue;
      }

      const selection: {
        selectedCards?: PublicPaymentCardRef[];
        selectedDon?: PublicPaymentCardRef[];
      } = {};

      if (selectedCards.length > 0) {
        selection.selectedCards = selectedCards.map(toPublicPaymentCardRef);
      }
      if (selectedDon.length > 0) {
        selection.selectedDon = selectedDon.map(toPublicPaymentCardRef);
      }

      results.push(selection);
    }
  }

  return results;
}

function hasLegalResponsesForDecision(
  pendingDecision: PendingDecision
): boolean {
  switch (pendingDecision.type) {
    case "mulligan":
    case "chooseOptionalActivation":
    case "confirmTriggerFromLife":
      return true;
    case "chooseTriggerOrder":
      return pendingDecision.triggerIds.length > 0;
    case "payCost":
      return pendingDecision.options.some(
        (option) => legalPaymentSelections(option).length > 0
      );
    case "selectTargets":
      return (
        chooseCombinationsInRange(
          pendingDecision.candidates.map((candidate) =>
            requireInstanceId(candidate)
          ),
          minSelectionsRequired(
            pendingDecision.request.min,
            pendingDecision.candidates.length,
            pendingDecision.request.allowFewerIfUnavailable
          ),
          pendingDecision.request.max
        ).length > 0
      );
    case "selectCards":
      return (
        chooseCombinationsInRange(
          pendingDecision.candidates.map((candidate) =>
            requireInstanceId(candidate)
          ),
          minSelectionsRequired(
            pendingDecision.request.min,
            pendingDecision.candidates.length,
            pendingDecision.request.allowFewerIfUnavailable
          ),
          pendingDecision.request.max
        ).length > 0
      );
    case "chooseEffectOption":
      return (
        chooseCombinationsInRange(
          pendingDecision.options
            .filter((option) => option.availability !== "unavailable")
            .map((option) => option.id),
          pendingDecision.min,
          pendingDecision.max
        ).length > 0
      );
    case "chooseReplacement":
      return (
        pendingDecision.replacementIds.length > 0 || pendingDecision.optional
      );
    case "orderCards":
      return pendingDecision.cards.length > 0;
    case "chooseCharacterToTrashForOverflow":
      return pendingDecision.candidates.length > 0;
    default:
      return false;
  }
}

function legalResponsesForDecision(pendingDecision: PendingDecision): Action[] {
  const respond = (response: DecisionResponse): Action => ({
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response
  });

  switch (pendingDecision.type) {
    case "mulligan":
      return [
        respond({ type: "keepOpeningHand" }),
        respond({ type: "mulligan" })
      ];
    case "chooseTriggerOrder":
      return choosePermutations(pendingDecision.triggerIds).map((ids) =>
        respond({ type: "orderedIds", ids })
      );
    case "chooseOptionalActivation":
      return [
        respond({ type: "optionalActivationChoice", choice: "activate" }),
        respond({ type: "optionalActivationChoice", choice: "decline" })
      ];
    case "payCost":
      return pendingDecision.options.flatMap((option) =>
        legalPaymentSelections(option).map((selection) =>
          respond({
            type: "payment",
            selection: { optionId: option.id, ...selection }
          })
        )
      );
    case "selectTargets":
      return chooseCombinationsInRange(
        pendingDecision.candidates.map((candidate) =>
          requireInstanceId(candidate)
        ),
        minSelectionsRequired(
          pendingDecision.request.min,
          pendingDecision.candidates.length,
          pendingDecision.request.allowFewerIfUnavailable
        ),
        pendingDecision.request.max
      ).map((selected) =>
        respond({
          type: "targetSelection",
          selected: selected.map((instanceId) => ({ instanceId }))
        })
      );
    case "selectCards":
      return chooseCombinationsInRange(
        pendingDecision.candidates.map((candidate) =>
          requireInstanceId(candidate)
        ),
        minSelectionsRequired(
          pendingDecision.request.min,
          pendingDecision.candidates.length,
          pendingDecision.request.allowFewerIfUnavailable
        ),
        pendingDecision.request.max
      ).map((selected) =>
        respond({
          type: "cardSelection",
          selected: selected.map((instanceId) => ({ instanceId }))
        })
      );
    case "chooseEffectOption":
      return chooseCombinationsInRange(
        pendingDecision.options
          .filter((option) => option.availability !== "unavailable")
          .map((option) => option.id),
        pendingDecision.min,
        pendingDecision.max
      ).map((optionIds) =>
        respond({ type: "effectOptionSelection", optionIds })
      );
    case "confirmTriggerFromLife":
      return [
        respond({ type: "lifeTriggerChoice", choice: "activateTrigger" }),
        respond({ type: "lifeTriggerChoice", choice: "addToHand" })
      ];
    case "chooseReplacement": {
      const actions = pendingDecision.replacementIds.map((replacementId) =>
        respond({ type: "replacementChoice", replacementId })
      );
      if (pendingDecision.optional) {
        actions.push(
          respond({ type: "replacementChoice", replacementId: null })
        );
      }
      return actions;
    }
    case "orderCards":
      return choosePermutations(
        pendingDecision.cards.map((card) => requireInstanceId(card))
      ).map((ordered) =>
        respond({
          type: "orderCards",
          ordered: ordered.map((instanceId) => ({ instanceId }))
        })
      );
    case "chooseCharacterToTrashForOverflow":
      return pendingDecision.candidates.map((candidate) =>
        respond({
          type: "chooseCharacterToTrash",
          instanceId: requireInstanceId(candidate)
        })
      );
    default:
      return [];
  }
}

function assertValidDecisionResponse(
  pendingDecision: PendingDecision,
  response: DecisionResponse
): void {
  switch (pendingDecision.type) {
    case "mulligan":
      return;
    case "chooseOptionalActivation": {
      const optionalActivationResponse = response as Extract<
        DecisionResponse,
        { type: "optionalActivationChoice" }
      >;
      if (
        optionalActivationResponse.choice !== "activate" &&
        optionalActivationResponse.choice !== "decline"
      ) {
        throw new Error(
          "optionalActivationChoice response references an unknown choice"
        );
      }
      return;
    }
    case "confirmTriggerFromLife": {
      const lifeTriggerResponse = response as Extract<
        DecisionResponse,
        { type: "lifeTriggerChoice" }
      >;
      if (
        lifeTriggerResponse.choice !== "activateTrigger" &&
        lifeTriggerResponse.choice !== "addToHand"
      ) {
        throw new Error(
          "lifeTriggerChoice response references an unknown choice"
        );
      }
      return;
    }
    case "chooseTriggerOrder": {
      const orderedIdsResponse = response as Extract<
        DecisionResponse,
        { type: "orderedIds" }
      >;
      if (orderedIdsResponse.ids.length !== pendingDecision.triggerIds.length) {
        throw new Error(
          "chooseTriggerOrder response must include every trigger exactly once"
        );
      }
      if (
        !arraysEqualUnordered(
          orderedIdsResponse.ids,
          pendingDecision.triggerIds
        )
      ) {
        throw new Error(
          "chooseTriggerOrder response must reference the pending trigger ids"
        );
      }
      return;
    }
    case "payCost": {
      const paymentResponse = response as Extract<
        DecisionResponse,
        { type: "payment" }
      >;
      const option = pendingDecision.options.find(
        (candidate) => candidate.id === paymentResponse.selection.optionId
      );
      if (!option) {
        throw new Error(
          "payment response references an unknown payment option"
        );
      }
      const selectedCards = paymentResponse.selection.selectedCards ?? [];
      const selectedDon = paymentResponse.selection.selectedDon ?? [];
      const selectedCardIds = selectedCards.map((card) => card.instanceId);
      const selectedDonIds = selectedDon.map((card) => card.instanceId);
      const totalSelected = selectedCards.length + selectedDon.length;
      if (totalSelected < option.min || totalSelected > option.max) {
        throw new Error("payment response does not satisfy the option min/max");
      }
      if (hasDuplicateValues([...selectedCardIds, ...selectedDonIds])) {
        throw new Error("payment response may not include duplicate cards");
      }
      const selectableCardIds = (option.selectableCards ?? []).map((card) =>
        requireInstanceId(card)
      );
      const selectableDonIds = (option.selectableDon ?? []).map((card) =>
        requireInstanceId(card)
      );
      if (
        !selectedCardIds.every((instanceId) =>
          selectableCardIds.includes(instanceId)
        )
      ) {
        throw new Error(
          "payment response references a non-selectable payment card"
        );
      }
      if (
        !selectedDonIds.every((instanceId) =>
          selectableDonIds.includes(instanceId)
        )
      ) {
        throw new Error(
          "payment response references a non-selectable DON card"
        );
      }
      return;
    }
    case "selectTargets": {
      const targetSelectionResponse = response as Extract<
        DecisionResponse,
        { type: "targetSelection" }
      >;
      const ids = pendingDecision.candidates.map((candidate) =>
        requireInstanceId(candidate)
      );
      const selectedIds = targetSelectionResponse.selected.map(
        (card) => card.instanceId
      );
      const minSelections = minSelectionsRequired(
        pendingDecision.request.min,
        pendingDecision.candidates.length,
        pendingDecision.request.allowFewerIfUnavailable
      );
      if (
        selectedIds.length < minSelections ||
        selectedIds.length > pendingDecision.request.max
      ) {
        throw new Error("targetSelection response violates min/max");
      }
      if (hasDuplicateValues(selectedIds)) {
        throw new Error("targetSelection response may not contain duplicates");
      }
      if (!selectedIds.every((instanceId) => ids.includes(instanceId))) {
        throw new Error(
          "targetSelection response references a non-candidate card"
        );
      }
      return;
    }
    case "selectCards": {
      const cardSelectionResponse = response as Extract<
        DecisionResponse,
        { type: "cardSelection" }
      >;
      const ids = pendingDecision.candidates.map((candidate) =>
        requireInstanceId(candidate)
      );
      const selectedIds = cardSelectionResponse.selected.map(
        (card) => card.instanceId
      );
      const minSelections = minSelectionsRequired(
        pendingDecision.request.min,
        pendingDecision.candidates.length,
        pendingDecision.request.allowFewerIfUnavailable
      );
      if (
        selectedIds.length < minSelections ||
        selectedIds.length > pendingDecision.request.max
      ) {
        throw new Error("cardSelection response violates min/max");
      }
      if (hasDuplicateValues(selectedIds)) {
        throw new Error("cardSelection response may not contain duplicates");
      }
      if (!selectedIds.every((instanceId) => ids.includes(instanceId))) {
        throw new Error(
          "cardSelection response references a non-candidate card"
        );
      }
      return;
    }
    case "chooseEffectOption": {
      const effectOptionResponse = response as Extract<
        DecisionResponse,
        { type: "effectOptionSelection" }
      >;
      if (
        effectOptionResponse.optionIds.length < pendingDecision.min ||
        effectOptionResponse.optionIds.length > pendingDecision.max
      ) {
        throw new Error("effectOptionSelection response violates min/max");
      }
      if (hasDuplicateValues(effectOptionResponse.optionIds)) {
        throw new Error(
          "effectOptionSelection response may not contain duplicates"
        );
      }
      const optionIds = pendingDecision.options
        .filter((option) => option.availability !== "unavailable")
        .map((option) => option.id);
      if (
        !effectOptionResponse.optionIds.every((optionId) =>
          optionIds.includes(optionId)
        )
      ) {
        throw new Error("effectOptionSelection references an unknown option");
      }
      return;
    }
    case "chooseReplacement": {
      const replacementResponse = response as Extract<
        DecisionResponse,
        { type: "replacementChoice" }
      >;
      if (
        replacementResponse.replacementId === null &&
        !pendingDecision.optional
      ) {
        throw new Error(
          "replacementChoice may only decline optional replacements"
        );
      }
      if (
        replacementResponse.replacementId !== null &&
        !pendingDecision.replacementIds.includes(
          replacementResponse.replacementId
        )
      ) {
        throw new Error(
          "replacementChoice references an unknown replacement id"
        );
      }
      return;
    }
    case "orderCards": {
      const orderCardsResponse = response as Extract<
        DecisionResponse,
        { type: "orderCards" }
      >;
      const ids = pendingDecision.cards.map((card) => requireInstanceId(card));
      const orderedIds = orderCardsResponse.ordered.map(
        (card) => card.instanceId
      );
      if (orderedIds.length !== ids.length) {
        throw new Error(
          "orderCards response must include every candidate card"
        );
      }
      if (!arraysEqualUnordered(orderedIds, ids)) {
        throw new Error(
          "orderCards response must contain exactly the offered cards"
        );
      }
      return;
    }
    case "chooseCharacterToTrashForOverflow": {
      const chooseCharacterResponse = response as Extract<
        DecisionResponse,
        { type: "chooseCharacterToTrash" }
      >;
      const ids = pendingDecision.candidates.map((candidate) =>
        requireInstanceId(candidate)
      );
      if (!ids.includes(chooseCharacterResponse.instanceId)) {
        throw new Error(
          "chooseCharacterToTrash response references an unknown candidate"
        );
      }
      return;
    }
    default:
      return;
  }
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId
): Action[] {
  if (
    !(playerId in state.players) ||
    state.status === "setup" ||
    state.status === "frozen" ||
    state.status === "completed" ||
    state.status === "errored"
  ) {
    return [];
  }

  const legal: Action[] = [{ type: "concede", playerId }];

  if (state.pendingDecision) {
    if (state.pendingDecision.playerId !== playerId) {
      return legal;
    }
    return [...legal, ...legalResponsesForDecision(state.pendingDecision)];
  }

  if (state.turn.activePlayer !== playerId) {
    return legal;
  }

  if (state.turn.phase === "main" || state.turn.phase === "end") {
    legal.push({ type: "endMainPhase" });
  }
  return legal;
}

export function applyAction(state: GameState, action: Action): EngineResult {
  if (state.status === "setup") {
    throw new Error("Actions are not allowed while the match is in setup");
  }
  if (state.status === "completed" || state.status === "errored") {
    throw new Error("Actions are not allowed once the match is terminal");
  }

  if (state.status === "frozen") {
    throw new Error("Actions are not allowed while the match is frozen");
  }

  if (action.type === "concede") {
    const concedingPlayerId = action.playerId;
    if (!(concedingPlayerId in state.players)) {
      throw new Error("Concede references unknown player");
    }
    const nextState = cloneStateForMutation(state);
    delete nextState.pendingDecision;
    nextState.status = "completed";
    nextState.winner = getOpponentId(state, concedingPlayerId);
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

  if (action.type === "respondToDecision") {
    if (
      !state.pendingDecision ||
      state.pendingDecision.id !== action.decisionId
    ) {
      throw new Error("respondToDecision requires the active pending decision");
    }
    return resumeDecision(state, action.response);
  }

  if (state.pendingDecision) {
    throw new Error(
      "Non-decision actions are not allowed while a pending decision exists"
    );
  }

  const nextState = cloneStateForMutation(state);
  switch (action.type) {
    case "endMainPhase": {
      if (state.turn.phase === "main") {
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
      if (state.turn.phase === "end") {
        nextState.turn.activePlayer = state.turn.nonActivePlayer;
        nextState.turn.nonActivePlayer = state.turn.activePlayer;
        nextState.turn.globalTurnNumber = (state.turn.globalTurnNumber +
          1) as TurnState["globalTurnNumber"];
        nextState.turn.phase = "refresh";
        return finalizeResult(state, nextState, [
          {
            type: "phaseEnded",
            payload: { phase: "end", playerId: state.turn.activePlayer }
          },
          {
            type: "phaseStarted",
            payload: { phase: "refresh", playerId: nextState.turn.activePlayer }
          }
        ]);
      }
      throw new Error(
        "endMainPhase is only valid during the main or end phase"
      );
    }
    default:
      throw new Error(`Action ${action.type} is not implemented in ENG-001`);
  }
}

export function resumeDecision(
  state: GameState,
  response: DecisionResponse
): EngineResult {
  if (state.status === "setup") {
    throw new Error("Decisions may not resolve while the match is in setup");
  }
  if (state.status === "frozen") {
    throw new Error("Decisions may not resolve while the match is frozen");
  }

  if (!state.pendingDecision) {
    throw new Error("resumeDecision requires an active pending decision");
  }

  assertPendingDecisionResponseMatches(state.pendingDecision, response);
  assertValidDecisionResponse(state.pendingDecision, response);

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
      const inPlay =
        card.zone.zone === "leaderArea" || card.zone.zone === "characterArea";
      const computed: ComputedCardView = {
        instanceId: card.instanceId,
        cardId: card.cardId,
        keywords: [...metadata.keywords],
        canAttack: inPlay && card.state === "active",
        canBlock:
          card.zone.zone === "characterArea" &&
          card.state === "active" &&
          metadata.keywords.includes("blocker"),
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
    legalActions: buildPublicLegalActions(state, playerId),
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
