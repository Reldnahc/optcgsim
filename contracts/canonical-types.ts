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
  attachedCards: CardInstance[]; // cards currently stored in attached zone for this player
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
  selectedCards?: PublicPaymentCardRef[];
  selectedDon?: PublicPaymentCardRef[];
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
  | { type: "activateBlocker"; blockerInstanceId: InstanceId }
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
  | { type: "concede"; playerId: PlayerId };

export interface ClientActionEnvelope {
  protocolVersion: string;
  matchId: MatchId;
  playerId: PlayerId;
  clientActionId: string;
  expectedStateSeq: StateSeq;
  expectedDecisionId?: DecisionId;
  actionHash: Sha256;
  action: Action;
  sentAtClientTime?: string; // audit only; excluded from deterministic replay/state hash
  signature?: string;
}

export type ActionEnvelope = ClientActionEnvelope;

export type DecisionResponse =
  | { type: "keepOpeningHand" }
  | { type: "mulligan" }
  | { type: "orderedIds"; ids: string[] }
  | { type: "yesNo"; accept: boolean }
  | { type: "optionalActivationChoice"; choice: "activate" | "decline" }
  | { type: "lifeTriggerChoice"; choice: "activateTrigger" | "addToHand" }
  | { type: "payment"; selection: CostPaymentSelection }
  | { type: "targetSelection"; selected: PublicDecisionResponseCardRef[] }
  | {
      type: "cardSelection";
      selected: PublicDecisionResponseCardRef[];
      saveAs?: SelectionId;
    }
  | { type: "effectOptionSelection"; optionIds: string[] }
  | { type: "replacementChoice"; replacementId: EffectId | null }
  | { type: "orderCards"; ordered: PublicDecisionResponseCardRef[] }
  | { type: "chooseCharacterToTrash"; instanceId: InstanceId }
  | { type: "pass" };

export interface PendingDecisionBase {
  id: DecisionId;
  playerId: PlayerId;
  prompt?: string;
  timeoutMs?: number;
  defaultResponse?: DecisionResponse;
  visibility: EventVisibility;
}

export type PendingDecision =
  | (PendingDecisionBase & { type: "mulligan"; handCount: number })
  | (PendingDecisionBase & {
      type: "chooseTriggerOrder";
      triggerIds: QueueEntryId[];
    })
  | (PendingDecisionBase & {
      type: "chooseOptionalActivation";
      effectId: EffectId;
      source: CardRef;
    })
  | (PendingDecisionBase & {
      type: "payCost";
      cost: Cost;
      options: PaymentOption[];
    })
  | (PendingDecisionBase & {
      type: "selectTargets";
      request: TargetRequest;
      candidates: CardRef[];
    })
  | (PendingDecisionBase & {
      type: "selectCards";
      request: CardSelectionRequest;
      candidates: CardRef[];
    })
  | (PendingDecisionBase & {
      type: "chooseEffectOption";
      options: EffectOption[];
      min: number;
      max: number;
    })
  | (PendingDecisionBase & {
      type: "confirmTriggerFromLife";
      card: CardRef;
    })
  | (PendingDecisionBase & {
      type: "chooseReplacement";
      processId: string;
      replacementIds: EffectId[];
      optional: boolean;
    })
  | (PendingDecisionBase & {
      type: "orderCards";
      cards: CardRef[];
      destination: ZoneName;
    })
  | (PendingDecisionBase & {
      type: "chooseCharacterToTrashForOverflow";
      candidates: CardRef[];
    });

export interface PublicDecisionBase {
  id: DecisionId;
  type: PendingDecision["type"];
  playerId: PlayerId;
  prompt?: string;
  timeoutMs?: number;
  defaultResponse?: DecisionResponse;
  visibility: PublicDecisionVisibility;
}

export interface TargetCandidate {
  card: PublicDecisionCardRef;
  label?: string;
}

export interface CardSelectionCandidate {
  card: PublicDecisionCardRef;
  label?: string;
}

export interface PublicChoiceSummary {
  label?: string;
  count?: number;
}

export interface PublicCardRef {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
}

export interface PublicDecisionCardRef {
  instanceId: InstanceId;
  owner: PlayerId;
  controller: PlayerId;
  cardId?: CardId;
}

export interface PublicDecisionResponseCardRef {
  instanceId: InstanceId;
}

export type PublicDecisionVisibility =
  | { type: "public" }
  | { type: "private"; playerIds: PlayerId[] };

export interface PublicPaymentCardRef extends PublicCardRef {
  zone: ZoneRef;
}

export interface PublicEffectEvent {
  id: string;
  sourceCardId: CardId;
  sourceInstanceId?: InstanceId;
  effectId: EffectId;
  description: string;
  choices?: PublicChoiceSummary;
  visibleTo: "both" | PlayerId[] | "replayOnly";
}

