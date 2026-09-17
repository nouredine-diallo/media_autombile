import { test } from "node:test";
import assert from "node:assert/strict";
import { stripHtml } from "../../src/lib/textUtils.ts";

/**
 * Régression pour le bug trouvé le 17 sept. 2026 en analysant un vrai run
 * de pipeline (5 candidats du matin, 0 passé le contrôle qualité) :
 * `&#8217;` (apostrophe typographique encodée) non décodée faisait lire
 * "8217" comme un chiffre du brief par extractNumbers(), absent de
 * l'article généré — faux rejet sur 3 des 5 candidats de ce run réel.
 */

test("stripHtml — décode l'entité numérique décimale &#8217; (cas réel du 17 sept. 2026)", () => {
  const input = "The robotaxi doesn&#8217;t include a steering wheel.";
  assert.equal(stripHtml(input), "The robotaxi doesn’t include a steering wheel.");
  // Le vrai bug : "8217" ne doit plus jamais apparaître comme un chiffre isolé.
  assert.ok(!/\b8217\b/.test(stripHtml(input)));
});

test("stripHtml — décode l'entité numérique hexadécimale &#x2019;", () => {
  assert.equal(stripHtml("There&#x2019;s a problem."), "There’s a problem.");
});

test("stripHtml — entités nommées déjà gérées restent correctes (non-régression)", () => {
  assert.equal(stripHtml("A &amp; B &quot;test&quot; &#39;ok&#39;"), "A & B \"test\" 'ok'");
});

test("stripHtml — balises et attributs toujours retirés (non-régression, finding 2026-08-29)", () => {
  assert.equal(stripHtml('<em data-start="407">texte</em>'), "texte");
});

test("stripHtml — null/undefined renvoie une chaîne vide", () => {
  assert.equal(stripHtml(null), "");
  assert.equal(stripHtml(undefined), "");
});
