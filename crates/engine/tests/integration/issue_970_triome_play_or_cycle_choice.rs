//! Issue #970 — "When adding a triome it forced me into cycling the card
//! rather than casting as land."
//!
//! Triomes (e.g. Savai Triome) are lands with a hand-zone Cycling ability, so
//! a triome sitting in hand can have two simultaneously legal actions:
//! `PlayLand` and the cycling `ActivateAbility`. The frontend's
//! `resolveSingleActionDispatch` (see `client/src/viewmodel/cardActionChoice.ts`
//! and its issue #970 regression test) only ever auto-dispatches a SINGLE
//! legal action — whenever both are present it must surface the choice modal
//! instead. That UI contract only holds if the engine actually reports both
//! actions for the same source object whenever both are legal.
//!
//! CR 305.1: a land may be played any time the active player could cast a
//! sorcery, with priority and an empty stack, and the land drop for the turn
//! unused. CR 702.29a: cycling has no such restriction — it functions any
//! time its controller has priority and the cost can be paid.

use engine::ai_support::legal_actions_full;
use engine::game::scenario::{GameScenario, P0};
use engine::types::ability::AbilityTag;
use engine::types::actions::GameAction;
use engine::types::identifiers::ObjectId;
use engine::types::mana::{ManaType, ManaUnit};
use engine::types::phase::Phase;

const SAVAI_TRIOME_ORACLE: &str =
    "({T}: Add {R}, {W}, or {B}.)\nThis land enters tapped.\nCycling {3}";

fn cycling_index(state: &engine::types::game_state::GameState, triome: ObjectId) -> usize {
    state.objects[&triome]
        .abilities
        .iter()
        .position(|ability| ability.ability_tag == Some(AbilityTag::Cycling))
        .expect("synthesized cycling ability")
}

#[test]
fn savai_triome_in_hand_offers_play_and_cycle_together() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    scenario.with_mana_pool(
        P0,
        vec![ManaUnit::new(ManaType::Colorless, ObjectId(9_999), false, vec![]); 3],
    );

    let triome = scenario
        .add_land_to_hand(P0, "Savai Triome")
        .from_oracle_text(SAVAI_TRIOME_ORACLE)
        .id();

    let runner = scenario.build();
    let cycling_idx = cycling_index(runner.state(), triome);
    let card_id = runner.state().objects[&triome].card_id;

    // The land drop is unused and cycling's {3} is payable, so CR 305.1 and
    // CR 702.29a are both satisfied — the engine must report BOTH actions
    // under the same source-object bucket the frontend groups by.
    let (_flat, _costs, grouped) = legal_actions_full(runner.state());
    let bucket = grouped.get(&triome).cloned().unwrap_or_default();

    assert!(
        bucket.contains(&GameAction::PlayLand {
            object_id: triome,
            card_id,
        }),
        "PlayLand must be offered alongside cycling: {bucket:?}"
    );
    assert!(
        bucket.contains(&GameAction::ActivateAbility {
            source_id: triome,
            ability_index: cycling_idx,
        }),
        "Cycling must be offered alongside PlayLand: {bucket:?}"
    );
}
