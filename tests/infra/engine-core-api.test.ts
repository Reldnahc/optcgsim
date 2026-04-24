import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  filterStateForPlayer,
  getLegalActions,
  hashGameState,
  resumeDecision
} from "../../packages/engine-core/src/index.ts";
import type {
  Action,
  CardCategory,
  CardColor,
  CardInstance,
  CardState,
  Keyword,
  LifeCard,
  MatchCardManifest,
  MatchConfiguration,
  MatchId,
  PendingDecision,
  PlayerId,
  PlayerState,
  ResolvedCard,
  RngState,
  SpectatorPolicy,
  TurnState,
  ZoneName,
  ZoneRef
} from "@optcg/types";
import type { CreateInitialStateInput } from "../../packages/engine-core/src/index.ts";

function asId<T extends string>(value: string): T {
  return value as T;
}

function runNpmScript(cwd: string, script: string): void {
  if (process.platform === "win32") {
    execFileSync(
      process.env["ComSpec"] ?? "cmd.exe",
      ["/c", "npm.cmd", "run", script],
      {
        cwd,
        stdio: "pipe"
      }
    );
    return;
  }

  execFileSync("npm", ["run", script], {
    cwd,
    stdio: "pipe"
  });
}

function concedeAction(playerId: string): Action & { playerId: PlayerId } {
  return {
    type: "concede",
    playerId: asId(playerId)
  };
}

function makeResolvedCard(
  cardId: string,
  category: CardCategory
): ResolvedCard {
  const card: ResolvedCard = {
    cardId: asId(cardId),
    language: "en",
    name: cardId,
    category,
    set: "set-1",
    setName: "Set 1",
    released: true,
    rarity: "C",
    colors: ["red"] as CardColor[],
    attributes: ["slash"],
    types: [category],
    printedKeywords: category === "character" ? (["blocker"] as Keyword[]) : [],
    variants: [],
    legality: {},
    officialFaq: [],
    sourceTextHash: asId("source-hash"),
    behaviorHash: asId("behavior-hash"),
    support: {
      status: "vanilla-confirmed",
      effectDefinitionIds: [],
      customHandlerIds: [],
      sourceTextHash: asId("source-hash"),
      behaviorHash: asId("behavior-hash")
    }
  };
  if (category !== "leader") {
    card.cost = 1;
  }
  if (category !== "don") {
    card.power = 5000;
  }
  if (category !== "leader" && category !== "don") {
    card.counter = 1000;
  }
  if (category === "leader") {
    card.life = 5;
  }
  return card;
}

function makeManifest(): MatchCardManifest {
  const cards = {
    "leader-1": makeResolvedCard("leader-1", "leader"),
    "leader-2": makeResolvedCard("leader-2", "leader"),
    "char-1": makeResolvedCard("char-1", "character"),
    "char-2": makeResolvedCard("char-2", "character"),
    "char-3": makeResolvedCard("char-3", "character"),
    "char-4": makeResolvedCard("char-4", "character"),
    "event-1": makeResolvedCard("event-1", "event"),
    "stage-1": makeResolvedCard("stage-1", "stage"),
    "don-1": makeResolvedCard("don-1", "don"),
    "don-2": makeResolvedCard("don-2", "don"),
    "life-1": makeResolvedCard("life-1", "character"),
    "life-2": makeResolvedCard("life-2", "character"),
    "life-3": makeResolvedCard("life-3", "character"),
    "trash-1": makeResolvedCard("trash-1", "character")
  } as MatchCardManifest["cards"];

  return {
    manifestHash: asId("manifest-hash"),
    source: "manual-test",
    cardDataVersion: "1",
    effectDefinitionsVersion: "1",
    customHandlerVersion: "1",
    banlistVersion: "1",
    cards,
    createdAt: "2026-04-24T00:00:00Z"
  };
}

function makeZone(zone: ZoneName, playerId: string, index?: number): ZoneRef {
  return {
    zone,
    playerId: asId(playerId),
    index
  } as ZoneRef;
}

