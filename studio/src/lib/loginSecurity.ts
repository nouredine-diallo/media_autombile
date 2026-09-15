import { timingSafeEqual } from "node:crypto";

/**
 * Même correctif et même raisonnement que
 * RADAR/src/lib/loginSecurity.ts (findings 1.2/1.5,
 * AUDIT-PRODUCTION-READINESS, 15 sept. 2026) — extrait de
 * src/app/actions/auth.ts pour être testable sans le runtime "use server".
 */

export function getClientIp(headersList: Headers): string {
  const realIp = headersList.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export function passwordMatches(candidate: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
