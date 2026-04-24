/**
 * Canonical implementation contract for OPTCG simulator v6.
 *
 * This file is intentionally standalone: it has no imports and should compile
 * with `tsc --noEmit --strict`. Markdown examples may abbreviate these shapes,
 * but implementation packages should converge on this contract first.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type CardId = Brand<string, "CardId">; // Poneglyph base card id, e.g. OP05-091
export type VariantKey = Brand<string, "VariantKey">; // generated, e.g. OP05-091:v0
export type InstanceId = Brand<string, "InstanceId">;
export type PlayerId = Brand<string, "PlayerId">;
export type UserId = Brand<string, "UserId">;
export type MatchId = Brand<string, "MatchId">;
export type DeckId = Brand<string, "DeckId">;
export type LobbyId = Brand<string, "LobbyId">;
export type QueueTicketId = Brand<string, "QueueTicketId">;
export type FormatId = Brand<string, "FormatId">;
export type LadderId = Brand<string, "LadderId">;
export type LoadoutId = Brand<string, "LoadoutId">;
export type EffectId = Brand<string, "EffectId">;
export type EngineEventId = Brand<string, "EngineEventId">;
export type DecisionId = Brand<string, "DecisionId">;
export type QueueEntryId = Brand<string, "QueueEntryId">;
export type TimingWindowId = Brand<string, "TimingWindowId">;
export type SelectionSetId = Brand<string, "SelectionSetId">;
export type SelectionId = Brand<string, "SelectionId">;
export type ReplayId = Brand<string, "ReplayId">;
export type StateSeq = Brand<number, "StateSeq">;
export type ServerSeq = Brand<number, "ServerSeq">;
export type ActionSeq = Brand<number, "ActionSeq">;
export type TurnNumber = Brand<number, "TurnNumber">;
export type ManifestHash = Brand<string, "ManifestHash">;
export type Sha256 = Brand<string, "Sha256">;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type CardColor =
  | "red"
  | "green"
  | "blue"
  | "purple"
  | "black"
  | "yellow";
export type Attribute = "slash" | "strike" | "ranged" | "special" | "wisdom";
export type CardCategory = "leader" | "character" | "event" | "stage" | "don";
export type CardState = "active" | "rested" | "attached" | "none";
export type Keyword =
  | "rush"
  | "blocker"
  | "doubleAttack"
  | "banish"
  | "counter"
  | "trigger"
  | "donX"
  | "cannotBeKOd"
  | "cannotAttack"
  | "custom";

export type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";

export type GameType = "ranked" | "unranked" | "custom";
export type QueueGameType = Extract<GameType, "ranked" | "unranked">;
export type LobbyVisibility = "public" | "friends" | "invite-only" | "private";
export type DisconnectResolutionType =
  | "reconnected"
  | "graceExpiredForfeit"
  | "mutualAbandon"
  | "infrastructureNoContest"
  | "adminOverride";

export type ZoneName =
  | "deck"
  | "donDeck"
  | "hand"
  | "trash"
  | "leaderArea"
  | "characterArea"
  | "stageArea"
  | "costArea"
  | "life"
  | "attached"
  | "noZone";

export type ZoneRef =
  | {
      zone: Exclude<ZoneName, "attached" | "noZone">;
      playerId: PlayerId;
      index?: number;
    }
  | {
      zone: "attached";
      playerId: PlayerId;
      hostInstanceId: InstanceId;
      index?: number;
    }
  | { zone: "noZone"; owner?: PlayerId; label: string };

export type PlayerRef =
  | "self"
  | "opponent"
  | "turnPlayer"
  | "nonTurnPlayer"
  | "owner"
  | "controller";
export type Comparator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export interface NumericFilter {
  op?: Comparator;
  value?: number;
  min?: number;
  max?: number;
}

export interface CardFilter {
  cardIds?: CardId[];
  names?: string[];
  nameContains?: string;
  nameNot?: string[];
  categories?: CardCategory[];
  colorsAny?: CardColor[];
  colorsAll?: CardColor[];
  typesAny?: string[];
  typesAll?: string[];
  attributesAny?: Attribute[];
  attributesAll?: Attribute[];
  cost?: NumericFilter;
  power?: NumericFilter;
  counter?: NumericFilter;
  hasKeywords?: Keyword[];
  lacksKeywords?: Keyword[];
  state?: Exclude<CardState, "none">;
  owner?: PlayerRef;
  controller?: PlayerRef;
  excludeSelf?: boolean;
  custom?: string;
}

export interface CardImplementationRecord {
  status: CardSupportStatus;
  effectDefinitionIds: EffectId[];
  customHandlerIds: string[];
  sourceTextHash: Sha256;
  behaviorHash: Sha256;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface ResolvedCardVariant {
  variantKey: VariantKey;
  variantIndex: number; // Poneglyph variants[].index; default display is index 0 when present
  label?: string;
  artist?: string;
  productId?: string;
  productSlug?: string;
  productName?: string;
  productSetCode?: string;
  stockImageFull?: string;
  stockImageThumb?: string;
  scanImageDisplay?: string;
  scanImageFull?: string;
  scanImageThumb?: string;
}

export interface PoneglyphLegalityRecord {
  status: string;
  bannedAt?: string;
  reason?: string;
  maxCopies?: number;
  pairedWith?: CardId[];
}

export interface PoneglyphOfficialFaq {
  question: string;
  answer: string;
  updatedOn: string;
}

export interface ResolvedCard {
  cardId: CardId;
  language: string;
  name: string;
  category: CardCategory;
  set: string;
  setName: string;
  block?: string;
  released: boolean;
  releasedAt?: string;
  rarity?: string;
  colors: CardColor[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
  effectText?: string;
  triggerText?: string;
  printedKeywords: Keyword[];
  variants: ResolvedCardVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  officialFaq: PoneglyphOfficialFaq[];
  sourceTextHash: Sha256;
  behaviorHash: Sha256;
  support: CardImplementationRecord;
}

export interface MatchCardManifest {
  manifestHash: ManifestHash;
  source: "poneglyph" | "poneglyph-fixture" | "manual-test";
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}

export interface QueueDescriptor {
  ticketId?: QueueTicketId;
  gameType: QueueGameType;
  formatId: FormatId;
  ladderId?: LadderId;
  seasonId?: string;
  regionHint?: string;
}

export interface QueueJoinRequest {
  gameType: QueueGameType;
  formatId: FormatId;
  deckId: DeckId;
  loadoutId?: LoadoutId;
  ladderId?: LadderId;
  regionHint?: string;
}

export interface LobbyConfiguration {
  lobbyId: LobbyId;
  hostUserId: UserId;
  name?: string;
  visibility: LobbyVisibility;
  passwordRequired: boolean;
  passwordHash?: Sha256;
  formatId: FormatId;
  allowSpectators: boolean;
  allowRematch: boolean;
  maxSpectators?: number;
}

export interface CreateLobbyRequest {
  formatId: FormatId;
  hostDeckId: DeckId;
  hostLoadoutId?: LoadoutId;
  visibility: LobbyVisibility;
  name?: string;
  password?: string;
}

export interface DisconnectDisciplineStep {
  offenseCount: number;
  lockoutMs: number;
}

export interface DisconnectDisciplinePolicy {
  enabled: boolean;
  strikeWindowDays: number;
  lockoutSchedule: DisconnectDisciplineStep[];
  infrastructureExemptionEnabled: boolean;
}

export interface DisconnectPolicy {
  gracePeriodMs: number;
  forfeitAfterMs: number;
  pauseTimersDuringGrace: boolean;
  allowReconnectAfterForfeit: boolean;
  countsAsLossOnGraceExpiry: boolean;
  discipline?: DisconnectDisciplinePolicy;
}

export interface EloPolicy {
  system: "elo";
  ladderId: LadderId;
  seasonId: string;
  initialRating: number;
  kFactor: number;
  drawScore: number;
  disconnectForfeitCountsAsLoss: boolean;
}

export interface MatchConfiguration {
  gameType: GameType;
  formatId: FormatId;
  queue?: QueueDescriptor;
  lobbyConfig?: LobbyConfiguration;
  spectatorPolicy: SpectatorPolicy;
  disconnectPolicy: DisconnectPolicy;
  ratingPolicy?: EloPolicy;
}

export interface DisconnectResolution {
  type: DisconnectResolutionType;
  playerId: PlayerId;
  resolvedAt: string;
  strikeApplied?: boolean;
  lockoutMs?: number;
  note?: string;
}

export interface RngState {
  algorithm: "pcg32" | "xoshiro256ss" | "test-fixed";
  /** Actual seed is server-only during a live match. Replays must either include it after game completion or include an initial snapshot. */
  seed?: string;
  seedCommitment?: Sha256;
  internalState: string;
  callCount: number;
}