export interface LivePublicEffectEvent extends PublicEffectEvent {
  visibleTo: "both" | PlayerId[];
}

export interface PublicCardSelectionRequest {
  chooser: PlayerRef;
  zone?: ZoneName;
  player?: PlayerRef;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility: "public" | "privateToChooser";
}

export interface PublicTargetRequest {
  timing: "onActivation" | "onResolution";
  chooser: PlayerRef;
  zone: ZoneName;
  player: PlayerRef;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}

export interface PublicEffectOption {
  id: string;
  label: string;
  availability?: "available" | "unavailable";
}

export interface PublicPaymentOption {
  id: string;
  cost: Cost;
  selectableCards?: PublicPaymentCardRef[];
  selectableDon?: PublicPaymentCardRef[];
  min: number;
  max: number;
}

export interface PublicTriggerOrderOption {
  triggerId: QueueEntryId;
  label: string;
  sourceCardId?: CardId;
  sourceInstanceId?: InstanceId;
  effectId?: EffectId;
}

export interface PublicReplacementOption {
  replacementId: EffectId;
  label: string;
  sourceCardId?: CardId;
  sourceInstanceId?: InstanceId;
}

export type PublicLegalAction =
  | { type: "playCard"; handInstanceId: InstanceId }
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
  | { type: "activateBlocker"; blockerInstanceId: InstanceId }
  | { type: "activateEffect"; sourceInstanceId: InstanceId; effectId: EffectId }
  | {
      type: "useCounter";
      handInstanceId: InstanceId;
      targetInstanceId: InstanceId;
    }
  | { type: "respondToDecision"; decisionId: DecisionId }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId };

export type RevealReason =
  | "play"
  | "counter"
  | "trigger"
  | "search"
  | "lookAt"
  | "effect"
  | "trash";

export type RevealExpiration =
  | { type: "eventEnd" }
  | { type: "zoneChange" }
  | { type: "stateSeq"; stateSeq: StateSeq }
  | { type: "permanent" };

export interface PublicRevealRecord {
  id: string;
  card: PublicCardRef;
  sourceZone: ZoneName;
  reason: RevealReason;
  visibleTo: "both" | PlayerId[] | "replayOnly";
  expires: RevealExpiration;
}

export interface LivePublicRevealRecord extends PublicRevealRecord {
  visibleTo: "both" | PlayerId[];
}

export type PublicDecision =
  | (PublicDecisionBase & {
      type: "mulligan";
      handCount: number;
    })
  | (PublicDecisionBase & {
      type: "chooseTriggerOrder";
      triggers: PublicTriggerOrderOption[];
    })
  | (PublicDecisionBase & {
      type: "chooseOptionalActivation";
      effectId: EffectId;
      source: PublicCardRef;
      options: Array<"activate" | "decline">;
    })
  | (PublicDecisionBase & {
      type: "payCost";
      cost: Cost;
      options: PublicPaymentOption[];
    })
  | (PublicDecisionBase & {
      type: "selectTargets";
      request: PublicTargetRequest;
      candidates: TargetCandidate[];
    })
  | (PublicDecisionBase & {
      type: "selectCards";
      request: PublicCardSelectionRequest;
      candidates: CardSelectionCandidate[];
    })
  | (PublicDecisionBase & {
      type: "chooseEffectOption";
      options: PublicEffectOption[];
      min: number;
      max: number;
    })
  | (PublicDecisionBase & {
      type: "confirmTriggerFromLife";
      card: PublicCardRef;
      options: Array<"activateTrigger" | "addToHand">;
    })
  | (PublicDecisionBase & {
      type: "chooseReplacement";
      processId: string;
      replacements: PublicReplacementOption[];
      optional: boolean;
    })
  | (PublicDecisionBase & {
      type: "orderCards";
      cards: PublicDecisionCardRef[];
      destination: ZoneName;
    })
  | (PublicDecisionBase & {
      type: "chooseCharacterToTrashForOverflow";
      candidates: PublicCardRef[];
    });

export interface PublicPlayerGameTimer {
  playerId: PlayerId;
  remainingMs: number;
  isRunning: boolean;
}

export interface PublicTimerState {
  drainingPlayerId?: PlayerId;
  players: Record<PlayerId, PublicPlayerGameTimer>;
  disconnect?: {
    playerId: PlayerId;
    startedAt: string;
    expiresAt: string;
  };
}

export type MatchEndReason =
  | "damage"
  | "deckOut"
  | "concede"
  | "simultaneousLoss"
  | "disconnectForfeit"
  | "adminOverride"
  | "serviceNoContest";

export interface MatchResult {
  winner: PlayerId | "draw";
  loser?: PlayerId;
  reason: MatchEndReason;
}

