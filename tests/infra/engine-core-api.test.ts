import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  computeView,
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

function withEnv<T>(key: string, value: string, run: () => T): T {
  const previous = process.env[key];
  process.env[key] = value;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

function concedeAction(playerId: string): Action {
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
    "stage-1": makeResolvedCard("stage-1", "stage"),
    "don-1": makeResolvedCard("don-1", "don"),
    "life-1": makeResolvedCard("life-1", "character"),
    "life-2": makeResolvedCard("life-2", "character"),
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
    createdAt: "2026-04-25T00:00:00Z"
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
    attachedCards: [],
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

function makeTurnState(): TurnState {
  return {
    activePlayer: asId("p1"),
    nonActivePlayer: asId("p2"),
    firstPlayer: asId("p1"),
    globalTurnNumber: 1 as TurnState["globalTurnNumber"],
    phase: "main",
    priorityPlayer: asId("p1")
  };
}

function makeMatchConfig(): MatchConfiguration {
  return {
    gameType: "custom",
    formatId: asId("standard"),
    spectatorPolicy: {
      mode: "disabled",
      allowHandRevealAfterGame: false
    } satisfies SpectatorPolicy,
    disconnectPolicy: {
      gracePeriodMs: 1000,
      forfeitAfterMs: 2000,
      pauseTimersDuringGrace: true,
      allowReconnectAfterForfeit: false,
      countsAsLossOnGraceExpiry: true
    }
  };
}

function makeRngState(): RngState {
  return {
    algorithm: "test-fixed",
    seed: "seed-1",
    internalState: "state-1",
    callCount: 0
  };
}

function makePendingDecision(): PendingDecision {
  return {
    id: asId("decision-1"),
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
        cardId: asId("char-2"),
        owner: asId("p1"),
        controller: asId("p1")
      }
    ]
  };
}

function makeBaseInput(): CreateInitialStateInput {
  return {
    matchId: asId<MatchId>("match-1"),
    rulesVersion: "rules-v1",
    engineVersion: "engine-v1",
    cardManifest: makeManifest(),
    matchConfig: makeMatchConfig(),
    rng: makeRngState(),
    players: {
      [asId<PlayerId>("p1")]: makePlayerState("p1", "leader-1", "char-2"),
      [asId<PlayerId>("p2")]: makePlayerState("p2", "leader-2", "char-1")
    },
    turn: makeTurnState(),
    status: "active"
  };
}

