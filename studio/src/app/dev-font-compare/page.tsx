import { Archivo, Arimo, Inter, Roboto } from "next/font/google";

/**
 * Page de développement — comparaison de polices candidates contre les vrais
 * posts de `inspi/`. Méthode reprise du 2026-08-19 (rendu réel, jamais un
 * jugement de mémoire), relancée le 2026-08-20 après que le fichier
 * Photoshop du directeur a indiqué **Helvetica Neue Bold, 75 pt,
 * interlignage 75 pt (soit 100%), crénage -30 (soit -0,03 em)** — et non
 * Roboto 900 comme identifié jusque-là par comparaison visuelle.
 *
 * Helvetica Neue étant commerciale (Monotype/Linotype) et non intégrable dans
 * un outil web sans licence dédiée, on cherche l'équivalent libre le plus
 * proche. `Nimbus Sans` (URW) est présent sur cette machine : c'est un clone
 * d'Helvetica, il sert donc de **témoin** — il montre à quoi ressemblerait le
 * réglage du PSD, sans être lui-même le candidat retenu par défaut.
 */
const archivo = Archivo({ subsets: ["latin"], weight: ["700"] });
const arimo = Arimo({ subsets: ["latin"], weight: ["700"] });
const inter = Inter({ subsets: ["latin"], weight: ["700"] });
const roboto = Roboto({ subsets: ["latin"], weight: ["700", "900"] });

const CANDIDATES = [
  { name: "Nimbus Sans Bold (temoin = Helvetica)", style: { fontFamily: "'Nimbus Sans', Helvetica, sans-serif" }, weight: 700 },
  { name: "Inter 700", style: {}, cls: inter.className, weight: 700 },
  { name: "Arimo 700 (metriques Arial)", style: {}, cls: arimo.className, weight: 700 },
  { name: "Archivo 700", style: {}, cls: archivo.className, weight: 700 },
  { name: "Roboto 700", style: {}, cls: roboto.className, weight: 700 },
  { name: "Roboto 900 (reglage actuel)", style: {}, cls: roboto.className, weight: 900 },
];

// Mots choisis pour leurs glyphes discriminants : G (spur), R, a (queue),
// e/c/s (terminaisons horizontales chez Helvetica), t (sommet), 9.
const TEXTS = ["Mercedes AMG", "années 90 qu'un", "flex des"];

export default function FontComparePage() {
  return (
    <div style={{ background: "#000", padding: 0, width: 1000 }}>
      {CANDIDATES.map((c) => (
        <div key={c.name} data-candidate={c.name} style={{ background: "#000", padding: "6px 0" }}>
          <p style={{ color: "#0f0", fontSize: 13, fontFamily: "monospace", margin: "0 0 2px 12px" }}>
            {c.name}
          </p>
          <p
            className={c.cls}
            style={{
              ...c.style,
              fontWeight: c.weight,
              fontSize: 58,
              // Réglages exacts du PSD du directeur : interlignage 100%,
              // crénage -30/1000 em.
              lineHeight: 1.0,
              letterSpacing: "-0.03em",
              color: "#fff",
              margin: "0 0 2px 12px",
              whiteSpace: "pre-wrap",
            }}
          >
            {TEXTS.join("\n")}
          </p>
        </div>
      ))}
    </div>
  );
}
