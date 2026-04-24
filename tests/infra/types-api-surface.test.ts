import { describe, expect, it } from "vitest";
import type {
  CardId,
  ClientActionEnvelope,
  DecisionResponse,
  DecisionId,
  DeckValidationInput,
  DeckValidationResult,
  FormatId,
  GameType,
  MatchId,
  MatchResult,
  PlayerId,
  PublicCardRef,
  PublicDecision,
  LivePublicEffectEvent,
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
    const replacementDecisionId = asBrand<DecisionId>("decision-2");

    const envelope: ClientActionEnvelope = {
      protocolVersion: "v1",
      matchId,
      playerId,
      clientActionId: "client-action-1",
      expectedStateSeq: stateSeq,
      expectedDecisionId: decisionId,
      actionHash: asBrand("hash-1"),
      sentAtClientTime: "2026-04-24T08:00:00.000Z",
      action: { type: "endMainPhase" },
      signature: "sig"
    };

    const decision: PublicDecision = {
      id: decisionId,
      type: "chooseTriggerOrder",
      playerId,
      prompt: "Choose trigger order",
      triggers: [
        {
          triggerId: asBrand("queue-1"),
          label: "Leader trigger",
          sourceCardId: asBrand<CardId>("OP01-001"),
          sourceInstanceId: asBrand("instance-1"),
          effectId: asBrand("effect-1")
        }
      ]
    };

    const optionalActivationDecision: PublicDecision = {
      id: asBrand<DecisionId>("decision-4"),
      type: "chooseOptionalActivation",
      playerId,
      effectId: asBrand("effect-3"),
      source: {
        cardId: asBrand<CardId>("OP01-004"),
        controller: playerId,
        owner: playerId,
        instanceId: asBrand("instance-5")
      },
      options: ["activate", "decline"]
    };

    const targetDecision: PublicDecision = {
      id: asBrand<DecisionId>("decision-5"),
      type: "selectTargets",
      playerId,
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
            cardId: asBrand<CardId>("OP01-020"),
            controller: asBrand<PlayerId>("player-2"),
            owner: asBrand<PlayerId>("player-2"),
            instanceId: asBrand("instance-6")
          },
          label: "Opposing character"
        }
      ]
    };

    const replacementDecision: PublicDecision = {
      id: replacementDecisionId,
      type: "chooseReplacement",
      playerId,
      prompt: "Choose replacement",
      processId: "process-1",
      optional: true,
      replacements: [
        {
          replacementId: asBrand("effect-2"),
          label: "Use replacement shield",
          sourceCardId: asBrand<CardId>("OP01-002"),
          sourceInstanceId: asBrand("instance-2")
        }
      ]
    };

    const lifeTriggerDecision: PublicDecision = {
      id: asBrand<DecisionId>("decision-3"),
      type: "confirmTriggerFromLife",
      playerId,
      card: {
        cardId: asBrand<CardId>("OP01-003"),
        controller: playerId,
        owner: playerId,
        instanceId: asBrand("instance-4")
      },
      options: ["activateTrigger", "addToHand"]
    };

    const publicEvents: LivePublicEffectEvent[] = [
      {
        id: "event-1",
        sourceCardId: asBrand<CardId>("OP01-001"),
        sourceInstanceId: asBrand("instance-1"),
        effectId: asBrand("effect-1"),
        description: "Played a card",
        visibleTo: "both"
      }
    ];

    const publicCardRef: PublicCardRef = {
      cardId: asBrand<CardId>("OP01-010"),
      controller: playerId,
      owner: playerId,
      instanceId: asBrand("instance-3")
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

    const actionResult: ServerActionResult = {
      type: "actionResult",
      matchId,
      serverSeq: asBrand(4),
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
        playerId,
        stateSeq,
        actionSeq: asBrand(5),
        self: {
          playerId,
          deck: { count: 40 },
          donDeck: { count: 10 },
          hand: [
            {
              instanceId: asBrand("hand-1"),
              cardId: asBrand<CardId>("OP01-011"),
              controller: playerId,
              owner: playerId,
              state: "active",
              attachedDonCount: 0,
              keywords: []
            }
          ],
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
          life: [{ faceUp: false }]
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
          life: [{ faceUp: false }]
        },
        turn: {
          activePlayer: playerId,
          nonActivePlayer: asBrand<PlayerId>("player-2"),
          firstPlayer: playerId,
          globalTurnNumber: asBrand(1),
          phase: "main"
        },
        pendingDecision: decision,
        legalActions: [
          { type: "playCard", handInstanceId: asBrand("hand-1") },
          { type: "respondToDecision", decisionId }
        ],
        revealedCards: [
          {
            id: "reveal-1",
            card: publicCardRef,
            sourceZone: "life",
            reason: "trigger",
            visibleTo: "both",
            expires: { type: "eventEnd" }
          }
        ],
        timers,
        effectEvents: publicEvents
      }
    };

    const payload = JSON.parse(
      JSON.stringify({
        envelope,
        actionResult,
        message,
        replacementDecision,
        lifeTriggerDecision,
        optionalActivationDecision,
        optionalActivationResponse: {
          type: "optionalActivationChoice",
          choice: "activate"
        } satisfies DecisionResponse,
        targetDecision,
        lifeTriggerResponse: {
          type: "lifeTriggerChoice",
          choice: "addToHand"
        } satisfies DecisionResponse,
        timers,
        result
      })
    ) as {
      envelope: { protocolVersion: string; expectedDecisionId: string };
      actionResult: {
        serverSeq: number;
        events: Array<{ visibleTo: string }>;
      };
      message: {
        type: string;
        view: {
          playerId: string;
          self: { hand: Array<{ instanceId: string }> };
          opponent: {
            hand: { count: number };
            life: Array<{ faceUp: boolean; card?: { cardId: string } }>;
          };
          pendingDecision: { type: string; triggers: Array<{ label: string }> };
          legalActions: Array<{ type: string; decisionId?: string }>;
          revealedCards: Array<{ reason: string }>;
          timers: { players: Record<string, { remainingMs: number }> };
        };
      };
      replacementDecision: {
        replacements: Array<{ label: string }>;
      };
      optionalActivationDecision: {
        options: string[];
      };
      optionalActivationResponse: {
        type: string;
        choice: string;
      };
      targetDecision: {
        request: { chooser: string; zone: string; player: string };
        candidates: Array<{ label: string }>;
      };
      lifeTriggerDecision: {
        options: string[];
      };
      lifeTriggerResponse: {
        type: string;
        choice: string;
      };
      timers: { players: Record<string, { remainingMs: number }> };
      result: { reason: string };
    };

    expect(payload.envelope.protocolVersion).toBe("v1");
    expect(payload.envelope.expectedDecisionId).toBe("decision-1");
    expect(payload.actionResult.serverSeq).toBe(4);
    expect(payload.actionResult.events[0]?.visibleTo).toBe("both");
    expect(payload.message.type).toBe("stateSync");
    expect(payload.message.view.playerId).toBe("player-1");
    expect(payload.message.view.self.hand[0]?.instanceId).toBe("hand-1");
    expect(payload.message.view.opponent.hand.count).toBe(5);
    expect(payload.message.view.opponent.life[0]?.faceUp).toBe(false);
    expect(payload.message.view.opponent.life[0]?.card).toBeUndefined();
    expect(payload.message.view.pendingDecision.type).toBe(
      "chooseTriggerOrder"
    );
    expect(payload.message.view.pendingDecision.triggers[0]?.label).toBe(
      "Leader trigger"
    );
    expect(payload.message.view.legalActions[0]?.type).toBe("playCard");
    expect(payload.message.view.legalActions[1]?.decisionId).toBe("decision-1");
    expect(payload.message.view.revealedCards[0]?.reason).toBe("trigger");
    expect(payload.replacementDecision.replacements[0]?.label).toBe(
      "Use replacement shield"
    );
    expect(payload.optionalActivationDecision.options).toEqual([
      "activate",
      "decline"
    ]);
    expect(payload.optionalActivationResponse).toEqual({
      type: "optionalActivationChoice",
      choice: "activate"
    });
    expect(payload.targetDecision.request).toEqual({
      timing: "onResolution",
      chooser: "self",
      zone: "characterArea",
      player: "opponent",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public"
    });
    expect(payload.targetDecision.candidates[0]?.label).toBe(
      "Opposing character"
    );
    expect(payload.lifeTriggerDecision.options).toEqual([
      "activateTrigger",
      "addToHand"
    ]);
    expect(payload.lifeTriggerResponse).toEqual({
      type: "lifeTriggerChoice",
      choice: "addToHand"
    });
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
      leaders: [
        {
          cardId: asBrand<CardId>("OP01-001"),
          quantity: 2
        }
      ],
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
