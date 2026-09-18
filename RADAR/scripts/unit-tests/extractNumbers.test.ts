import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNumbers } from "../../src/lib/textUtils.ts";

/**
 * Régression pour le bug trouvé le 17 sept. 2026 en analysant un vrai run
 * de pipeline (candidat McLaren, score 88 mais rejeté à tort) : le brief
 * dit "4000 emplois" (source anglaise, pas de séparateur), l'article
 * généré dit correctement "4 000 emplois" (convention typographique
 * française) — deux formes du même fait jamais rapprochées.
 */

test("extractNumbers — normalise les milliers séparés par une espace normale (cas réel McLaren)", () => {
  assert.deepEqual(extractNumbers("créera 4 000 emplois"), [4000]);
  assert.deepEqual(extractNumbers("créera 4000 emplois"), [4000]);
});

test("extractNumbers — normalise aussi l'espace insécable et l'espace fine insécable", () => {
  assert.deepEqual(extractNumbers("4 000 emplois"), [4000]);
  assert.deepEqual(extractNumbers("4 000 emplois"), [4000]);
});

test("extractNumbers — gère plusieurs groupes de milliers", () => {
  assert.deepEqual(extractNumbers("1 234 567 véhicules"), [1234567]);
});

test("extractNumbers — ne fusionne pas des nombres non liés à tort", () => {
  // "2024" est un nombre à 4 chiffres, jamais un groupe de milliers valide.
  assert.deepEqual(extractNumbers("en 2024"), [2024]);
  // Deux nombres à 1 chiffre séparés par une espace ne forment pas un groupe de milliers.
  assert.deepEqual(extractNumbers("score 3 2 1"), [3, 2, 1]);
});

test("extractNumbers — non-régression : chiffres simples, unités, nombres en lettres", () => {
  assert.deepEqual(extractNumbers("500 ch et 3 sources confirment"), [500, 3]);
  assert.deepEqual(extractNumbers("aucun chiffre ici"), []);
});
