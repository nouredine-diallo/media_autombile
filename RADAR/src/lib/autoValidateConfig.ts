import { getDb } from './db';

export interface AutoValidateConfig {
  enabled: boolean;
  minConfidenceScore: number;
  minOverallScore: number;
}

/**
 * Seuil de confiance au-dessus duquel un brouillon du matin saute la revue
 * humaine du contenu (pas juste la checklist de faits, cf. `MIN_VERIFICATION_SCORE`
 * dans autoGenerate.ts qui décide seulement si le brouillon survit pour la
 * revue). TODO — valeur provisoire (CLAUDE.md §4.3), pas de données réelles
 * pour la calibrer : le tableau `articles` est vide en prod au moment où ce
 * seuil est posé. Choisie au-dessus des deux seuils déjà en place dans le
 * produit (70 = "vaut la peine d'être montré à un humain", 80 = "sauter la
 * checklist mais un humain regarde encore") sans être si haute que
 * l'auto-validation ne se déclenche presque jamais — l'utilisateur a
 * explicitement demandé de ne jamais se retrouver sans article prêt.
 * Stockée en config, pas codée en dur, pour être ajustée sans redéploiement
 * dès que de vrais scores auront été observés.
 */
const DEFAULT_CONFIG: AutoValidateConfig = {
  enabled: true,
  minConfidenceScore: 85,
  minOverallScore: 85,
};

export function getAutoValidateConfig(): AutoValidateConfig {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM pipeline_config WHERE key = 'auto_validate_config'").get() as
      | { value: string }
      | undefined;
    if (row) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
    }
  } catch {
    // Table pas encore créée (première exécution) — repli sur le défaut
  }
  return DEFAULT_CONFIG;
}

export function saveAutoValidateConfig(config: Partial<AutoValidateConfig>): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  const merged = { ...getAutoValidateConfig(), ...config };
  db.prepare(
    "INSERT OR REPLACE INTO pipeline_config (key, value) VALUES ('auto_validate_config', ?)"
  ).run(JSON.stringify(merged));
}
