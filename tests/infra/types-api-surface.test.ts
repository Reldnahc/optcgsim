import { describe, expect, it } from "vitest";
import type {
  Action,
  CardId,
  ClientActionEnvelope,
  DecisionId,
  DeckValidationInput,
  DeckValidationResult,
  FormatId,
  GameType,
  MatchId,
  MatchResult,
  PlayerId,
  PublicDecision,
  PublicEffectEvent,
  PublicTimerState,
  ServerActionResult,
  ServerMessage,
  StateSeq
} from "@optcg/types";

function asBrand<T>(value: string | number): T {
  return value as T;
}

describe("@optcg/types API surface", () => {
  it("supports typed player-facing protocol fixtures", () => {
    const matchId = asBrand<MatchId>("match-1");
    const playerId = asBrand<PlayerId>("player-1");
    const stateSeq = asBrand<StateSeq>(12);
    const decisionId = asBrand<DecisionId>("decision-1");

    const action: Action = { type: "endMainPhase" };
    const envelope: ClientActionEnvelope = {
      protocolVersion: "v1",
      matchId,
      playerId,
      clientActionId: "client-action-1",
      expectedStateSeq: stateSeq,
      expectedDecisionId: decisionId,
      actionHash: asBrand("hash-1"),
      sentAtClientTime: "2026-04-24T08:00:00.000Z",
      action,
      signature: "sig"
    };

    const decision: PublicDecision = {
      id: decisionId,
      type: "selectCards",
      playerId,
      prompt: "Choose cards",
      request: {
        chooser: "self",
        zone: "hand",
        player: "self",
        min: 1,
        max: 1,
        allowFewerIfUnavailable: false,
        visibility: "public"
      },
      candidates: [
        {
          card: {
            cardId: asBrand<CardId>("OP01-001"),
            controller: playerId,
            owner: playerId,
            instanceId: asBrand("instance-1")
          },
          label: "Target 1"
        }
      ]
    };

    const publicEvents: PublicEffectEvent[] = [
      {
        id: "event-1",
        sourceCardId: asBrand<CardId>("OP01-001"),
        sourceInstanceId: asBrand("instance-1"),
        effectId: asBrand("effect-1"),
        description: "Played a card",
        visibleTo: "both"
      }
    ];

    const timers: PublicTimerState = {
      drainingPlayerId: playerId,
      players: {
        [playerId]: {
          playerId,
          remainingMs: 120000,
          isRunning: true
        }
      }
    };

    const result: MatchResult = {
      winner: playerId,
      loser: asBrand<PlayerId>("player-2"),
      reason: "concede"
    };

    const actionResult: ServerActionResult = {
      type: "actionResult",
      matchId,
      clientActionId: "client-action-1",
      accepted: true,
      stateSeq,
      actionSeq: asBrand(5),
      events: publicEvents
    };

    const message: ServerMessage = {
      type: "stateSync",
      matchId,
      serverSeq: asBrand(4),
      stateSeq,
      view: {
        matchId,
        viewer: playerId,
        gameType: "unranked" satisfies GameType,
        formatId: asBrand<FormatId>("format-1"),
        stateSeq,
        serverSeq: asBrand(4),
        you: {
          playerId,
          deck: { count: 40 },
          donDeck: { count: 10 },
          hand: { count: 5 },
          trash: [],
          leader: {
            instanceId: asBrand("leader-1"),
            cardId: asBrand<CardId>("OP01-001"),
            controller: playerId,
            owner: playerId,
            state: "active",
            attachedDonCount: 0,
            keywords: []
          },
          characters: [],
          costArea: [],
          life: { count: 5 }
        },
        opponent: {
          playerId: asBrand<PlayerId>("player-2"),
          deck: { count: 40 },
          donDeck: { count: 10 },
          hand: { count: 5 },
          trash: [],
          leader: {
            instanceId: asBrand("leader-2"),
            cardId: asBrand<CardId>("OP01-002"),
            controller: asBrand<PlayerId>("player-2"),
            owner: asBrand<PlayerId>("player-2"),
            state: "active",
            attachedDonCount: 0,
            keywords: []
          },
          characters: [],
          costArea: [],
          life: { count: 5 }
        },
        turn: {
          activePlayer: playerId,
          nonActivePlayer: asBrand<PlayerId>("player-2"),
          firstPlayer: playerId,
          globalTurnNumber: asBrand(1),
          phase: "main"
        },
        pendingDecision: decision,
        timers,
        visibleEvents: publicEvents
      }
    };

    const payload = JSON.parse(
      JSON.stringify({ envelope, actionResult, message, timers, result })
    ) as {
      envelope: { protocolVersion: string; expectedDecisionId: string };
      actionResult: {
        events: Array<{ visibleTo: string }>;
      };
      message: {
        type: string;
        view: {
          pendingDecision: { type: string; candidates: unknown[] };
          timers: { players: Record<string, { remainingMs: number }> };
        };
      };
      timers: { players: Record<string, { remainingMs: number }> };
      result: { reason: string };
    };

    expect(payload.envelope.protocolVersion).toBe("v1");
    expect(payload.envelope.expectedDecisionId).toBe("decision-1");
    expect(payload.actionResult.events[0]?.visibleTo).toBe("both");
    expect(payload.message.type).toBe("stateSync");
    expect(payload.message.view.pendingDecision.type).toBe("selectCards");
    expect(payload.message.view.pendingDecision.candidates).toHaveLength(1);
    expect(payload.message.view.timers.players["player-1"]?.remainingMs).toBe(
      120000
    );
    expect(payload.timers.players["player-1"]?.remainingMs).toBe(120000);
    expect(payload.result.reason).toBe("concede");
  });

  it("supports typed deck-validation fixtures", () => {
    const input: DeckValidationInput = {
      gameType: "unranked" satisfies GameType,
      formatId: asBrand<FormatId>("format-1"),
      leaderCardId: asBrand<CardId>("OP01-001"),
      mainDeck: [
        {
          cardId: asBrand<CardId>("OP01-025"),
          quantity: 4,
          variantKey: asBrand("OP01-025:v0")
        }
      ],
      donDeck: [
        {
          cardId: asBrand<CardId>("DON-001"),
          quantity: 10
        }
      ]
    };

    const output: DeckValidationResult = {
      valid: false,
      errors: [
        {
          code: "unsupportedCard",
          message: "Card is unsupported in this mode",
          field: "mainDeck",
          cardId: asBrand<CardId>("OP01-025")
        }
      ],
      warnings: [
        {
          code: "supportReviewRequired",
          message: "Card support metadata requires review",
          cardId: asBrand<CardId>("OP01-025")
        }
      ],
      resolvedCards: [],
      versions: {
        cardDataVersion: "cards-v1",
        effectDefinitionsVersion: "effects-v1",
        overlayVersion: "overlay-v1",
        banlistVersion: "banlist-v1"
      }
    };

    const payload = JSON.parse(JSON.stringify({ input, output })) as {
      input: { mainDeck: Array<{ quantity: number }> };
      output: {
        errors: Array<{ code: string }>;
        warnings: Array<{ code: string }>;
        versions: { cardDataVersion: string };
      };
    };

    expect(payload.input.mainDeck[0]?.quantity).toBe(4);
    expect(payload.output.errors[0]?.code).toBe("unsupportedCard");
    expect(payload.output.warnings[0]?.code).toBe("supportReviewRequired");
    expect(payload.output.versions.cardDataVersion).toBe("cards-v1");
  });
});
