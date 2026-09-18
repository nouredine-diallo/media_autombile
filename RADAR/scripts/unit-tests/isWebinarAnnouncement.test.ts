import { test } from "node:test";
import assert from "node:assert/strict";
import { isWebinarAnnouncement } from "../../src/lib/textUtils.ts";

/**
 * Régression pour le filtre trouvé le 18 sept. 2026 en analysant si le
 * risque "contenu non-automobile scorant comme un vrai candidat" (Electrek)
 * s'appliquait à d'autres flux. Charged EVs (média B2B fournisseurs EV)
 * publie une colonne récurrente d'annonces de webinaires, jamais un article
 * d'actualité — preuve concrète du risque : l'événement 120867 a été généré
 * en article réel (score 53, brouillon) avant l'existence de ce filtre.
 * Mesuré sur les 68 items réels de Charged EVs : 7/68 correspondent, 0 faux
 * positif.
 */

test("isWebinarAnnouncement — détecte les vraies annonces Charged EVs observées", () => {
  assert.equal(
    isWebinarAnnouncement("Today’s webinars: Live EV engineering sessions, Thursday, September 17th"),
    true,
  );
  assert.equal(
    isWebinarAnnouncement("Webinar: Standards and practical methods for EVSE commissioning and field inspection"),
    true,
  );
});

test("isWebinarAnnouncement — insensible à la casse et à l'apostrophe typographique", () => {
  assert.equal(isWebinarAnnouncement("TODAY'S WEBINARS: something"), true);
  assert.equal(isWebinarAnnouncement("webinar: autre titre"), true);
});

test("isWebinarAnnouncement — ne signale PAS une vraie actu automobile/EV", () => {
  assert.equal(isWebinarAnnouncement("Volkswagen Unveils Ridiculously Efficient \"Mission Efficiency\" — But Why?"), false);
  assert.equal(isWebinarAnnouncement("Shell to provide DC fast EV charging to Amazon in three German cities"), false);
  // Cas piège : "webinar" mentionné ailleurs dans un vrai titre, pas en préfixe.
  assert.equal(isWebinarAnnouncement("Volvo annonce un webinar sur la XC90 la semaine prochaine"), false);
});
