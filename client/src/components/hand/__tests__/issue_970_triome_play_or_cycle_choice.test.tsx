/**
 * Issue #970 — "When adding a triome it forced me into cycling the card
 * rather than casting as land."
 *
 * Triomes (e.g. Savai Triome) are lands with a hand-zone Cycling ability, so
 * a hand card can have two simultaneously legal actions: `PlayLand` and
 * `ActivateAbility` (cycling). `resolveSingleActionDispatch` already proves
 * (in isolation, `cardActionChoice.test.ts`) that a 2-action list must
 * surface the choice modal rather than auto-dispatching either action. This
 * test exercises the real `PlayerHand` component end-to-end — the actual
 * double-click handler wired to the actual `playCard` callback — to prove
 * the component never silently resolves to cycling alone: both actions must
 * reach `pendingAbilityChoice` so the player explicitly picks.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameAction, GameObject, GameState } from "../../../adapter/types.ts";
import { dispatchAction } from "../../../game/dispatch.ts";
import { useGameStore } from "../../../stores/gameStore.ts";
import { useUiStore } from "../../../stores/uiStore.ts";
import { PlayerHand } from "../PlayerHand.tsx";

vi.mock("../../../game/dispatch.ts", () => ({
  dispatchAction: vi.fn(),
}));

vi.mock("../../card/CardImage.tsx", () => ({
  CardImage: ({ cardName }: { cardName: string }) => (
    <div aria-label={cardName} style={{ height: "var(--card-h)", width: "var(--card-w)" }} />
  ),
}));

const TRIOME_ID = 1;
const TRIOME_CARD_ID = 100;
const CYCLING_ABILITY_INDEX = 0;

function makeTriome(): GameObject {
  return {
    id: TRIOME_ID,
    card_id: TRIOME_CARD_ID,
    owner: 0,
    controller: 0,
    zone: "Hand",
    tapped: false,
    face_down: false,
    flipped: false,
    transformed: false,
    damage_marked: 0,
    dealt_deathtouch_damage: false,
    attached_to: null,
    attachments: [],
    counters: {},
    name: "Savai Triome",
    power: null,
    toughness: null,
    loyalty: null,
    card_types: { supertypes: [], core_types: ["Land"], subtypes: ["Mountain", "Plains", "Swamp"] },
    mana_cost: { type: "NoCost" },
    keywords: [],
    abilities: [
      {
        kind: "Activated",
        effect: { type: "Draw" },
        cost: { type: "Discard" },
        consumes_source: true,
      },
    ],
    trigger_definitions: [],
    replacement_definitions: [],
    static_definitions: [],
    color: [],
    base_power: null,
    base_toughness: null,
    base_keywords: [],
    base_color: [],
    timestamp: 1,
    entered_battlefield_turn: null,
  } as unknown as GameObject;
}

function makeState(): GameState {
  return {
    players: [
      {
        id: 0,
        life: 20,
        poison_counters: 0,
        mana_pool: { mana: [] },
        library: [],
        hand: [TRIOME_ID],
        graveyard: [],
        has_drawn_this_turn: true,
        lands_played_this_turn: 0,
        turns_taken: 1,
      },
      {
        id: 1,
        life: 20,
        poison_counters: 0,
        mana_pool: { mana: [] },
        library: [],
        hand: [],
        graveyard: [],
        has_drawn_this_turn: true,
        lands_played_this_turn: 0,
        turns_taken: 1,
      },
    ],
    objects: { [TRIOME_ID]: makeTriome() },
    battlefield: [],
    exile: [],
    stack: [],
    combat: null,
    active_player: 0,
    turn_decision_controller: 0,
    waiting_for: { type: "Priority", data: { player: 0 } },
  } as unknown as GameState;
}

const PLAY_LAND_ACTION: GameAction = {
  type: "PlayLand",
  data: { object_id: TRIOME_ID, card_id: TRIOME_CARD_ID },
} as GameAction;

const CYCLE_ACTION: GameAction = {
  type: "ActivateAbility",
  data: { source_id: TRIOME_ID, ability_index: CYCLING_ABILITY_INDEX },
} as GameAction;

describe("issue #970 — triome offers Play-as-land alongside Cycling", () => {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const gameState = makeState();
    useGameStore.setState({
      gameState,
      waitingFor: gameState.waiting_for,
      legalActions: [],
      // Engine-authoritative grouping: both PlayLand and the cycling
      // ActivateAbility are simultaneously legal for the triome object.
      legalActionsByObject: { [String(TRIOME_ID)]: [PLAY_LAND_ACTION, CYCLE_ACTION] },
      spellCosts: {},
    });
    useUiStore.setState({
      pendingAbilityChoice: null,
      mobileHandOpen: false,
      inspectedObjectId: null,
    });
    vi.mocked(dispatchAction).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("double-clicking the triome opens the choice modal with both actions, never auto-cycling", () => {
    const { container } = render(<PlayerHand />);

    const card = container.querySelector(
      `[data-object-id="${TRIOME_ID}"]`,
    ) as HTMLElement;
    expect(card).toBeTruthy();

    fireEvent.dblClick(card);

    // The lone-action auto-dispatch path must NOT have fired — there are two
    // legal actions, so dispatchAction must not be called directly.
    expect(dispatchAction).not.toHaveBeenCalled();

    // Both actions — not just cycling — must be staged for the player to
    // choose between in the ability choice modal.
    const pending = useUiStore.getState().pendingAbilityChoice;
    expect(pending?.objectId).toBe(TRIOME_ID);
    expect(pending?.actions).toEqual([PLAY_LAND_ACTION, CYCLE_ACTION]);
  });
});