export interface CardInstance {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state: CardState;
  attachedDon: InstanceId[];
  turnPlayed?: TurnNumber;
  createdAtStateSeq: StateSeq;
  lastKnownInfo?: CardSnapshot;
}

export interface CardSnapshot {
  instanceId?: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state: CardState;
  attachedDonCount: number;
  name: string;
  category: CardCategory;
  colors: CardColor[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
}

export interface CardRef {
  instanceId?: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone?: ZoneRef;
  snapshot?: CardSnapshot;
}

export interface LifeCard {
  card: CardInstance;
  faceUp: boolean;
}

export interface PlayerState {
  playerId: PlayerId;
  deck: CardInstance[]; // index 0 is top of deck
  donDeck: CardInstance[]; // index 0 is top of DON!! deck
  hand: CardInstance[];
  trash: CardInstance[]; // index 0 is top/newest unless an effect defines simultaneous ordering
  leader: CardInstance;
  characters: CardInstance[];
  stage?: CardInstance;
  costArea: CardInstance[];
  life: LifeCard[]; // index 0 is top of Life area, the next card taken for damage
  hasMulliganed: boolean;
  keptOpeningHand: boolean;
  turnCount: number;
}

export type Phase =
  | "setup"
  | "refresh"
  | "draw"
  | "don"
  | "main"
  | "end"
  | "gameOver";

export interface TurnState {
  activePlayer: PlayerId;
  nonActivePlayer: PlayerId;
  firstPlayer: PlayerId;
  globalTurnNumber: TurnNumber;
  phase: Phase;
  priorityPlayer?: PlayerId;
}

export type BattleTarget =
  | { type: "leader"; playerId: PlayerId }
  | { type: "character"; instanceId: InstanceId };

export interface BattleState {
  attacker: InstanceId;
  originalTarget: BattleTarget;
  currentTarget: BattleTarget;
  blocker?: InstanceId;
  step: "attack" | "block" | "counter" | "damage" | "end";
  damageCount: number;
  startedAtStateSeq: StateSeq;
}

export type CausalityRef =
  | { type: "action"; actionSeq: ActionSeq }
  | { type: "decision"; decisionId: DecisionId }
  | { type: "event"; eventId: EngineEventId }
  | { type: "effect"; queueEntryId: QueueEntryId; effectId: EffectId }
  | { type: "rule"; rule: string }
  | { type: "system"; label: string };

export type EventVisibility =
  | { type: "public" }
  | { type: "private"; playerIds: PlayerId[] }
  | { type: "replayOnly" }
  | { type: "serverOnly" };

export type EngineEventType =
  | "setupStarted"
  | "deckShuffled"
  | "openingHandDrawn"
  | "mulliganResolved"
  | "lifeSetupCompleted"
  | "phaseStarted"
  | "phaseEnded"
  | "cardMoved"
  | "cardRevealed"
  | "cardHidden"
  | "cardDrawn"
  | "cardPlayed"
  | "cardKOd"
  | "ruleTrash"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageDealt"
  | "lifeTaken"
  | "lifeTriggerOffered"
  | "lifeTriggerResolved"
  | "effectQueued"
  | "effectStarted"
  | "effectResolved"
  | "effectCancelled"
  | "replacementApplied"
  | "continuousEffectCreated"
  | "continuousEffectExpired"
  | "ruleProcessing"
  | "gameOver";

export interface EngineEvent {
  id: EngineEventId;
  eventSeq: number;
  stateSeq: StateSeq;
  type: EngineEventType;
  actor?: PlayerId;
  source?: CardRef;
  payload: JsonValue;
  causedBy?: CausalityRef;
  visibility: EventVisibility;
}

export type SourcePresencePolicy =
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired";

export interface EffectQueueEntry {
  id: QueueEntryId;
  state: "pending" | "resolving" | "resolved" | "cancelled";
  timingWindowId: TimingWindowId;
  generation: number;
  controllerId: PlayerId;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  triggerEventId?: EngineEventId;
  effectBlockId: EffectId;
  orderingGroup: "turnPlayer" | "nonTurnPlayer";
  createdAtEventSeq: number;
  queuedAtStateSeq: StateSeq;
  sourcePresencePolicy: SourcePresencePolicy;
  causedBy: CausalityRef;
}

export interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: EffectId;
  turnNumber: TurnNumber;
  consumedAtStateSeq: StateSeq;
  consumedBy: CausalityRef;
}

