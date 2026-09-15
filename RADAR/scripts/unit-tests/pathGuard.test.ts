import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isPathWithinAllowedDirs } from "../../src/lib/pathGuard.ts";

/** Régression pour le finding 1.6 (AUDIT-PRODUCTION-READINESS, 15 sept. 2026). */

const cwd = "/app";
const allowedDirs = [path.join(cwd, "drive-sync"), path.join(cwd, "visual-cache")];

test("isPathWithinAllowedDirs — accepte un fichier dans un répertoire autorisé", () => {
  assert.equal(isPathWithinAllowedDirs(path.join(cwd, "drive-sync", "a.jpg"), allowedDirs), true);
  assert.equal(isPathWithinAllowedDirs(path.join(cwd, "visual-cache", "sub", "b.png"), allowedDirs), true);
});

test("isPathWithinAllowedDirs — refuse un répertoire frère qui partage le même préfixe (l'ancien bug)", () => {
  // C'est exactement le scénario du finding 1.6 : avant le correctif,
  // `resolved.startsWith(dir)` (sans séparateur) aurait accepté ceci.
  const sibling = path.join(cwd, "drive-sync-old", "secret.txt");
  assert.equal(isPathWithinAllowedDirs(sibling, allowedDirs), false);

  const sibling2 = path.join(cwd, "visual-cache-backup", "x.jpg");
  assert.equal(isPathWithinAllowedDirs(sibling2, allowedDirs), false);
});

test("isPathWithinAllowedDirs — refuse un chemin totalement hors des répertoires autorisés", () => {
  assert.equal(isPathWithinAllowedDirs("/etc/passwd", allowedDirs), false);
});

test("isPathWithinAllowedDirs — accepte le répertoire autorisé lui-même (égalité exacte)", () => {
  assert.equal(isPathWithinAllowedDirs(path.join(cwd, "drive-sync"), allowedDirs), true);
});
