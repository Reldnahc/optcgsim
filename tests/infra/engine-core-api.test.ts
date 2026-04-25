import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  TimerState,
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

function makeTimerState(): TimerState {
  return {
    drainingPlayerId: asId("p1"),
    players: {
      [asId<PlayerId>("p1")]: {
        playerId: asId("p1"),
        remainingMs: 120000,
        isRunning: true
      },
      [asId<PlayerId>("p2")]: {
        playerId: asId("p2"),
        remainingMs: 118000,
        isRunning: false
      }
    }
  };
}

function makePendingDecision(): PendingDecision {
  return {
    id: asId("decision-1"),
    type: "mulligan",
    playerId: asId("p1"),
    visibility: { type: "private", playerIds: [asId("p1")] },
    handCount: 1
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
    timers: makeTimerState(),
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
    expect(view.timers.players[asId<PlayerId>("p1")]?.remainingMs).toBe(120000);
    expect(view.timers.players[asId<PlayerId>("p1")]?.isRunning).toBe(true);
    expect(view.timers.players[asId<PlayerId>("p2")]?.remainingMs).toBe(118000);
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

  it("applies legal mulligan respondToDecision actions through applyAction", () => {
    const input = makeBaseInput();
    input.pendingDecision = makePendingDecision();
    const state = createInitialState(input);
    const mulliganAction = getLegalActions(state, asId("p1")).find(
      (action) =>
        action.type === "respondToDecision" &&
        action.response.type === "keepOpeningHand"
    );

    expect(mulliganAction).toBeDefined();
    const result = applyAction(state, mulliganAction!);

    expect(result.state.pendingDecision).toBeUndefined();
    expect(result.state.players[asId<PlayerId>("p1")]?.keptOpeningHand).toBe(
      true
    );
    expect(result.events[0]?.type).toBe("mulliganResolved");
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

  it("rejects unsupported gameplay actions and invalid mulligan responses", () => {
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
        type: "orderedIds",
        ids: [asId("queue-1")]
      })
    ).toThrowError(/Mulligan decisions only accept/);
    expect(hashGameState(stateWithDecision)).toBe(decisionHash);
  });

  it("rejects malformed player rosters at state construction", () => {
    const onePlayerInput = makeBaseInput();
    const p2 = asId<PlayerId>("p2");
    delete onePlayerInput.players[p2];

    expect(() => createInitialState(onePlayerInput)).toThrowError(
      /exactly two players/i
    );

    const threePlayerInput = makeBaseInput();
    const p3 = asId<PlayerId>("p3");
    threePlayerInput.players[p3] = makePlayerState("p3", "leader-1", "char-2");

    expect(() => createInitialState(threePlayerInput)).toThrowError(
      /exactly two players/i
    );
  });

  it("includes the active pendingDecision in chooser PlayerView", () => {
    const input = makeBaseInput();
    input.pendingDecision = makePendingDecision();
    const state = createInitialState(input);

    const chooserView = filterStateForPlayer(state, asId("p1"));
    const opponentView = filterStateForPlayer(state, asId("p2"));

    expect(chooserView.pendingDecision?.id).toBe(input.pendingDecision.id);
    expect(chooserView.pendingDecision?.type).toBe("mulligan");
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
      type: "mulligan",
      playerId: asId("p1"),
      visibility: { type: "public" },
      handCount: 1
    };

    const opponentView = filterStateForPlayer(
      createInitialState(input),
      asId("p2")
    );

    expect(opponentView.pendingDecision?.id).toBe(asId("decision-public"));
    expect(opponentView.pendingDecision?.type).toBe("mulligan");
  });

  it("rejects replayOnly pending decisions from live states", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-replay-only"),
      type: "mulligan",
      playerId: asId("p1"),
      visibility: { type: "replayOnly" },
      handCount: 1
    };

    expect(() => createInitialState(input)).toThrowError(/cannot see/i);
  });

  it("rejects chooser-invisible pending decisions from live states", () => {
    const invalidInput = makeBaseInput();
    invalidInput.pendingDecision = {
      id: asId("decision-chooser-hidden"),
      type: "mulligan",
      playerId: asId("p1"),
      visibility: { type: "serverOnly" },
      handCount: 1
    };

    expect(() => createInitialState(invalidInput)).toThrowError(/cannot see/i);
  });

  it("accepts canonical non-mulligan paused states for hashing and filtering", () => {
    const input = makeBaseInput();
    input.pendingDecision = {
      id: asId("decision-non-mulligan"),
      type: "chooseTriggerOrder",
      playerId: asId("p1"),
      visibility: { type: "public" },
      triggerIds: [asId("trigger-1"), asId("trigger-2")]
    };

    const state = createInitialState(input);

    expect(hashGameState(state)).toMatch(/^[a-f0-9]{64}$/);
    expect(getLegalActions(state, asId("p1"))).toEqual([concedeAction("p1")]);
    expect(filterStateForPlayer(state, asId("p1")).pendingDecision?.type).toBe(
      "chooseTriggerOrder"
    );
    expect(filterStateForPlayer(state, asId("p2")).pendingDecision?.type).toBe(
      "chooseTriggerOrder"
    );
  });

  it("rejects payCost pending decisions whose live payment refs omit zone", () => {
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
              instanceId: asId("p1-cost-1"),
              cardId: asId("don-1"),
              owner: asId("p1"),
              controller: asId("p1")
            }
          ],
          min: 1,
          max: 1
        }
      ]
    };

    expect(() => createInitialState(input)).toThrowError(/CardRef\.zone/i);
  });

  it("resolves keepOpeningHand mulligans", () => {
    const input = makeBaseInput();
    input.pendingDecision = makePendingDecision();
    const result = resumeDecision(createInitialState(input), {
      type: "keepOpeningHand"
    });

    expect(result.state.pendingDecision).toBeUndefined();
    expect(result.state.stateSeq).toBe(1);
    expect(result.state.actionSeq).toBe(1);
    expect(result.state.players[asId<PlayerId>("p1")]?.keptOpeningHand).toBe(
      true
    );
    expect(result.state.players[asId<PlayerId>("p1")]?.hasMulliganed).toBe(
      false
    );
    expect(result.events[0]?.type).toBe("mulliganResolved");
  });

  it("hands setup mulligan priority to the second player, then remains fail-closed in setup", () => {
    const input = makeBaseInput();
    input.status = "setup";
    input.pendingDecision = makePendingDecision();

    const firstResult = resumeDecision(createInitialState(input), {
      type: "keepOpeningHand"
    });

    expect(firstResult.state.status).toBe("setup");
    expect(firstResult.state.pendingDecision?.type).toBe("mulligan");
    expect(firstResult.state.pendingDecision?.playerId).toBe(asId("p2"));

    const secondResult = resumeDecision(firstResult.state, {
      type: "keepOpeningHand"
    });

    expect(secondResult.state.status).toBe("setup");
    expect(secondResult.state.pendingDecision).toBeUndefined();
    expect(
      secondResult.state.players[asId<PlayerId>("p2")]?.keptOpeningHand
    ).toBe(true);
  });

  it("resolves mulligan redraws deterministically", () => {
    const input = makeBaseInput();
    input.pendingDecision = makePendingDecision();
    const before = createInitialState(input);
    const originalHandIds = before.players[asId<PlayerId>("p1")]!.hand.map(
      (card) => card.instanceId
    );
    const result = resumeDecision(before, { type: "mulligan" });
    const nextPlayer = result.state.players[asId<PlayerId>("p1")]!;

    expect(result.state.pendingDecision).toBeUndefined();
    expect(nextPlayer.hasMulliganed).toBe(true);
    expect(nextPlayer.keptOpeningHand).toBe(false);
    expect(result.state.rng.callCount).toBe(1);
    expect(nextPlayer.hand).toHaveLength(1);
    expect(nextPlayer.deck).toHaveLength(2);
    expect(nextPlayer.hand[0]?.zone).toEqual(makeZone("hand", "p1", 0));
    expect(nextPlayer.deck[0]?.zone).toEqual(makeZone("deck", "p1", 0));
    expect(originalHandIds).not.toEqual(
      nextPlayer.hand.map((card) => card.instanceId)
    );
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

  it("rejects cross-player zone ownership corruption in test mode", () => {
    const invalidInput = makeBaseInput();
    const p1 = asId<PlayerId>("p1");
    const p2 = asId<PlayerId>("p2");
    const handCard = invalidInput.players[p1]!.hand[0]!;
    handCard.owner = p2;
    handCard.controller = p2;

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () =>
        createInitialState(invalidInput)
      )
    ).toThrowError(/stored under player/i);
  });

  it("rejects broken effect-queue sources in test mode post-action checks", () => {
    const state = createInitialState(makeBaseInput());
    state.effectQueue.push({
      id: asId("queue-1"),
      state: "pending",
      timingWindowId: asId("timing-1"),
      generation: 1,
      controllerId: asId("p1"),
      source: {
        instanceId: asId("missing-source"),
        cardId: asId("char-1"),
        owner: asId("p1"),
        controller: asId("p1"),
        zone: makeZone("characterArea", "p1", 0)
      },
      sourceSnapshot: {
        instanceId: asId("missing-source"),
        cardId: asId("char-1"),
        owner: asId("p1"),
        controller: asId("p1"),
        zone: makeZone("characterArea", "p1", 0),
        state: "active",
        attachedDonCount: 0,
        name: "char-1",
        category: "character",
        colors: ["red"],
        cost: 1,
        power: 5000,
        counter: 1000,
        attributes: ["slash"],
        types: ["character"]
      },
      triggerEventId: asId("missing-event"),
      effectBlockId: asId("effect-1"),
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: 0 as (typeof state)["stateSeq"],
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "rule", rule: "test" }
    });

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () =>
        applyAction(state, concedeAction("p1"))
      )
    ).toThrowError(/missing trigger event|missing source/i);
  });

  it("allows last-known-information queue entries after the source leaves play", () => {
    const state = createInitialState(makeBaseInput());
    state.effectQueue.push({
      id: asId("queue-lki"),
      state: "pending",
      timingWindowId: asId("timing-lki"),
      generation: 1,
      controllerId: asId("p1"),
      source: {
        instanceId: asId("missing-lki-source"),
        cardId: asId("char-1"),
        owner: asId("p1"),
        controller: asId("p1"),
        zone: makeZone("trash", "p1", 0)
      },
      sourceSnapshot: {
        instanceId: asId("missing-lki-source"),
        cardId: asId("char-1"),
        owner: asId("p1"),
        controller: asId("p1"),
        zone: makeZone("characterArea", "p1", 0),
        state: "active",
        attachedDonCount: 0,
        name: "char-1",
        category: "character",
        colors: ["red"],
        cost: 1,
        power: 5000,
        counter: 1000,
        attributes: ["slash"],
        types: ["character"]
      },
      effectBlockId: asId("effect-lki"),
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: 0 as (typeof state)["stateSeq"],
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      causedBy: { type: "rule", rule: "test" }
    });

    expect(() =>
      withEnv("OPTCG_ENGINE_TEST_MODE", "true", () =>
        applyAction(state, concedeAction("p1"))
      )
    ).not.toThrow();
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
    runNpmScript(enginePackageRoot, "build");

    const packageJson = JSON.parse(
      readFileSync(resolve(enginePackageRoot, "package.json"), "utf8")
    ) as { main: string; types: string };

    expect(existsSync(resolve(enginePackageRoot, packageJson.main))).toBe(true);
    expect(existsSync(resolve(enginePackageRoot, packageJson.types))).toBe(
      true
    );
  });
});
