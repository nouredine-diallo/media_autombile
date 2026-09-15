import { test } from "node:test";
import assert from "node:assert/strict";
import { getClientIp, passwordMatches } from "../../src/lib/loginSecurity.ts";

/**
 * Tests de régression pour les findings 1.2 et 1.5
 * (AUDIT-PRODUCTION-READINESS, 15 sept. 2026). Exécution :
 * `node --experimental-strip-types --test scripts/unit-tests/`
 * Zéro dépendance ajoutée (test runner natif Node 22, TS natif) — zéro
 * appel réseau, zéro appel Groq, cohérent avec la contrainte de quota.
 */

test("getClientIp — le bypass réel (X-Forwarded-For spoofé) est fermé", () => {
  // Reproduit exactement le scénario de contournement décrit dans le
  // finding 1.2 : un attaquant envoie un X-Forwarded-For différent à
  // chaque tentative pour obtenir une nouvelle fenêtre de rate limiting.
  // nginx pose toujours X-Real-IP depuis $remote_addr (non falsifiable) en
  // plus de X-Forwarded-For (falsifiable, $proxy_add_x_forwarded_for
  // n'écrase pas la valeur envoyée par le client).
  const attempt1 = new Headers({
    "x-real-ip": "203.0.113.7",
    "x-forwarded-for": "1.1.1.1",
  });
  const attempt2 = new Headers({
    "x-real-ip": "203.0.113.7",
    "x-forwarded-for": "9.9.9.9, 203.0.113.7", // deuxième segment = ce que nginx aurait ajouté
  });
  const attempt3 = new Headers({
    "x-real-ip": "203.0.113.7",
    "x-forwarded-for": Math.random().toString(), // valeur aléatoire à chaque appel, comme un vrai bypass
  });

  const ip1 = getClientIp(attempt1);
  const ip2 = getClientIp(attempt2);
  const ip3 = getClientIp(attempt3);

  assert.equal(ip1, "203.0.113.7");
  assert.equal(ip2, "203.0.113.7");
  assert.equal(ip3, "203.0.113.7");
  assert.equal(ip1, ip2);
  assert.equal(ip2, ip3);
});

test("getClientIp — avant le correctif, ce même scénario aurait donné 3 IP différentes", () => {
  // Reproduit l'ANCIENNE logique (priorité x-forwarded-for) pour prouver
  // que le bug était réel, pas une supposition — sert de preuve dans le
  // rapport d'audit autant que de garde-fou de non-régression.
  function oldGetClientIp(headersList: Headers): string {
    const forwarded = headersList.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return headersList.get("x-real-ip") || "unknown";
  }

  const a = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" });
  const b = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "2.2.2.2" });

  assert.notEqual(oldGetClientIp(a), oldGetClientIp(b), "l'ancien bug doit rester reproductible dans ce test");
});

test("getClientIp — repli sur x-forwarded-for quand x-real-ip est absent (dev local sans nginx)", () => {
  const headers = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
  assert.equal(getClientIp(headers), "198.51.100.1");
});

test("getClientIp — 'unknown' quand aucun header n'est présent", () => {
  assert.equal(getClientIp(new Headers()), "unknown");
});

test("passwordMatches — mot de passe correct accepté", () => {
  assert.equal(passwordMatches("work", "work"), true);
});

test("passwordMatches — mot de passe incorrect refusé", () => {
  assert.equal(passwordMatches("wrong", "work"), false);
});

test("passwordMatches — AUTH_PASSWORD absent/vide ne matche jamais, même une chaîne vide", () => {
  // Cas limite découvert en écrivant le correctif lui-même : sans cette
  // ligne, `"" !== undefined` (ancien code) devenait `"" === ""` (nouveau
  // code naïf) une fois les deux côtés coalescés à des chaînes vides — un
  // mot de passe vide aurait matché un AUTH_PASSWORD non configuré.
  assert.equal(passwordMatches("", ""), false);
  assert.equal(passwordMatches("anything", ""), false);
});

test("passwordMatches — longueurs différentes ne lèvent jamais et renvoient false", () => {
  assert.equal(passwordMatches("short", "a-much-longer-password-string"), false);
  assert.equal(passwordMatches("a-much-longer-password-string", "short"), false);
});