function makeCard(args: {
  instanceId: string;
  cardId: string;
  owner: string;
  controller?: string;
  zone: ZoneRef;
  state?: CardState;
}): CardInstance {
  return {
    instanceId: asId(args.instanceId),
    cardId: asId(args.cardId),
    owner: asId(args.owner),
    controller: asId(args.controller ?? args.owner),
    zone: args.zone,
    state: args.state ?? "active",
    attachedDon: [],
    createdAtStateSeq: 0 as CardInstance["createdAtStateSeq"]
  };
}

function makeLifeCard(card: CardInstance, faceUp: boolean): LifeCard {
  return { card, faceUp };
}

function makePlayerState(
  playerId: string,
  leaderCardId: string,
  hiddenHandCardId: string
): PlayerState {
  const brandedPlayerId = asId<PlayerId>(playerId);
  return {
    playerId: brandedPlayerId,
    deck: [
      makeCard({
        instanceId: `${playerId}-deck-1`,
        cardId: "char-3",
        owner: playerId,
        zone: makeZone("deck", playerId, 0)
      }),
      makeCard({
        instanceId: `${playerId}-deck-2`,
        cardId: "char-4",
        owner: playerId,
        zone: makeZone("deck", playerId, 1)
      })
    ],
    donDeck: [
      makeCard({
        instanceId: `${playerId}-don-1`,
        cardId: "don-1",
        owner: playerId,
        zone: makeZone("donDeck", playerId, 0)
      }),
      makeCard({
        instanceId: `${playerId}-don-2`,
        cardId: "don-2",
        owner: playerId,
        zone: makeZone("donDeck", playerId, 1)
      })
    ],
    hand: [
      makeCard({
        instanceId: `${playerId}-hand-1`,
        cardId: hiddenHandCardId,
        owner: playerId,
        zone: makeZone("hand", playerId, 0)
      })
    ],
    trash: [
      makeCard({
        instanceId: `${playerId}-trash-1`,
        cardId: "trash-1",
        owner: playerId,
        zone: makeZone("trash", playerId, 0)
      })
    ],
    leader: makeCard({
      instanceId: `${playerId}-leader`,
      cardId: leaderCardId,
      owner: playerId,
      zone: makeZone("leaderArea", playerId)
    }),
    characters: [
      makeCard({
        instanceId: `${playerId}-char-1`,
        cardId: "char-1",
        owner: playerId,
        zone: makeZone("characterArea", playerId, 0)
      })
    ],
    stage: makeCard({
      instanceId: `${playerId}-stage`,
      cardId: "stage-1",
      owner: playerId,
      zone: makeZone("stageArea", playerId)
    }),
    costArea: [
      makeCard({
        instanceId: `${playerId}-cost-1`,
        cardId: "don-1",
        owner: playerId,
        zone: makeZone("costArea", playerId, 0)
      })
    ],
    life: [
      makeLifeCard(
        makeCard({
          instanceId: `${playerId}-life-1`,
          cardId: "life-1",
          owner: playerId,
          zone: makeZone("life", playerId, 0)
        }),
        false
      ),
      makeLifeCard(
        makeCard({
          instanceId: `${playerId}-life-2`,
          cardId: "life-2",
          owner: playerId,
          zone: makeZone("life", playerId, 1)
        }),
        true
      )
    ],
    hasMulliganed: false,
    keptOpeningHand: false,
    turnCount: 0
  };
}

function makeMatchConfig(): MatchConfiguration {
  return {
    gameType: "custom",
    formatId: asId("format-1"),
    spectatorPolicy: {
      mode: "disabled",
      allowHandRevealAfterGame: false
    } satisfies SpectatorPolicy,
    disconnectPolicy: {
      gracePeriodMs: 30000,
      forfeitAfterMs: 60000,
      pauseTimersDuringGrace: true,
      allowReconnectAfterForfeit: false,
      countsAsLossOnGraceExpiry: true
    }
  };
}

function makeTurnState(
  activePlayer: string,
  nonActivePlayer: string,
  phase: TurnState["phase"] = "main"
): TurnState {
  return {
    activePlayer: asId(activePlayer),
    nonActivePlayer: asId(nonActivePlayer),
    firstPlayer: asId(activePlayer),
    globalTurnNumber: 1 as TurnState["globalTurnNumber"],
    phase
  };
}

