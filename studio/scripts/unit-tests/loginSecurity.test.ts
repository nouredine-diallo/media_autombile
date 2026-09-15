import { test } from "node:test";
import assert from "node:assert/strict";
import { getClientIp, passwordMatches } from "../../src/lib/loginSecurity.ts";

/**
 * Même suite que RADAR/scripts/unit-tests/loginSecurity.test.ts (findings
 * 1.2/1.5, AUDIT-PRODUCTION-READINESS, 15 sept. 2026).
 */

test("getClientIp — le bypass réel (X-Forwarded-For spoofé) est fermé", () => {
  const a = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" });
  const b = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": Math.random().toString() });
  assert.equal(getClientIp(a), "203.0.113.7");
  assert.equal(getClientIp(b), "203.0.113.7");
});

test("getClientIp — avant le correctif, ce même scénario aurait donné 2 IP différentes", () => {
  function oldGetClientIp(headersList: Headers): string {
    const forwarded = headersList.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return headersList.get("x-real-ip") || "unknown";
  }
  const a = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" });
  const b = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "2.2.2.2" });
  assert.notEqual(oldGetClientIp(a), oldGetClientIp(b));
});

test("getClientIp — repli sur x-forwarded-for quand x-real-ip est absent", () => {
  const headers = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
  assert.equal(getClientIp(headers), "198.51.100.1");
});

test("passwordMatches — mot de passe correct accepté, incorrect refusé", () => {
  assert.equal(passwordMatches("work", "work"), true);
  assert.equal(passwordMatches("wrong", "work"), false);
});

test("passwordMatches — AUTH_PASSWORD absent/vide ne matche jamais", () => {
  assert.equal(passwordMatches("", ""), false);
  assert.equal(passwordMatches("anything", ""), false);
});

test("passwordMatches — longueurs différentes ne lèvent jamais", () => {
  assert.equal(passwordMatches("short", "a-much-longer-password"), false);
});