describe("engine-core bootstrap surface", () => {
  it("keeps state hashes stable for identical seeds and action logs", () => {
    const inputA = makeBaseInput();
    const inputB = makeBaseInput();

    const stateA = createInitialState(inputA);
    const stateB = createInitialState(inputB);

    expect(hashGameState(stateA)).toBe(hashGameState(stateB));

    const resultA = applyAction(stateA, concedeAction("p1"));
    const resultB = applyAction(stateB, concedeAction("p1"));

    expect(resultA.stateHash).toBe(resultB.stateHash);
    expect(hashGameState(resultA.state)).toBe(hashGameState(resultB.state));
  });

  it("excludes manifest timestamps from deterministic state hashing", () => {
    const inputA = makeBaseInput();
    const inputB = makeBaseInput();

    inputA.cardManifest.createdAt = "2026-04-25T00:00:00Z";
    inputB.cardManifest.createdAt = "2026-04-25T12:34:56Z";

    expect(hashGameState(createInitialState(inputA))).toBe(
      hashGameState(createInitialState(inputB))
    );
  });

  it("filters hidden information out of PlayerView", () => {
    const state = createInitialState(makeBaseInput());
    const view = filterStateForPlayer(state, asId("p1"));

    expect(view.self.hand).toHaveLength(1);
    expect(view.self.hand[0]?.cardId).toBe(asId("char-2"));
    expect(view.self.deck.count).toBe(2);
    expect(view.opponent.hand).toEqual({ count: 1 });
    expect(view.opponent.deck.count).toBe(2);
    expect(view.opponent.life.count).toBe(2);
    expect(view.opponent.life.faceUpCards).toHaveLength(1);
    expect(view.opponent.life.faceUpCards[0]?.cardId).toBe(asId("life-2"));
    expect((view as unknown as Record<string, unknown>)["rng"]).toBeUndefined();
    expect(
      (view as unknown as Record<string, unknown>)["effectQueue"]
    ).toBeUndefined();
  });

  it("only exposes concede as the bootstrap legal action when not paused", () => {
    const state = createInitialState(makeBaseInput());

    expect(getLegalActions(state, asId("p1"))).toEqual([concedeAction("p1")]);
    expect(getLegalActions(state, asId("p2"))).toEqual([concedeAction("p2")]);
    expect(getLegalActions(state, asId("unknown"))).toEqual([]);
  });

  it("routes paused states through respondToDecision actions", () => {
    const input = makeBaseInput();
    input.pendingDecision = makePendingDecision();
    const state = createInitialState(input);

    const p1Actions = getLegalActions(state, asId("p1"));
    expect(
      p1Actions.some(
        (action) =>
          action.type === "respondToDecision" &&
          action.decisionId === input.pendingDecision!.id
      )
    ).toBe(true);
    expect(p1Actions).toContainEqual(concedeAction("p1"));
    expect(getLegalActions(state, asId("p2"))).toEqual([concedeAction("p2")]);
  });

  it("concede completes the match, increments sequencing, and clears pending state", () => {
    const input = makeBaseInput();
    input.pendingDecision = makePendingDecision();

    const result = applyAction(createInitialState(input), concedeAction("p1"));

    expect(result.state.status).toBe("completed");
    expect(result.state.winner).toBe(asId("p2"));
    expect(result.state.pendingDecision).toBeUndefined();
    expect(result.state.stateSeq).toBe(1);
    expect(result.state.actionSeq).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("gameOver");
  });

  it("rejects unsupported gameplay actions and unsupported decision runtime", () => {
    const baseState = createInitialState(makeBaseInput());
    const baselineHash = hashGameState(baseState);

    expect(() => applyAction(baseState, { type: "endMainPhase" })).toThrowError(
      /Unsupported action/
    );
    expect(hashGameState(baseState)).toBe(baselineHash);

    const inputWithDecision = makeBaseInput();
    inputWithDecision.pendingDecision = makePendingDecision();
    const stateWithDecision = createInitialState(inputWithDecision);
    const decisionHash = hashGameState(stateWithDecision);

    expect(() =>
      resumeDecision(stateWithDecision, {
        type: "cardSelection",
        selected: [{ instanceId: asId("p1-hand-1") }]
      })
    ).toThrowError(/out of scope/);
    expect(hashGameState(stateWithDecision)).toBe(decisionHash);
  });

  it("includes the active pendingDecision in chooser PlayerView", () => {
    const input = makeBaseInput();
    input.pendingDecision = makePendingDecision();
    const state = createInitialState(input);

    const chooserView = filterStateForPlayer(state, asId("p1"));
    const opponentView = filterStateForPlayer(state, asId("p2"));

    expect(chooserView.pendingDecision?.id).toBe(input.pendingDecision.id);
    expect(chooserView.pendingDecision?.type).toBe("selectCards");
    expect(
      chooserView.legalActions.some(
        (action) =>
          action.type === "respondToDecision" &&
          action.decisionId === input.pendingDecision!.id
      )
    ).toBe(true);
    expect(chooserView.legalActions).not.toContainEqual(
      expect.objectContaining({
        type: "respondToDecision",
        response: expect.anything()
      })
    );
    expect(opponentView.pendingDecision).toBeUndefined();
  });

  it("shows public pending decisions to non-choosing recipients", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-public"),
      type: "chooseTriggerOrder",
      playerId: asId("p1"),
      visibility: { type: "public" },
      triggerIds: [asId("trigger-1"), asId("trigger-2")]
    };

    const opponentView = filterStateForPlayer(
      createInitialState(input),
      asId("p2")
    );

    expect(opponentView.pendingDecision?.id).toBe(asId("decision-public"));
    expect(opponentView.pendingDecision?.type).toBe("chooseTriggerOrder");
  });

  it("rejects replayOnly pending decisions from live states", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-replay-only"),
      type: "chooseTriggerOrder",
      playerId: asId("p1"),
      visibility: { type: "replayOnly" },
      triggerIds: [asId("trigger-1"), asId("trigger-2")]
    };

    expect(() => createInitialState(input)).toThrowError(/chooser cannot see/i);
  });

  it("rejects chooser-invisible pending decisions in test mode", () => {
    const invalidInput = makeBaseInput();
    invalidInput.pendingDecision = {
      id: asId("decision-chooser-hidden"),
      type: "chooseTriggerOrder",
      playerId: asId("p1"),
      visibility: { type: "serverOnly" },
      triggerIds: [asId("trigger-1"), asId("trigger-2")]
    };

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () =>
        createInitialState(invalidInput)
      )
    ).toThrowError(/chooser cannot see/i);
  });

  it("hides replayOnly card-selection candidates from live chooser views", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-selection-replay-only"),
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
        visibility: "replayOnly"
      },
      candidates: [
        {
          instanceId: asId("p1-hand-1"),
          cardId: asId("char-2"),
          owner: asId("p1"),
          controller: asId("p1")
        }
      ]
    };

    const chooserView = filterStateForPlayer(
      createInitialState(input),
      asId("p1")
    );

    expect(chooserView.pendingDecision?.type).toBe("selectCards");
    if (chooserView.pendingDecision?.type !== "selectCards") {
      throw new Error("expected selectCards pending decision");
    }
    expect(chooserView.pendingDecision.candidates).toEqual([]);
  });

  it("fails closed when a live public decision card ref has no instanceId", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-missing-instance"),
      type: "chooseOptionalActivation",
      playerId: asId("p1"),
      visibility: { type: "private", playerIds: [asId("p1")] },
      effectId: asId("effect-1"),
      source: {
        cardId: asId("char-2"),
        owner: asId("p1"),
        controller: asId("p1")
      }
    };

    expect(() =>
      filterStateForPlayer(createInitialState(input), asId("p1"))
    ).toThrowError(/instanceId/i);
  });

  it("rejects candidate-based decisions without instanceIds in test mode", () => {
    const invalidInput = makeBaseInput();
    invalidInput.pendingDecision = {
      id: asId("decision-missing-candidate-instance"),
      type: "selectCards",
      playerId: asId("p1"),
      visibility: { type: "private", playerIds: [asId("p1")] },
      request: {
        chooser: "self",
        min: 1,
        max: 1,
        allowFewerIfUnavailable: false,
        visibility: "privateToChooser"
      },
      candidates: [
        {
          cardId: asId("char-2"),
          owner: asId("p1"),
          controller: asId("p1")
        }
      ]
    };

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () =>
        createInitialState(invalidInput)
      )
    ).toThrowError(/instanceId/i);
  });

  it("runs constructor invariants in test mode", () => {
    const invalidInput = makeBaseInput();
    const p1 = asId<PlayerId>("p1");
    const current = invalidInput.players[p1]!;
    invalidInput.players[p1] = {
      ...current,
      hand: [
        makeCard({
          instanceId: "p1-deck-1",
          cardId: "char-2",
          owner: "p1",
          zone: makeZone("hand", "p1", 0)
        })
      ]
    };

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () =>
        createInitialState(invalidInput)
      )
    ).toThrowError(/Duplicate instance id/);
  });

  it("rejects deadlocked pending decisions in test mode", () => {
    const invalidInput = makeBaseInput();
    invalidInput.pendingDecision = {
      id: asId("decision-deadlocked"),
      type: "selectCards",
      playerId: asId("p1"),
      visibility: { type: "private", playerIds: [asId("p1")] },
      request: {
        chooser: "self",
        min: 1,
        max: 1,
        allowFewerIfUnavailable: false,
        visibility: "privateToChooser"
      },
      candidates: []
    };

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () =>
        createInitialState(invalidInput)
      )
    ).toThrowError(/no legal responses/i);
  });

  it("honors allowFewerIfUnavailable when enumerating selection responses", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-allow-fewer"),
      type: "selectCards",
      playerId: asId("p1"),
      visibility: { type: "private", playerIds: [asId("p1")] },
      request: {
        chooser: "self",
        min: 2,
        max: 2,
        allowFewerIfUnavailable: true,
        visibility: "privateToChooser"
      },
      candidates: [
        {
          instanceId: asId("p1-hand-1"),
          cardId: asId("char-2"),
          owner: asId("p1"),
          controller: asId("p1")
        }
      ]
    };

    const state = createInitialState(input);
    const actions = getLegalActions(state, asId("p1"));

    expect(actions).toContainEqual({
      type: "respondToDecision",
      decisionId: asId("decision-allow-fewer"),
      response: {
        type: "cardSelection",
        selected: [{ instanceId: asId("p1-hand-1") }]
      }
    });

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () => createInitialState(input))
    ).not.toThrow();
  });

  it("does not fabricate impossible payCost responses", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-pay-cost"),
      type: "payCost",
      playerId: asId("p1"),
      visibility: { type: "private", playerIds: [asId("p1")] },
      cost: { type: "restDon", count: 1 },
      options: [
        {
          id: "pay-1",
          cost: { type: "restDon", count: 1 },
          selectableCards: [
            {
              instanceId: asId("p1-hand-1"),
              cardId: asId("char-2"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: makeZone("hand", "p1", 0)
            }
          ],
          selectableDon: [
            {
              instanceId: asId("p1-cost-1"),
              cardId: asId("don-1"),
              owner: asId("p1"),
              controller: asId("p1"),
              zone: makeZone("costArea", "p1", 0)
            }
          ],
          min: 1,
          max: 1
        }
      ]
    };

    const actions = getLegalActions(
      createInitialState(input),
      asId("p1")
    ).filter((action) => action.type === "respondToDecision");

    expect(actions).toHaveLength(2);
    for (const action of actions) {
      if (action.type !== "respondToDecision") {
        continue;
      }

      expect(action.response.type).toBe("payment");
      if (action.response.type !== "payment") {
        continue;
      }
      const selectedCount =
        (action.response.selection.selectedCards?.length ?? 0) +
        (action.response.selection.selectedDon?.length ?? 0);
      expect(selectedCount).toBe(1);
    }
  });

  it("computes a conservative bootstrap view for cards", () => {
    const state = createInitialState(makeBaseInput());
    const computed = computeView(state);
    const charId = asId<CardInstance["instanceId"]>("p1-char-1");

    expect(computed.turnPlayerId).toBe(asId("p1"));
    expect(computed.cards[charId]?.canAttack).toBe(false);
    expect(computed.cards[charId]?.canBlock).toBe(false);
    expect(computed.legalAttackTargets).toEqual({});
  });

  it("builds @optcg/engine-core to the published dist entrypoint", () => {
    const enginePackageRoot = resolve(process.cwd(), "packages", "engine-core");
    const engineDistDir = resolve(enginePackageRoot, "dist");
    const typesDistDir = resolve(process.cwd(), "packages", "types", "dist");

    rmSync(engineDistDir, { recursive: true, force: true });
    rmSync(typesDistDir, { recursive: true, force: true });

    try {
      runNpmScript(enginePackageRoot, "build");

      const packageJson = JSON.parse(
        readFileSync(resolve(enginePackageRoot, "package.json"), "utf8")
      ) as { main: string; types: string };

      expect(existsSync(resolve(enginePackageRoot, packageJson.main))).toBe(
        true
      );
      expect(existsSync(resolve(enginePackageRoot, packageJson.types))).toBe(
        true
      );
    } finally {
      rmSync(engineDistDir, { recursive: true, force: true });
      rmSync(typesDistDir, { recursive: true, force: true });
    }
  });
});
