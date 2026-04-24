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
      action: {
        type: "activateBlocker",
        blockerInstanceId: asBrand("blocker-1")
      },
      signature: "sig"
    };

    const decision: PublicDecision = {
      id: decisionId,
      type: "chooseTriggerOrder",
      playerId,
      visibility: { type: "public" },
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
      visibility: { type: "private", playerIds: [playerId] },
      effectId: asBrand("effect-3"),
      timeoutMs: 15000,
      defaultResponse: {
        type: "optionalActivationChoice",
        choice: "decline"
      },
      source: {
        cardId: asBrand<CardId>("OP01-004"),
        controller: playerId,
        owner: playerId,
        instanceId: asBrand("instance-5")
      },
      options: ["activate", "decline"]
    };

    const payCostDecision: PublicDecision = {
      id: asBrand<DecisionId>("decision-6"),
      type: "payCost",
      playerId,
      visibility: { type: "private", playerIds: [playerId] },
      cost: { type: "trashFromField", count: 1, chooser: "self" },
      options: [
        {
          id: "payment-1",
          cost: { type: "trashFromField", count: 1, chooser: "self" },
          selectableCards: [
            {
              cardId: asBrand<CardId>("OP01-012"),
              controller: playerId,
              owner: playerId,
              instanceId: asBrand("instance-7"),
              zone: { zone: "characterArea", playerId: playerId }
            }
          ],
          selectableDon: [
            {
              cardId: asBrand<CardId>("DON-001"),
              controller: playerId,
              owner: playerId,
              instanceId: asBrand("don-1"),
              zone: {
                zone: "attached",
                playerId: playerId,
                hostInstanceId: asBrand("instance-7")
              }
            }
          ],
          min: 1,
          max: 1
        }
      ]
    };

    const targetDecision: PublicDecision = {
      id: asBrand<DecisionId>("decision-5"),
      type: "selectTargets",
      playerId,
      visibility: { type: "public" },
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

    const hiddenCardSelectionDecision: PublicDecision = {
      id: asBrand<DecisionId>("decision-7"),
      type: "selectCards",
      playerId,
      visibility: { type: "private", playerIds: [playerId] },
      request: {
        chooser: "self",
        zone: "deck",
        min: 1,
        max: 1,
        allowFewerIfUnavailable: false,
        visibility: "privateToChooser"
      },
      candidates: [
        {
          card: {
            controller: playerId,
            owner: playerId,
            instanceId: asBrand("deck-card-1")
          },
          label: "Unknown top card"
        }
      ]
    };

    const replacementDecision: PublicDecision = {
      id: replacementDecisionId,
      type: "chooseReplacement",
      playerId,
      visibility: { type: "private", playerIds: [playerId] },
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
      visibility: { type: "private", playerIds: [playerId] },
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
          life: { count: 1, faceUpCards: [] }
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
          life: { count: 1, faceUpCards: [] }
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
          { type: "activateBlocker", blockerInstanceId: asBrand("blocker-1") },
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
        payCostDecision,
        payCostResponse: {
          type: "payment",
          selection: {
            optionId: "payment-1",
            selectedDon: [
              {
                cardId: asBrand<CardId>("DON-001"),
                controller: playerId,
                owner: playerId,
                instanceId: asBrand("don-1"),
                zone: {
                  zone: "attached",
                  playerId: playerId,
                  hostInstanceId: asBrand("instance-7")
                }
              }
            ]
          }
        } satisfies DecisionResponse,
        optionalActivationResponse: {
          type: "optionalActivationChoice",
          choice: "activate"
        } satisfies DecisionResponse,
        targetDecision,
        hiddenCardSelectionDecision,
        hiddenCardSelectionResponse: {
          type: "cardSelection",
          selected: [
            {
              instanceId: asBrand("deck-card-1")
            }
          ]
        } satisfies DecisionResponse,
        lifeTriggerResponse: {
          type: "lifeTriggerChoice",
          choice: "addToHand"
        } satisfies DecisionResponse,
        timers,
        result
      })
    ) as {
      envelope: {
        protocolVersion: string;
        expectedDecisionId: string;
        action: { type: string; blockerInstanceId?: string };
      };
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
            life: { count: number; faceUpCards: Array<{ cardId: string }> };
          };
          pendingDecision: {
            type: string;
            visibility: { type: string; playerIds?: string[] };
            triggers: Array<{ label: string }>;
          };
          legalActions: Array<{
            type: string;
            decisionId?: string;
            blockerInstanceId?: string;
          }>;
          revealedCards: Array<{ reason: string; visibleTo: string }>;
          timers: { players: Record<string, { remainingMs: number }> };
        };
      };
      replacementDecision: {
        replacements: Array<{ label: string }>;
      };
      optionalActivationDecision: {
        options: string[];
        visibility: { type: string; playerIds?: string[] };
        timeoutMs?: number;
        defaultResponse?: { type: string; choice: string };
      };
      payCostDecision: {
        options: Array<{
          selectableDon?: Array<{
            zone: { zone: string; playerId: string; hostInstanceId?: string };
          }>;
        }>;
      };
      payCostResponse: {
        selection: {
          selectedDon?: Array<{
            zone: { zone: string; playerId: string; hostInstanceId?: string };
          }>;
        };
      };
      optionalActivationResponse: {
        type: string;
        choice: string;
      };
      targetDecision: {
        request: { chooser: string; zone: string; player: string };
        candidates: Array<{ label: string; card: { cardId?: string } }>;
      };
      hiddenCardSelectionDecision: {
        request: { zone?: string; visibility: string };
        candidates: Array<{
          label: string;
          card: { instanceId: string; cardId?: string };
        }>;
      };
      hiddenCardSelectionResponse: {
        selected: Array<{ instanceId: string }>;
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
    expect(payload.envelope.action).toEqual({
      type: "activateBlocker",
      blockerInstanceId: "blocker-1"
    });
    expect(payload.actionResult.serverSeq).toBe(4);
    expect(payload.actionResult.events[0]?.visibleTo).toBe("both");
    expect(payload.message.type).toBe("stateSync");
    expect(payload.message.view.playerId).toBe("player-1");
    expect(payload.message.view.self.hand[0]?.instanceId).toBe("hand-1");
    expect(payload.message.view.opponent.hand.count).toBe(5);
    expect(payload.message.view.opponent.life.count).toBe(1);
    expect(payload.message.view.opponent.life.faceUpCards).toEqual([]);
    expect(payload.message.view.pendingDecision.type).toBe(
      "chooseTriggerOrder"
    );
    expect(payload.message.view.pendingDecision.visibility).toEqual({
      type: "public"
    });
    expect(["serverOnly", "replayOnly"]).not.toContain(
      payload.message.view.pendingDecision.visibility.type
    );
    expect(payload.message.view.pendingDecision.triggers[0]?.label).toBe(
      "Leader trigger"
    );
    expect(payload.message.view.legalActions[0]).toEqual({
      type: "activateBlocker",
      blockerInstanceId: "blocker-1"
    });
    expect(payload.message.view.legalActions[1]?.type).toBe("playCard");
    expect(payload.message.view.legalActions[2]?.decisionId).toBe("decision-1");
    expect(
      payload.message.view.legalActions.some(
        (action) =>
          action.type === "mulligan" || action.type === "keepOpeningHand"
      )
    ).toBe(false);
    expect(payload.message.view.revealedCards[0]?.reason).toBe("trigger");
    expect(payload.message.view.revealedCards[0]?.visibleTo).toBe("both");
    expect(payload.replacementDecision.replacements[0]?.label).toBe(
      "Use replacement shield"
    );
    expect(payload.optionalActivationDecision.options).toEqual([
      "activate",
      "decline"
    ]);
    expect(payload.optionalActivationDecision.visibility).toEqual({
      type: "private",
      playerIds: ["player-1"]
    });
    expect(["serverOnly", "replayOnly"]).not.toContain(
      payload.optionalActivationDecision.visibility.type
    );
    expect(payload.optionalActivationDecision.timeoutMs).toBe(15000);
    expect(payload.optionalActivationDecision.defaultResponse).toEqual({
      type: "optionalActivationChoice",
      choice: "decline"
    });
    expect(
      payload.payCostDecision.options[0]?.selectableDon?.[0]?.zone
    ).toEqual({
      zone: "attached",
      playerId: "player-1",
      hostInstanceId: "instance-7"
    });
    expect(
      payload.payCostResponse.selection.selectedDon?.[0]?.zone.hostInstanceId
    ).toBe("instance-7");
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
    expect(payload.targetDecision.candidates[0]?.card.cardId).toBe("OP01-020");
    expect(payload.hiddenCardSelectionDecision.request.zone).toBe("deck");
    expect(payload.hiddenCardSelectionDecision.request.visibility).toBe(
      "privateToChooser"
    );
    expect(payload.hiddenCardSelectionDecision.candidates[0]?.label).toBe(
      "Unknown top card"
    );
    expect(
      payload.hiddenCardSelectionDecision.candidates[0]?.card.cardId
    ).toBeUndefined();
    expect(payload.hiddenCardSelectionResponse.selected[0]?.instanceId).toBe(
      "deck-card-1"
    );
    expect(
      Object.keys(payload.hiddenCardSelectionResponse.selected[0] ?? {})
    ).toEqual(["instanceId"]);
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
        },
        {
          code: "invalidLeaderCount",
          message: "Exactly one leader is required",
          field: "leaders"
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
