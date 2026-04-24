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
  PublicTimerState,
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
      type: "selectTargets",
      playerId,
      prompt: "Choose a target",
      request: {
        timing: "onResolution",
        chooser: "self",
        zone: "characterArea",
        player: "opponent",
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

    const message: ServerMessage = {
      type: "decisionRequired",
      matchId,
      serverSeq: asBrand(4),
      stateSeq,
      decision
    };

    const payload = JSON.parse(
      JSON.stringify({ envelope, message, timers, result })
    ) as {
      envelope: { protocolVersion: string; expectedDecisionId: string };
      message: {
        type: string;
        decision: { type: string; candidates: unknown[] };
      };
      timers: { players: Record<string, { remainingMs: number }> };
      result: { reason: string };
    };

    expect(payload.envelope.protocolVersion).toBe("v1");
    expect(payload.envelope.expectedDecisionId).toBe("decision-1");
    expect(payload.message.type).toBe("decisionRequired");
    expect(payload.message.decision.type).toBe("selectTargets");
    expect(payload.message.decision.candidates).toHaveLength(1);
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