export interface ReplacementProcessState {
  processId: string;
  type: ReplaceableProcessType;
  usedReplacementIds: EffectId[];
  causedBy: CausalityRef;
}

export type ReplaceableProcessType =
  | "wouldBeKOd"
  | "wouldTakeDamage"
  | "wouldBeTrashed"
  | "wouldDraw"
  | "wouldMoveZone"
  | "wouldReturnDon"
  | "custom";

export type ModifierLayer =
  | "basePowerSet"
  | "baseCostSet"
  | "powerAdd"
  | "costAdd"
  | "keywordAdd"
  | "keywordRemove"
  | "restriction"
  | "protection";

export type ModifierOperation =
  | { type: "set"; value: number | string | boolean }
  | { type: "add"; value: number }
  | { type: "remove"; value: string }
  | { type: "flag"; value: boolean };

export type Duration =
  | { type: "thisAction" }
  | { type: "thisBattle" }
  | { type: "thisTurn" }
  | {
      type: "untilEndOfTurn";
      whoseTurn?: "current" | "sourceController" | "targetController";
    }
  | { type: "untilStartOfNextTurn"; player: PlayerRef }
  | { type: "whileSourceOnField" }
  | { type: "whileConditionTrue"; condition: Condition }
  | { type: "permanent" };

