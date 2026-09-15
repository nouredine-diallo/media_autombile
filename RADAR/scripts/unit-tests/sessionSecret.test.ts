import { test } from "node:test";
import assert from "node:assert/strict";
import { getSessionSecretString } from "../../src/lib/sessionSecret.ts";

/**
 * Régression pour le finding 1.4 (AUDIT-PRODUCTION-READINESS, 15 sept.
 * 2026) : avant ce correctif, un SESSION_SECRET absent en production
 * retombait silencieusement sur une valeur codée en dur au lieu de
 * planter. Sauvegarde/restauration de process.env autour de chaque test
 * pour ne pas polluer les autres tests du même run.
 */

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("getSessionSecretString — lève en production si SESSION_SECRET est absent", () => {
  withEnv({ NODE_ENV: "production", SESSION_SECRET: undefined }, () => {
    assert.throws(() => getSessionSecretString(), /SESSION_SECRET manquant/);
  });
});

test("getSessionSecretString — lève en production si SESSION_SECRET fait moins de 32 caractères", () => {
  withEnv({ NODE_ENV: "production", SESSION_SECRET: "trop-court" }, () => {
    assert.throws(() => getSessionSecretString(), /SESSION_SECRET manquant/);
  });
});

test("getSessionSecretString — accepte un SESSION_SECRET valide en production", () => {
  const strong = "a".repeat(44); // équivalent openssl rand -base64 32
  withEnv({ NODE_ENV: "production", SESSION_SECRET: strong }, () => {
    assert.equal(getSessionSecretString(), strong);
  });
});

test("getSessionSecretString — ne lève PAS en dev si SESSION_SECRET est absent (repli documenté)", () => {
  withEnv({ NODE_ENV: "development", SESSION_SECRET: undefined }, () => {
    assert.doesNotThrow(() => getSessionSecretString());
  });
});
