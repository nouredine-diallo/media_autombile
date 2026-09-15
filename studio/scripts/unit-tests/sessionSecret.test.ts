import { test } from "node:test";
import assert from "node:assert/strict";
import { getSessionSecretBytes } from "../../src/lib/sessionSecret.ts";

/** Même suite que RADAR/scripts/unit-tests/sessionSecret.test.ts (finding 1.4). */

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

test("getSessionSecretBytes — lève en production si SESSION_SECRET est absent", () => {
  withEnv({ NODE_ENV: "production", SESSION_SECRET: undefined }, () => {
    assert.throws(() => getSessionSecretBytes(), /SESSION_SECRET manquant/);
  });
});

test("getSessionSecretBytes — accepte un SESSION_SECRET valide en production", () => {
  withEnv({ NODE_ENV: "production", SESSION_SECRET: "a".repeat(44) }, () => {
    assert.doesNotThrow(() => getSessionSecretBytes());
  });
});

test("getSessionSecretBytes — ne lève PAS en dev si SESSION_SECRET est absent", () => {
  withEnv({ NODE_ENV: "development", SESSION_SECRET: undefined }, () => {
    assert.doesNotThrow(() => getSessionSecretBytes());
  });
});