export type RejectionReason =
  | "staleState"
  | "futureState"
  | "idempotencyConflict"
  | "notYourTurn"
  | "illegalAction"
  | "pendingDecisionMismatch"
  | "rateLimited"
  | "matchFrozen"
  | "unsupportedCard"
  | "serverError";

export interface ServerActionResult {
  type: "actionResult";
  matchId: MatchId;
  serverSeq: ServerSeq;
  clientActionId: string;
  accepted: boolean;
  stateSeq: StateSeq;
  actionSeq: ActionSeq;
  reason?: RejectionReason;
  view?: PlayerView;
  events?: LivePublicEffectEvent[];
}

export interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  publicEvents: PublicEffectEvent[];
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

export interface PublicLifeAreaView {
  count: number;
  faceUpCards: PublicCardView[];
}

export interface VisiblePlayerState {
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
}

export interface OpponentVisibleState {
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
}

export type PublicTurnState = TurnState;
export type PublicBattleState = BattleState;

export interface PlayerView {
  matchId: MatchId;
  playerId: PlayerId;
  stateSeq: StateSeq;
  actionSeq: ActionSeq;
  turn: PublicTurnState;
  self: VisiblePlayerState;
  opponent: OpponentVisibleState;
  battle?: PublicBattleState;
  pendingDecision?: PublicDecision;
  legalActions: PublicLegalAction[];
  revealedCards: LivePublicRevealRecord[];
  effectEvents: LivePublicEffectEvent[];
  timers: PublicTimerState;
}

export type SpectatorMode = "disabled" | "live-filtered";

export interface SpectatorPolicy {
  mode: SpectatorMode;
  allowHandRevealAfterGame: boolean;
}

export type ServerMessage =
  | ServerActionResult
  | {
      type: "stateSync";
      matchId: MatchId;
      serverSeq: ServerSeq;
      stateSeq: StateSeq;
      view: PlayerView;
    }
  | {
      type: "decisionRequired";
      matchId: MatchId;
      serverSeq: ServerSeq;
      stateSeq: StateSeq;
      decision: PublicDecision;
    }
  | {
      type: "timerUpdate";
      matchId: MatchId;
      serverSeq: ServerSeq;
      stateSeq: StateSeq;
      timers: PublicTimerState;
    }
  | {
      type: "opponentDisconnected";
      matchId: MatchId;
      serverSeq: ServerSeq;
      timeoutAt: string;
    }
  | {
      type: "opponentReconnected";
      matchId: MatchId;
      serverSeq: ServerSeq;
    }
  | {
      type: "matchError";
      matchId: MatchId;
      serverSeq: ServerSeq;
      message: string;
      reportToken: string;
    }
  | {
      type: "matchEnded";
      matchId: MatchId;
      serverSeq: ServerSeq;
      stateSeq: StateSeq;
      result: MatchResult;
    }
  | {
      type: "ping";
      serverTime: string;
    }
  | {
      type: "pong";
      serverTime: string;
    };

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

export interface DeckCardInput {
  cardId: CardId;
  quantity: number;
  variantKey?: VariantKey;
}

export interface DeckValidationInput {
  gameType: GameType;
  formatId: FormatId;
  leaders: DeckCardInput[];
  mainDeck: DeckCardInput[];
  donDeck: DeckCardInput[];
}

export type DeckValidationField =
  | "leaders"
  | "mainDeck"
  | "donDeck"
  | "formatId"
  | "variants";

export type DeckValidationErrorCode =
  | "invalidLeaderCount"
  | "invalidLeaderIdentity"
  | "invalidMainDeckSize"
  | "invalidDonDeckSize"
  | "leaderColorRestriction"
  | "copyLimitExceeded"
  | "officialFormatRestriction"
  | "simulatorBan"
  | "unsupportedCard"
  | "unknownCard"
  | "invalidVariant";

export interface DeckValidationError {
  code: DeckValidationErrorCode;
  message: string;
  field?: DeckValidationField;
  cardId?: CardId;
  variantKey?: VariantKey;
}

export type DeckValidationWarningCode =
  | "variantFallback"
  | "cardDataOutdated"
  | "supportReviewRequired";

export interface DeckValidationWarning {
  code: DeckValidationWarningCode;
  message: string;
  cardId?: CardId;
  variantKey?: VariantKey;
}

export interface ResolvedDeckCard {
  cardId: CardId;
  quantity: number;
  variantKey?: VariantKey;
  resolvedCard: ResolvedCard;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
  resolvedCards: ResolvedDeckCard[];
  versions: {
    cardDataVersion: string;
    effectDefinitionsVersion: string;
    overlayVersion: string;
    banlistVersion: string;
  };
}