function makeInput(
  overrides?: Partial<CreateInitialStateInput>
): CreateInitialStateInput {
  const base: CreateInitialStateInput = {
    matchId: asId<MatchId>("match-1"),
    rulesVersion: "v6",
    engineVersion: "eng-001",
    cardManifest: makeManifest(),
    matchConfig: makeMatchConfig(),
    rng: {
      algorithm: "test-fixed",
      seed: "seed-1",
      internalState: "rng-state",
      callCount: 0
    } satisfies RngState,
    players: {
      [asId<PlayerId>("p1")]: makePlayerState("p1", "leader-1", "event-1"),
      [asId<PlayerId>("p2")]: makePlayerState("p2", "leader-2", "char-2")
    },
    turn: makeTurnState("p1", "p2"),
    status: "active"
  };

  return {
    ...base,
    ...overrides
  };
}

describe("engine-core API skeleton", () => {
  it("keeps state hashes stable for identical seed and action logs", () => {
    const firstState = createInitialState(makeInput());
    const secondState = createInitialState(makeInput());

    const firstResult = applyAction(firstState, { type: "endMainPhase" });
    const secondResult = applyAction(secondState, { type: "endMainPhase" });

    expect(hashGameState(firstState)).toBe(hashGameState(secondState));
    expect(firstResult.stateHash).toBe(secondResult.stateHash);
    expect(firstResult.state.turn.phase).toBe("end");
    expect(firstResult.events.map((event) => event.type)).toEqual([
      "phaseEnded",
      "phaseStarted"
    ]);
  });

  it("advances past the end phase without deadlocking", () => {
    const state = createInitialState(makeInput());

    const toEnd = applyAction(state, { type: "endMainPhase" });
    expect(toEnd.state.turn.phase).toBe("end");
    expect(
      getLegalActions(toEnd.state, asId("p1")).map((action) => action.type)
    ).toContain("endMainPhase");
    expect(
      getLegalActions(toEnd.state, asId("p2")).map((action) => action.type)
    ).toEqual(["concede"]);

    const nextTurn = applyAction(toEnd.state, { type: "endMainPhase" });
    expect(nextTurn.state.turn.phase).toBe("refresh");
    expect(nextTurn.state.turn.activePlayer).toBe(asId("p2"));
    expect(nextTurn.state.turn.nonActivePlayer).toBe(asId("p1"));
  });

  it("keeps concede legal for both players and awards the active player's concession correctly", () => {
    const state = createInitialState(makeInput());

    expect(
      getLegalActions(state, asId("p1")).map((action) => action.type)
    ).toContain("concede");
    expect(
      getLegalActions(state, asId("p2")).map((action) => action.type)
    ).toContain("concede");

    const result = applyAction(state, concedeAction("p1"));
    expect(result.state.status).toBe("completed");
    expect(result.state.winner).toBe(asId("p2"));
  });

  it("awards the win to the non-conceding player when the non-active player concedes", () => {
    const state = createInitialState(makeInput());

    const result = applyAction(state, concedeAction("p2"));
    expect(result.state.status).toBe("completed");
    expect(result.state.winner).toBe(asId("p1"));
  });

  it("rejects actions while the match is frozen", () => {
    const state = createInitialState(
      makeInput({
        status: "frozen"
      })
    );

    expect(getLegalActions(state, asId("p1"))).toEqual([]);
    expect(() => applyAction(state, concedeAction("p1"))).toThrow(/frozen/);
  });

  it("rejects actions once the match is completed", () => {
    const state = createInitialState(
      makeInput({
        status: "completed",
        winner: asId<PlayerId>("p1")
      })
    );

    expect(getLegalActions(state, asId("p1"))).toEqual([]);
    expect(() => applyAction(state, { type: "endMainPhase" })).toThrow(
      /terminal/
    );
  });

  it("filters hidden information out of PlayerView", () => {
    const state = createInitialState(makeInput());
    const view = filterStateForPlayer(state, asId("p1"));

    expect(view.self.hand.map((card) => card.cardId)).toEqual([
      asId("event-1")
    ]);
    expect(view.opponent.hand.count).toBe(1);
    expect(view.opponent.life.count).toBe(2);
    expect(view.opponent.life.faceUpCards.map((card) => card.cardId)).toEqual([
      asId("life-2")
    ]);

    const serializedView = JSON.stringify(view);
    expect(serializedView).not.toContain("rng-state");
    expect(serializedView).not.toContain("seed-1");
    expect(serializedView).not.toContain("effectQueue");
    expect(serializedView).not.toContain("p2-hand-1");
    expect(serializedView).not.toContain("life-1");
  });

  it("hides private-to-chooser decision candidates from the other player", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-private-candidates"),
          type: "selectCards",
          playerId: asId("p1"),
          visibility: { type: "public" },
          request: {
            chooser: "self",
            zone: "hand",
            player: "self",
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "privateToChooser"
          },
          candidates: [
            {
              instanceId: asId("p1-hand-1"),
              cardId: asId("event-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: {
                zone: "hand",
                playerId: asId("p1"),
                index: 0
              }
            }
          ]
        } satisfies PendingDecision
      })
    );

    const chooserView = filterStateForPlayer(state, asId("p1"));
    const opponentView = filterStateForPlayer(state, asId("p2"));

    expect(chooserView.pendingDecision?.type).toBe("selectCards");
    expect(
      chooserView.pendingDecision?.type === "selectCards"
        ? chooserView.pendingDecision.candidates
        : []
    ).toHaveLength(1);
    expect(opponentView.pendingDecision?.type).toBe("selectCards");
    expect(
      opponentView.pendingDecision?.type === "selectCards"
        ? opponentView.pendingDecision.candidates
        : []
    ).toEqual([]);
  });

  it("strips hidden default responses from non-chooser views", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-hidden-default"),
          type: "selectCards",
          playerId: asId("p1"),
          visibility: { type: "public" },
          request: {
            chooser: "self",
            zone: "hand",
            player: "self",
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "privateToChooser"
          },
          defaultResponse: {
            type: "cardSelection",
            selected: [{ instanceId: asId("p1-hand-1") }]
          },
          candidates: [
            {
              instanceId: asId("p1-hand-1"),
              cardId: asId("event-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: {
                zone: "hand",
                playerId: asId("p1"),
                index: 0
              }
            }
          ]
        } satisfies PendingDecision
      })
    );

    const chooserView = filterStateForPlayer(state, asId("p1"));
    const opponentView = filterStateForPlayer(state, asId("p2"));

    expect(chooserView.pendingDecision?.defaultResponse).toEqual({
      type: "cardSelection",
      selected: [{ instanceId: asId("p1-hand-1") }]
    });
    expect(opponentView.pendingDecision?.defaultResponse).toBeUndefined();
  });

  it("does not expose hidden hand cards in public pay-cost decisions", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-hidden-pay-cost"),
          type: "payCost",
          playerId: asId("p1"),
          visibility: { type: "public" },
          cost: { type: "trashFromHand", count: 1, chooser: "self" },
          options: [
            {
              id: "pay-option-hidden",
              cost: { type: "trashFromHand", count: 1, chooser: "self" },
              selectableCards: [
                {
                  instanceId: asId("p1-hand-1"),
                  cardId: asId("event-1"),
                  owner: asId("p1"),
                  controller: asId("p1"),
                  zone: {
                    zone: "hand",
                    playerId: asId("p1"),
                    index: 0
                  }
                }
              ],
              min: 1,
              max: 1
            }
          ]
        } satisfies PendingDecision
      })
    );

    const chooserView = filterStateForPlayer(state, asId("p1"));
    const opponentView = filterStateForPlayer(state, asId("p2"));

    expect(chooserView.pendingDecision?.type).toBe("payCost");
    expect(
      chooserView.pendingDecision?.type === "payCost"
        ? chooserView.pendingDecision.options[0]?.selectableCards
        : undefined
    ).toHaveLength(1);
    expect(opponentView.pendingDecision?.type).toBe("payCost");
    expect(
      opponentView.pendingDecision?.type === "payCost"
        ? opponentView.pendingDecision.options[0]?.selectableCards
        : undefined
    ).toBeUndefined();
  });

  it("redacts face-down life cards in public trigger decisions", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-life-trigger"),
          type: "confirmTriggerFromLife",
          playerId: asId("p1"),
          visibility: { type: "public" },
          card: {
            instanceId: asId("p1-life-1"),
            cardId: asId("life-1"),
            owner: asId("p1"),
            controller: asId("p1"),
            zone: {
              zone: "life",
              playerId: asId("p1"),
              index: 0
            }
          }
        } satisfies PendingDecision
      })
    );

    const chooserView = filterStateForPlayer(state, asId("p1"));
    const opponentView = filterStateForPlayer(state, asId("p2"));

    expect(chooserView.pendingDecision?.type).toBe("confirmTriggerFromLife");
    expect(opponentView.pendingDecision).toBeUndefined();
    expect(
      opponentView.pendingDecision?.type === "confirmTriggerFromLife"
        ? opponentView.pendingDecision.card.cardId
        : undefined
    ).toBeUndefined();
  });

  it("redacts hidden public decision candidates for non-choosers", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-hidden-public-candidates"),
          type: "selectCards",
          playerId: asId("p1"),
          visibility: { type: "public" },
          request: {
            chooser: "opponent",
            zone: "hand",
            player: "self",
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public"
          },
          candidates: [
            {
              instanceId: asId("p1-hand-1"),
              cardId: asId("event-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: {
                zone: "hand",
                playerId: asId("p1"),
                index: 0
              }
            }
          ]
        } satisfies PendingDecision
      })
    );

    const chooserView = filterStateForPlayer(state, asId("p1"));
    const opponentView = filterStateForPlayer(state, asId("p2"));

    expect(chooserView.pendingDecision?.type).toBe("selectCards");
    expect(
      chooserView.pendingDecision?.type === "selectCards"
        ? chooserView.pendingDecision.candidates[0]?.card.instanceId
        : undefined
    ).toBe(asId("p1-hand-1"));
    expect(opponentView.pendingDecision?.type).toBe("selectCards");
    expect(
      opponentView.pendingDecision?.type === "selectCards"
        ? opponentView.pendingDecision.candidates
        : []
    ).toEqual([]);
  });

  it("runs invariant checks after actions in test mode", () => {
    const originalFlag = process.env["OPTCG_ENGINE_TEST_MODE"];
    process.env["OPTCG_ENGINE_TEST_MODE"] = "true";

    const input = makeInput();
    const p1 = input.players[asId<PlayerId>("p1")]!;
    p1.hand[0]!.instanceId = p1.deck[0]!.instanceId;

    try {
      const state = createInitialState(input);
      expect(() => applyAction(state, concedeAction("p1"))).toThrow(
        /multiple locations/
      );
    } finally {
      if (originalFlag === undefined) {
        delete process.env["OPTCG_ENGINE_TEST_MODE"];
      } else {
        process.env["OPTCG_ENGINE_TEST_MODE"] = originalFlag;
      }
    }
  });

  it("runs invariant checks after decision responses in test mode", () => {
    const originalFlag = process.env["OPTCG_ENGINE_TEST_MODE"];
    process.env["OPTCG_ENGINE_TEST_MODE"] = "true";

    const input = makeInput({
      pendingDecision: {
        id: asId("decision-1"),
        type: "mulligan",
        playerId: asId("p1"),
        handCount: 5,
        visibility: { type: "private", playerIds: [asId("p1")] }
      } satisfies PendingDecision
    });
    const p1 = input.players[asId<PlayerId>("p1")]!;
    p1.hand[0]!.instanceId = p1.deck[0]!.instanceId;

    try {
      const state = createInitialState(input);
      expect(() => resumeDecision(state, { type: "keepOpeningHand" })).toThrow(
        /multiple locations/
      );
    } finally {
      if (originalFlag === undefined) {
        delete process.env["OPTCG_ENGINE_TEST_MODE"];
      } else {
        process.env["OPTCG_ENGINE_TEST_MODE"] = originalFlag;
      }
    }
  });

  it("runs cost-area zone invariants in test mode", () => {
    const originalFlag = process.env["OPTCG_ENGINE_TEST_MODE"];
    process.env["OPTCG_ENGINE_TEST_MODE"] = "true";

    const input = makeInput();
    const p1 = input.players[asId<PlayerId>("p1")]!;
    p1.costArea[0]!.zone = makeZone("deck", "p1", 0);

    try {
      const state = createInitialState(input);
      expect(() => applyAction(state, concedeAction("p1"))).toThrow(
        /Cost-area card .* inconsistent zone metadata/
      );
    } finally {
      if (originalFlag === undefined) {
        delete process.env["OPTCG_ENGINE_TEST_MODE"];
      } else {
        process.env["OPTCG_ENGINE_TEST_MODE"] = originalFlag;
      }
    }
  });

  it("does not advertise synthetic pass responses for pending decisions", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-2"),
          type: "mulligan",
          playerId: asId("p1"),
          handCount: 5,
          visibility: { type: "private", playerIds: [asId("p1")] }
        } satisfies PendingDecision
      })
    );

    const legal = getLegalActions(state, asId("p1"));
    expect(legal).toEqual([
      {
        type: "concede"
      },
      {
        type: "respondToDecision",
        decisionId: asId("decision-2"),
        response: { type: "keepOpeningHand" }
      },
      {
        type: "respondToDecision",
        decisionId: asId("decision-2"),
        response: { type: "mulligan" }
      }
    ]);
  });

  it("keeps concede legal while a decision is pending for both players", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-concede"),
          type: "mulligan",
          playerId: asId("p1"),
          handCount: 5,
          visibility: { type: "private", playerIds: [asId("p1")] }
        } satisfies PendingDecision
      })
    );

    expect(
      getLegalActions(state, asId("p1")).map((action) => action.type)
    ).toContain("concede");
    expect(
      getLegalActions(state, asId("p2")).map((action) => action.type)
    ).toContain("concede");
  });

  it("rejects non-decision actions while a decision is pending", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-block-actions"),
          type: "mulligan",
          playerId: asId("p1"),
          handCount: 5,
          visibility: { type: "private", playerIds: [asId("p1")] }
        } satisfies PendingDecision
      })
    );

    expect(() => applyAction(state, { type: "endMainPhase" })).toThrow(
      /pending decision/
    );
    expect(state.pendingDecision?.id).toBe(asId("decision-block-actions"));
  });

  it("rejects invalid decision payloads before clearing the pending decision", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-3"),
          type: "selectCards",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          request: {
            chooser: "self",
            zone: "hand",
            player: "self",
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "privateToChooser"
          },
          candidates: [
            {
              instanceId: asId("p1-hand-1"),
              cardId: asId("event-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: {
                zone: "hand",
                playerId: asId("p1"),
                index: 0
              }
            }
          ]
        } satisfies PendingDecision
      })
    );

    expect(() =>
      resumeDecision(state, { type: "cardSelection", selected: [] })
    ).toThrow(/violates min\/max/);
    expect(state.pendingDecision?.id).toBe(asId("decision-3"));
  });

  it("enumerates pay-cost responses for selectable cards and DON", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-4"),
          type: "payCost",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          cost: { type: "restDon", count: 1 },
          options: [
            {
              id: "option-1",
              cost: { type: "restDon", count: 1 },
              selectableCards: [
                {
                  instanceId: asId("p1-char-1"),
                  cardId: asId("char-1"),
                  owner: asId("p1"),
                  controller: asId("p1"),
                  zone: {
                    zone: "characterArea",
                    playerId: asId("p1"),
                    index: 0
                  }
                }
              ],
              selectableDon: [
                {
                  instanceId: asId("p1-cost-1"),
                  cardId: asId("don-1"),
                  owner: asId("p1"),
                  controller: asId("p1"),
                  zone: {
                    zone: "costArea",
                    playerId: asId("p1"),
                    index: 0
                  }
                }
              ],
              min: 1,
              max: 1
            }
          ]
        } satisfies PendingDecision
      })
    );

    const legal = getLegalActions(state, asId("p1"));
    expect(legal).toHaveLength(3);
    expect(legal).toEqual(
      expect.arrayContaining([
        {
          type: "concede"
        },
        {
          type: "respondToDecision",
          decisionId: asId("decision-4"),
          response: {
            type: "payment",
            selection: {
              optionId: "option-1",
              selectedCards: [
                {
                  instanceId: asId("p1-char-1"),
                  cardId: asId("char-1"),
                  owner: asId("p1"),
                  controller: asId("p1"),
                  zone: {
                    zone: "characterArea",
                    playerId: asId("p1"),
                    index: 0
                  }
                }
              ]
            }
          }
        },
        {
          type: "respondToDecision",
          decisionId: asId("decision-4"),
          response: {
            type: "payment",
            selection: {
              optionId: "option-1",
              selectedDon: [
                {
                  instanceId: asId("p1-cost-1"),
                  cardId: asId("don-1"),
                  owner: asId("p1"),
                  controller: asId("p1"),
                  zone: {
                    zone: "costArea",
                    playerId: asId("p1"),
                    index: 0
                  }
                }
              ]
            }
          }
        }
      ])
    );
  });

  it("enumerates ranged select-card responses beyond the minimum", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-5"),
          type: "selectCards",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          request: {
            chooser: "self",
            zone: "hand",
            player: "self",
            min: 1,
            max: 2,
            allowFewerIfUnavailable: false,
            visibility: "privateToChooser"
          },
          candidates: [
            {
              instanceId: asId("p1-hand-1"),
              cardId: asId("event-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: { zone: "hand", playerId: asId("p1"), index: 0 }
            },
            {
              instanceId: asId("p1-char-1"),
              cardId: asId("char-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: { zone: "characterArea", playerId: asId("p1"), index: 0 }
            }
          ]
        } satisfies PendingDecision
      })
    );

    const legal = getLegalActions(state, asId("p1"));
    expect(legal).toContainEqual({
      type: "respondToDecision",
      decisionId: asId("decision-5"),
      response: {
        type: "cardSelection",
        selected: [
          { instanceId: asId("p1-hand-1") },
          { instanceId: asId("p1-char-1") }
        ]
      }
    });
  });

  it("honors allowFewerIfUnavailable for selection decisions", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-allow-fewer"),
          type: "selectCards",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          request: {
            chooser: "self",
            zone: "hand",
            player: "self",
            min: 2,
            max: 2,
            allowFewerIfUnavailable: true,
            visibility: "privateToChooser"
          },
          candidates: [
            {
              instanceId: asId("p1-hand-1"),
              cardId: asId("event-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: { zone: "hand", playerId: asId("p1"), index: 0 }
            }
          ]
        } satisfies PendingDecision
      })
    );

    expect(getLegalActions(state, asId("p1"))).toContainEqual({
      type: "respondToDecision",
      decisionId: asId("decision-allow-fewer"),
      response: {
        type: "cardSelection",
        selected: [{ instanceId: asId("p1-hand-1") }]
      }
    });

    expect(() =>
      resumeDecision(state, {
        type: "cardSelection",
        selected: [{ instanceId: asId("p1-hand-1") }]
      })
    ).not.toThrow();
  });

  it("rejects payment selections outside the offered candidates", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-6"),
          type: "payCost",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          cost: { type: "restDon", count: 1 },
          options: [
            {
              id: "option-2",
              cost: { type: "restDon", count: 1 },
              selectableCards: [
                {
                  instanceId: asId("p1-char-1"),
                  cardId: asId("char-1"),
                  owner: asId("p1"),
                  controller: asId("p1"),
                  zone: {
                    zone: "characterArea",
                    playerId: asId("p1"),
                    index: 0
                  }
                }
              ],
              min: 1,
              max: 1
            }
          ]
        } satisfies PendingDecision
      })
    );

    expect(() =>
      resumeDecision(state, {
        type: "payment",
        selection: {
          optionId: "option-2",
          selectedCards: [
            {
              instanceId: asId("p2-char-1"),
              cardId: asId("char-1"),
              owner: asId("p2"),
              controller: asId("p2"),
              zone: {
                zone: "characterArea",
                playerId: asId("p2"),
                index: 0
              }
            }
          ]
        }
      })
    ).toThrow(/non-selectable payment card/);
  });

  it("rejects duplicate cards in multi-select decision responses", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-7"),
          type: "selectTargets",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          request: {
            timing: "onActivation",
            chooser: "self",
            zone: "characterArea",
            player: "self",
            min: 2,
            max: 2,
            allowFewerIfUnavailable: false
          },
          candidates: [
            {
              instanceId: asId("p1-char-1"),
              cardId: asId("char-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: { zone: "characterArea", playerId: asId("p1"), index: 0 }
            },
            {
              instanceId: asId("p2-char-1"),
              cardId: asId("char-1"),
              owner: asId("p2"),
              controller: asId("p2"),
              zone: { zone: "characterArea", playerId: asId("p2"), index: 0 }
            }
          ]
        } satisfies PendingDecision
      })
    );

    expect(() =>
      resumeDecision(state, {
        type: "targetSelection",
        selected: [
          { instanceId: asId("p1-char-1") },
          { instanceId: asId("p1-char-1") }
        ]
      })
    ).toThrow(/may not contain duplicates/);
  });

  it("rejects malformed runtime choice enums before clearing the pending decision", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-8"),
          type: "chooseOptionalActivation",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          effectId: asId("effect-1"),
          source: {
            instanceId: asId("p1-char-1"),
            cardId: asId("char-1"),
            owner: asId("p1"),
            controller: asId("p1"),
            zone: { zone: "characterArea", playerId: asId("p1"), index: 0 }
          }
        } satisfies PendingDecision
      })
    );

    expect(() =>
      resumeDecision(state, {
        type: "optionalActivationChoice",
        choice: "bogus"
      } as unknown as { type: "optionalActivationChoice"; choice: never })
    ).toThrow(/unknown choice/);
    expect(state.pendingDecision?.id).toBe(asId("decision-8"));
  });

  it("filters unavailable effect options out of legal actions and validation", () => {
    const state = createInitialState(
      makeInput({
        pendingDecision: {
          id: asId("decision-9"),
          type: "chooseEffectOption",
          playerId: asId("p1"),
          visibility: { type: "private", playerIds: [asId("p1")] },
          min: 1,
          max: 1,
          options: [
            {
              id: "available-option",
              label: "Available",
              effect: { type: "draw", count: 1, player: "self" }
            },
            {
              id: "unavailable-option",
              label: "Unavailable",
              effect: { type: "draw", count: 1, player: "self" },
              availability: "unavailable"
            }
          ]
        } satisfies PendingDecision
      })
    );

    expect(getLegalActions(state, asId("p1"))).toEqual([
      {
        type: "concede"
      },
      {
        type: "respondToDecision",
        decisionId: asId("decision-9"),
        response: {
          type: "effectOptionSelection",
          optionIds: ["available-option"]
        }
      }
    ]);

    expect(() =>
      resumeDecision(state, {
        type: "effectOptionSelection",
        optionIds: ["unavailable-option"]
      })
    ).toThrow(/unknown option/);
  });

  it("builds @optcg/engine-core to the published dist entrypoint", () => {
    const packageDir = resolve("packages/engine-core");
    const distDir = resolve(packageDir, "dist");
    const distTestDir = resolve(packageDir, "dist_test");
    rmSync(distDir, { recursive: true, force: true });
    rmSync(distTestDir, { recursive: true, force: true });

    try {
      runNpmScript(packageDir, "build");

      expect(existsSync(resolve(distDir, "index.js"))).toBe(true);
      expect(existsSync(resolve(distDir, "index.d.ts"))).toBe(true);

      runNpmScript(packageDir, "typecheck");
    } finally {
      rmSync(distDir, { recursive: true, force: true });
      rmSync(distTestDir, { recursive: true, force: true });
    }
  });
});
