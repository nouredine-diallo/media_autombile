import { test } from "node:test";
import assert from "node:assert/strict";
import { isProductRoundup } from "../../src/lib/textUtils.ts";

/**
 * Régression pour le filtre trouvé le 17 sept. 2026 en analysant un vrai run
 * de pipeline : les compilations "Green Deals" d'Electrek (jamais des
 * voitures) scoraient 40-48, dans la même fourchette que du vrai contenu
 * auto. Signal mesuré sur 300 items réels : présent sur 23/300 titres
 * Electrek, absent des 277 autres (vraie actu auto/EV).
 */

test("isProductRoundup — détecte les vraies compilations Electrek observées", () => {
  assert.equal(
    isProductRoundup("ENGWE E26 3.0 full suspension e-bike with $343 FREE bundle at new $1,499 low + Eagle electric dirt bike new $899 low, Anker, more"),
    true,
  );
  assert.equal(
    isProductRoundup("Bluetti exclusive 6th Anniversary power station sale from $799, roborock RockMow X115H 4WD robot mower $799 off, more"),
    true,
  );
});

test("isProductRoundup — ne signale PAS une vraie actu auto/EV (les 277 titres non affectés du même échantillon)", () => {
  assert.equal(isProductRoundup("Hyundai opens orders for its new electric van, starting at about $66,500"), false);
  assert.equal(isProductRoundup("BYD upgrades top-selling small electric SUV with more range, now starting at about $11,000"), false);
  // Cas piège : une vraie actu de remise, à ne jamais exclure sur un mot-clé "discount"/"$".
  assert.equal(isProductRoundup("Kia is offering big discounts on the EV9, with over $15,000 off at some dealers"), false);
});

test("isProductRoundup — insensible à la casse et tolère un point final", () => {
  assert.equal(isProductRoundup("Some roundup, MORE"), true);
  assert.equal(isProductRoundup("Some roundup, more."), true);
});