export interface TargetSpec {
  target: Target;
}

export interface Modifier {
  layer: ModifierLayer;
  target: TargetSpec;
  operation: ModifierOperation;
}

export interface ContinuousEffect {
  id: string;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  controller: PlayerId;
  modifier: Modifier;
  duration: Duration;
  condition?: Condition;
  createdBy: CausalityRef;
  createdAtStateSeq: StateSeq;
}

export interface GameState {
  matchId: MatchId;
  stateSeq: StateSeq;
  actionSeq: ActionSeq;
  rulesVersion: string;
  engineVersion: string;
  cardManifest: MatchCardManifest;
  matchConfig: MatchConfiguration;
  rng: RngState;
  players: Record<PlayerId, PlayerState>;
  turn: TurnState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  effectQueue: EffectQueueEntry[];
  continuousEffects: ContinuousEffect[];
  oncePerTurn: OncePerTurnRecord[];
  replacementState: ReplacementProcessState[];
  eventJournal: EngineEvent[];
  winner?: PlayerId | "draw";
  status: "setup" | "active" | "frozen" | "completed" | "errored";
}

export type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";
export type EffectCategory = "auto" | "activate" | "permanent" | "replacement";
export type ConditionTiming = "activation" | "resolution" | "both";

export type Trigger =
  | { type: "onPlay" }
  | { type: "whenAttacking" }
  | { type: "onOpponentAttack" }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "donAttach"; count: number }
  | { type: "activateMain" }
  | { type: "main" }
  | { type: "counter" }
  | { type: "permanent" }
  | { type: "replacement"; replacement: ReplacementTrigger }
  | { type: "startOfGame" }
  | { type: "startOfYourTurn" }
  | { type: "startOfMainPhase" }
  | { type: "endOfBattle" }
  | { type: "custom"; event: string };

