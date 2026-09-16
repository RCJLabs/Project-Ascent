import type { UnitSystem } from '../units';
import { matchedClimb, runHeight } from './scale';

/**
 * What unlocks Free Solo, and why it is the one gate in the app that reads
 * a game record (PLAN.md M218).
 *
 * ## The finding, corrected
 *
 * M218 was written as *"its unlock is the only one in the game that is not
 * earned by climbing"*, against *"every other gate — the walls, the kits,
 * the boons, the gear on the figure — comes from the log"*. The second half
 * is not true. `xp.ts` totals the game lane into `total`, and coins are
 * `total × CURRENCY_RATE`, so the kit shop and the gear on the figure are
 * both **partly game-funded** already. What is true is narrower and worse:
 * this is the only gate that reads a game record *directly*, without going
 * through the economy, where `GAME_ACTION_CAP` keeps a day of play worth
 * less than half a session.
 *
 * ## And it stays that way
 *
 * The milestone offered two answers — gate it on something real, or say in
 * writing why it belongs where it is. This is the second, and not as a
 * shrug.
 *
 * **Gating it on training would make the log serve the toy.** The cap above
 * exists so the game can never pay its way in training currency. Requiring
 * fifteen days on real rock to play a harder arcade mode runs the same
 * contamination backwards: it puts a reason to log a rock day that has
 * nothing to do with climbing, into the one record the coach reads. The
 * wall between the two halves of this app is one-way on purpose — training
 * feeds the game, the game never feeds training — and a training
 * prerequisite for a toy would be the first thing pointing back.
 *
 * **And the mode is called Free Solo.** Handing that out as a reward for
 * going outside more often is an association a training app should not
 * build, however cosmetic the mode is.
 *
 * **A mode is not a reward, it is a difficulty setting.** What qualifies a
 * climber for a harder one is competence at the easier one, and that is the
 * real climbing connection here: a gym does not put you on the lead wall
 * because you have been coming for six months, it puts you on it when you
 * pass the belay check. This is the belay check. It is short on purpose.
 *
 * ## How short
 *
 * 2,000 m is **eighteen seconds** of survival on the normal wall, measured
 * by stepping the simulation rather than guessed at — `unlock.test.ts` pins
 * it, so retuning `SPEED` without retuning this fails instead of quietly
 * turning a proficiency check into a grind. Nothing said so before M218:
 * the number read like a distance, and it is a duration.
 */
export const FREE_SOLO_UNLOCK = 2000;

/**
 * The bar in climbing terms, because a converted number is not a target.
 *
 * The last bare figure on that page. M210 gave every run a climb it had
 * heard of and this line kept saying *"Reach 6,562 ft"*, which is a
 * conversion rather than a place. 2,000 m is past **Mt. Washington** — a
 * mountain known for the weather turning on you, gating the mode with no
 * safety net, which is a coincidence worth keeping.
 */
export function describeFreeSoloUnlock(units: UnitSystem): string {
  return unlockSentence(FREE_SOLO_UNLOCK, units);
}

/**
 * The same sentence for any bar, which is how the one above is tested.
 *
 * Taking the height rather than reading the constant, because the claim
 * worth holding is that the sentence *follows* the number: a hardcoded
 * "Mt. Washington" reads identically today and goes stale the moment the
 * gate is retuned. The same reason M155 and M196 made their sweeps take a
 * corpus.
 */
export function unlockSentence(metres: number, units: UnitSystem): string {
  const height = runHeight(metres, units).label;
  const climb = matchedClimb(metres);
  return climb === null
    ? `Reach ${height} on the normal wall to unlock it.`
    : `Climb past ${climb.name} — ${height} — on the normal wall to unlock it.`;
}
