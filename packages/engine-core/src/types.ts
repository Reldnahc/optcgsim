import type {
  GameState,
  InstanceId,
  Keyword,
  MatchCardManifest,
  MatchConfiguration,
  MatchId,
  PendingDecision,
  PlayerId,
  PlayerState,
  TurnState,
  RngState,
  CardId,
  TimerState
} from "@optcg/types";

export interface CreateInitialStateInput {
  matchId: MatchId;
  rulesVersion: string;
  engineVersion: string;
  cardManifest: MatchCardManifest;
  matchConfig: MatchConfiguration;
  rng: RngState;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  turn: TurnState;
  status?: GameState["status"];
  pendingDecision?: PendingDecision;
  battle?: GameState["battle"];
  winner?: GameState["winner"];
}

export interface ComputedCardView {
  instanceId: InstanceId;
  cardId: CardId;
  basePower?: number;
  currentPower?: number;
  baseCost?: number;
  currentCost?: number;
  keywords: Keyword[];
  canAttack: boolean;
  canBlock: boolean;
  cannotBeAttacked: boolean;
  protectedFrom: string[];
}

export type RestrictionIndex = Record<string, string[]>;

export interface ComputedGameView {
  seq: GameState["stateSeq"];
  turnPlayerId: PlayerId;
  cards: Record<InstanceId, ComputedCardView>;
  legalAttackTargets: Record<InstanceId, InstanceId[]>;
  restrictions: RestrictionIndex;
}
