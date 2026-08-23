/**
 * Thème des graphiques — source unique des couleurs de données.
 *
 * Recharts écrit les couleurs dans des attributs SVG : on ne peut pas y mettre
 * `var(--jeton)` de façon fiable. Ce module tient donc les valeurs littérales,
 * alignées sur les jetons de globals.css.
 *
 * Palette catégorielle : ordre FIXE, jamais recyclé. Elle est distincte des
 * couleurs d'état (rouge/vert/ambre) qui restent réservées au statut, pour
 * qu'une série de données ne soit jamais confondue avec une alerte.
 *
 * Vérifiée par `scripts/validate_palette.js` (skill dataviz) sur la surface
 * sombre #121A28 — bande de clarté, plancher de chroma, séparation en vision
 * daltonienne (ΔE 8,4 pire paire adjacente), plancher vision normale (ΔE 19,8)
 * et contraste ≥ 3:1 : tous les contrôles passent.
 * Les graphiques à paires non adjacentes (nuage de points) se limitent aux
 * TROIS premiers créneaux, validés en mode « toutes paires ».
 */

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const;

/** Créneaux nommés — la couleur suit l'entité, jamais son rang dans un tri. */
export const SERIES_BY_NAME = {
  slot1: SERIES[0],
  slot2: SERIES[1],
  slot3: SERIES[2],
  slot4: SERIES[3],
} as const;

/** Surfaces et encres, identiques aux jetons du système de design. */
export const CHART = {
  surface: '#121A28',
  grid: 'rgba(148, 163, 184, 0.14)',
  axis: '#7E8CA0',
  textPrimary: '#F1F5F9',
  textSecondary: '#A8B6CA',
  textMuted: '#7E8CA0',
  neutral: '#5C6879',
} as const;

/** Style commun des infobulles Recharts. */
export const TOOLTIP_STYLE = {
  backgroundColor: '#1A2434',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: '10px',
  color: CHART.textPrimary,
  fontSize: '12px',
  boxShadow: '0 16px 48px -12px rgba(0, 0, 0, 0.65)',
} as const;

/** Ticks d'axes : encre discrète, jamais la couleur d'une série. */
export const AXIS_TICK = { fontSize: 11, fill: CHART.textMuted } as const;