export type Condition =
  | { type: "donCount"; target?: Target; min: number }
  | { type: "attachedDonCount"; target: Target; op: Comparator; value: number }
  | { type: "yourTurn" }
  | { type: "opponentTurn" }
  | { type: "lifeCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "fieldCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | { type: "handCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "trashCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | {
      type: "hasCardInZone";
      zone: ZoneName;
      player: PlayerRef;
      filter: CardFilter;
    }
  | { type: "attackTarget"; targetType: "leader" | "character" | "any" }
  | { type: "cardState"; target: Target; state: Exclude<CardState, "none"> }
  | { type: "sourceStillInZone" }
  | { type: "eventPayload"; path: string; op: Comparator; value: JsonValue }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "custom"; check: string };

export type Cost =
  | { type: "restDon"; count: number; chooser?: PlayerRef }
  | {
      type: "returnDon";
      count: number;
      chooser?: PlayerRef;
      sources?: Array<"costArea" | "attachedToLeader" | "attachedToCharacters">;
    }
  | { type: "restSelf" }
  | {
      type: "trashFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "trashSelf" }
  | {
      type: "trashFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "discard"; count: number; filter?: CardFilter; chooser: PlayerRef }
  | { type: "sequence"; costs: Cost[] }
  | { type: "chooseOne"; options: Cost[] }
  | { type: "custom"; action: string };

export type Target =
  | { type: "self" }
  | { type: "myLeader" }
  | { type: "opponentLeader" }
  | { type: "attacker" }
  | { type: "attackTarget" }
  | { type: "blocker" }
  | { type: "triggerCard" }
  | { type: "all"; zone: ZoneName; player: PlayerRef; filter?: CardFilter }
  | { type: "choose"; request: TargetRequest }
  | { type: "selection"; selectionId: SelectionId };

export interface TargetRequest {
  timing: "onActivation" | "onResolution";
  chooser: PlayerRef;
  zone: ZoneName;
  player: PlayerRef;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}

export interface CardSelectionRequest {
  chooser: PlayerRef;
  zone?: ZoneName;
  player?: PlayerRef;
  setId?: SelectionSetId;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility: "public" | "privateToChooser" | "replayOnly";
  saveAs?: SelectionId;
}

export interface PaymentOption {
  id: string;
  cost: Cost;
  selectableCards?: CardRef[];
  selectableDon?: CardRef[];
  min: number;
  max: number;
}

export interface CostPaymentSelection {
  optionId: string;
  selectedCards?: CardRef[];
  selectedDon?: CardRef[];
}

export interface EffectOption {
  id: string;
  label: string;
  effect: Effect;
  availability?: "available" | "unavailable";
}

export type Visibility =
  | "bothPlayers"
  | "chooserOnly"
  | "ownerOnly"
  | "controllerOnly"
  | "hidden"
  | "replayOnly";

export type Effect =
  | { type: "draw"; count: number; player: PlayerRef }
  | { type: "drawUpTo"; count: number; player: PlayerRef }
  | { type: "search"; request: SearchRequest }
  | {
      type: "lookAtTop";
      player: PlayerRef;
      count: number;
      saveAs?: SelectionSetId;
      visibility?: Visibility;
    }
  | {
      type: "revealTop";
      player: PlayerRef;
      count: number;
      saveAs: SelectionSetId;
      visibility: Visibility;
    }
  | {
      type: "revealFromZone";
      player: PlayerRef;
      zone: ZoneName;
      count?: number;
      filter?: CardFilter;
      to: Visibility;
      saveAs?: SelectionSetId;
    }
  | {
      type: "selectFromSet";
      set: SelectionSetId;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
    }
  | { type: "selectCards"; request: CardSelectionRequest }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: ZoneName | SelectionSetId;
      to: ZoneName;
      position?: "top" | "bottom";
    }
  | {
      type: "putRemaining";
      set?: SelectionSetId;
      zone: ZoneName;
      position: "top" | "bottom";
      order: "original" | "ownerChoice" | "chooserChoice" | "random";
      faceDown?: boolean;
    }
  | {
      type: "returnUnselectedToDeck";
      set: SelectionSetId;
      player: PlayerRef;
      position: "top" | "bottom";
      order: "original" | "ownerChoice" | "random";
      faceDown: boolean;
    }
  | { type: "shuffleDeck"; player: PlayerRef }
  | {
      type: "bounce";
      target: Target;
      destination: "hand" | "deckTop" | "deckBottom";
    }
  | { type: "trash"; target: Target }
  | { type: "ko"; target: Target }
  | {
      type: "play";
      source: ZoneName;
      player: PlayerRef;
      filter: CardFilter;
      costModifier?: number;
      enterRested?: boolean;
      ignoreCost?: boolean;
    }
  | {
      type: "playSelected";
      selection: SelectionId;
      enterRested?: boolean;
      ignoreCost?: boolean;
    }
  | {
      type: "trashFromHand";
      player: PlayerRef;
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "modifyPower"; target: Target; value: number; duration: Duration }
  | { type: "setPowerToZero"; target: Target; duration: Duration }
  | { type: "setBasePower"; target: Target; value: number; duration: Duration }
  | {
      type: "modifyCost";
      filter: CardFilter;
      value: number;
      duration: Duration;
      player: PlayerRef;
    }
  | { type: "setBaseCost"; target: Target; value: number; duration: Duration }
  | { type: "rest"; target: Target }
  | { type: "activate"; target: Target }
  | {
      type: "giveKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | {
      type: "removeKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | { type: "addDon"; count: number; player: PlayerRef }
  | { type: "attachDon"; target: Target; count: number; player: PlayerRef }
  | {
      type: "returnDon";
      count: number;
      player: PlayerRef;
      sources?: Array<"costArea" | "attachedToLeader" | "attachedToCharacters">;
    }
  | {
      type: "addLife";
      count: number;
      player: PlayerRef;
      source: "deck" | "hand" | "trash";
      faceUp?: boolean;
      position?: "top" | "bottom";
    }
  | { type: "damage"; target: "leader"; player: PlayerRef; count: number }
  | { type: "invalidateEffects"; target: Target; duration: Duration }
  | { type: "protectFromKO"; target: Target; duration: Duration }
  | { type: "cannotAttack"; target: Target; duration: Duration }
  | { type: "cannotBlock"; target: Target; duration: Duration }
  | { type: "cannotBeAttacked"; target: Target; duration: Duration }
  | {
      type: "cannotBeBlockedBy";
      target: Target;
      filter: CardFilter;
      duration: Duration;
    }
  | { type: "sequence"; effects: SequencedEffect[] }
  | {
      type: "choice";
      chooser: PlayerRef;
      options: EffectOption[];
      min: number;
      max: number;
    }
  | { type: "conditional"; if: Condition; then: Effect; else?: Effect }
  | {
      type: "forEachMatch";
      zone: ZoneName;
      player: PlayerRef;
      filter: CardFilter;
      effect: Effect;
    }
  | { type: "repeat"; count: number; effect: Effect }
  | { type: "replacement"; when: ReplacementTrigger; instead: Effect }
  | { type: "custom"; handler: string; payload?: JsonObject };

export interface SequencedEffect {
  id?: string;
  effect: Effect;
  connector:
    | "always"
    | "then"
    | "ifPreviousSucceeded"
    | "ifYouDo"
    | "ifPossible";
  saveResultAs?: string;
}

export interface SearchRequest {
  zone: "deck" | "trash" | "life";
  player: PlayerRef;
  lookCount?: number;
  filter: CardFilter;
  min: number;
  max: number;
  destination: ZoneName;
  revealTo: Visibility;
  remainingCards?: {
    destination: ZoneName;
    position: "top" | "bottom";
    order: "ownerChoice" | "random" | "original";
  };
  shuffleAfter?: boolean;
}

export type ReplacementTrigger =
  | { type: "wouldBeKOd"; target: Target }
  | { type: "wouldTakeDamage"; target: Target }
  | { type: "wouldBeTrashed"; target: Target }
  | { type: "wouldDraw"; player: PlayerRef }
  | { type: "wouldMoveZone"; from?: ZoneName; to?: ZoneName; target: Target }
  | { type: "wouldReturnDon"; player: PlayerRef }
  | { type: "custom"; event: string };

export interface EffectBlock {
  id: EffectId;
  category: EffectCategory;
  trigger: Trigger;
  condition?: Condition;
  conditionTiming?: ConditionTiming;
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}

export interface EffectDefinitionMetadata {
  sourceTextHash: Sha256;
  behaviorHash: Sha256;
  rulesVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion?: string;
  generatedBy?: "manual" | "rule-parser" | "llm-assisted";
  reviewedBy?: string;
  reviewedAt?: string;
  tested: boolean;
  notes?: string;
}

export interface EffectDefinition {
  cardId: CardId;
  implementationStatus: CardSupportStatus;
  effects: EffectBlock[];
  metadata: EffectDefinitionMetadata;
}

export type Action =
  | { type: "keepOpeningHand" }
  | { type: "mulligan" }
  | {
      type: "playCard";
      handInstanceId: InstanceId;
      declaredCostPayment?: CostPaymentSelection;
    }
  | {
      type: "attachDon";
      donInstanceId: InstanceId;
      targetInstanceId: InstanceId;
    }
  | {
      type: "declareAttack";
      attackerInstanceId: InstanceId;
      target: BattleTarget;
    }
  | { type: "activateEffect"; sourceInstanceId: InstanceId; effectId: EffectId }
  | {
      type: "useCounter";
      handInstanceId: InstanceId;
      targetInstanceId: InstanceId;
    }
  | {
      type: "respondToDecision";
      decisionId: DecisionId;
      response: DecisionResponse;
    }
  | { type: "endMainPhase" }
  | { type: "concede" };

export interface ActionEnvelope {
  matchId: MatchId;
  playerId: PlayerId;
  clientActionId: string;
  expectedStateSeq: StateSeq;
  actionHash: Sha256;
  action: Action;
  sentAtClient?: string; // audit only; excluded from deterministic replay/state hash
}

export type DecisionResponse =
  | { type: "keepOpeningHand" }
  | { type: "mulligan" }
  | { type: "orderedIds"; ids: string[] }
  | { type: "yesNo"; accept: boolean }
  | { type: "payment"; selection: CostPaymentSelection }
  | { type: "targetSelection"; selected: CardRef[] }
  | { type: "cardSelection"; selected: CardRef[]; saveAs?: SelectionId }
  | { type: "effectOptionSelection"; optionIds: string[] }
  | { type: "replacementChoice"; replacementId: EffectId | null }
  | { type: "orderCards"; ordered: CardRef[] }
  | { type: "chooseCharacterToTrash"; instanceId: InstanceId }
  | { type: "pass" };

export type PendingDecision =
  | { type: "mulligan"; id: DecisionId; playerId: PlayerId; handCount: number }
  | {
      type: "chooseTriggerOrder";
      id: DecisionId;
      playerId: PlayerId;
      triggerIds: QueueEntryId[];
    }
  | {
      type: "chooseOptionalActivation";
      id: DecisionId;
      playerId: PlayerId;
      effectId: EffectId;
      source: CardRef;
    }
  | {
      type: "payCost";
      id: DecisionId;
      playerId: PlayerId;
      cost: Cost;
      options: PaymentOption[];
    }
  | {
      type: "selectTargets";
      id: DecisionId;
      playerId: PlayerId;
      request: TargetRequest;
      candidates: CardRef[];
    }
  | {
      type: "selectCards";
      id: DecisionId;
      playerId: PlayerId;
      request: CardSelectionRequest;
      candidates?: CardRef[];
    }
  | {
      type: "chooseEffectOption";
      id: DecisionId;
      playerId: PlayerId;
      options: EffectOption[];
      min: number;
      max: number;
    }
  | {
      type: "confirmTriggerFromLife";
      id: DecisionId;
      playerId: PlayerId;
      card: CardRef;
    }
  | {
      type: "chooseReplacement";
      id: DecisionId;
      playerId: PlayerId;
      processId: string;
      replacementIds: EffectId[];
      optional: boolean;
    }
  | {
      type: "orderCards";
      id: DecisionId;
      playerId: PlayerId;
      cards: CardRef[];
      destination: ZoneName;
    }
  | {
      type: "chooseCharacterToTrashForOverflow";
      id: DecisionId;
      playerId: PlayerId;
      candidates: CardRef[];
    };

export interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  publicEvents: EngineEvent[];
  pendingDecision?: PendingDecision;
  stateHash: Sha256;
}

export interface HiddenZoneView {
  count: number;
}

export interface PublicCardView {
  instanceId: InstanceId;
  cardId: CardId;
  controller: PlayerId;
  owner: PlayerId;
  state: CardState;
  attachedDonCount: number;
  computedPower?: number;
  computedCost?: number;
  keywords: Keyword[];
}

export interface PlayerViewState {
  playerId: PlayerId;
  deck: HiddenZoneView;
  donDeck: HiddenZoneView;
  hand: PublicCardView[] | HiddenZoneView;
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: Array<{ faceUp: boolean; card?: PublicCardView }> | HiddenZoneView;
}

export interface PlayerView {
  matchId: MatchId;
  viewer: PlayerId;
  gameType: GameType;
  formatId: FormatId;
  stateSeq: StateSeq;
  serverSeq: ServerSeq;
  you: PlayerViewState;
  opponent: PlayerViewState;
  turn: TurnState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  visibleEvents: EngineEvent[];
  winner?: PlayerId | "draw";
}

export type SpectatorMode = "disabled" | "live-filtered";

export interface SpectatorPolicy {
  mode: SpectatorMode;
  allowHandRevealAfterGame: boolean;
}

export interface DeterministicReplayEntry {
  seq: number;
  stateSeqBefore: StateSeq;
  stateSeqAfter?: StateSeq;
  kind: "action" | "decision" | "system";
  action?: Action;
  decisionId?: DecisionId;
  decisionResponse?: DecisionResponse;
  systemEvent?: JsonObject;
  resultingStateHash?: Sha256;
}

export interface ReplayAuditEnvelope {
  entrySeq: number;
  clientActionId?: string;
  receivedAt?: string;
  connectionId?: string;
  transportMetadata?: JsonObject;
}

export interface ReplayHeader {
  replayId: ReplayId;
  matchId: MatchId;
  gameType: GameType;
  formatId: FormatId;
  ladderId?: LadderId;
  replayFormatVersion: string;
  engineVersion: string;
  rulesVersion: string;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  protocolVersion: string;
  rngAlgorithm: RngState["algorithm"];
  rngSeed?: string;
  rngSeedCommitment?: Sha256;
  initialStateHash: Sha256;
  finalStateHash?: Sha256;
  manifestHash: ManifestHash;
}

export type ReplayReconstructionSource =
  | { type: "initialSnapshot"; initialSnapshot: GameState }
  | {
      type: "seedAndDeckOrders";
      rngSeed: string;
      initialDeckOrders: Record<PlayerId, InstanceId[]>;
    };

export interface ReplayArtifact {
  header: ReplayHeader;
  reconstruction: ReplayReconstructionSource;
  entries: DeterministicReplayEntry[];
  audit?: ReplayAuditEnvelope[];
  checkpoints: Array<{ stateSeq: StateSeq; stateHash: Sha256 }>;
}

export interface Loadout {
  loadoutId: LoadoutId;
  ownerUserId: UserId;
  name: string;
  deck: Array<{ cardId: CardId; quantity: number; variantKey?: VariantKey }>;
  leaderCardId: CardId;
  donDeck: Array<{ cardId: CardId; quantity: number; variantKey?: VariantKey }>;
  sleevesId?: string;
  playmatId?: string;
  iconId?: string;
  cardVariants?: Record<CardId, VariantKey>;
}
