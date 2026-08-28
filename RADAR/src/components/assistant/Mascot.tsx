import type { CSSProperties } from "react";
import { BODY, EYES, type MascotStateId } from "./mascot-art";

// Mascotte LMA — géométrie dessinée à la main (voir mascot-art.ts pour
// l'historique). Corps = tête (sphère) + antenne + 2 roues ; expressions
// portées entièrement par les yeux (idle/thinking/happy/perplexed).
//
// Ordre de rendu : roues → tête → yeux (clipés au visage) → antenne.
// Les roues passent derrière la tête (seul le bas dépasse, comme des
// roulettes) ; l'antenne passe au-dessus (rien à cacher, elle est
// entièrement hors du disque de la tête).

export type MascotState = MascotStateId;

const STATE_LABEL: Record<MascotState, string> = {
  idle: "repos",
  thinking: "réflexion",
  happy: "content",
  perplexed: "perplexe",
};

// Le visage (headPath) est identique pour tous les états et toutes les
// instances → un seul id de clip suffit (les duplicats de #lma-head dans le
// DOM pointent tous vers la même géométrie).
const CLIP_ID = "lma-head";

export function Mascot({
  state = "idle",
  variant = "full",
  interactive = false,
  style,
}: {
  state?: MascotState;
  variant?: "full" | "face";
  /** Active les micro-interactions au survol (antenne, roues) — réservé au launcher. */
  interactive?: boolean;
  style?: CSSProperties;
}) {
  const eyes = EYES[state];

  const eyesGroup = (
    <g className="lma-eyes" clipPath={`url(#${CLIP_ID})`}>
      <g className={state === "happy" ? undefined : "lma-blink"}>
        <path
          d={eyes.left}
          fill="#2B1D1D"
          opacity={eyes.leftVisible ? 1 : 0}
        />
        <path
          d={eyes.right}
          fill="#2B1D1D"
          opacity={eyes.rightVisible ? 1 : 0}
        />
      </g>
    </g>
  );

  return (
    <svg
      viewBox="-150 -150 300 300"
      role="img"
      aria-label={`Mascotte — ${STATE_LABEL[state]}`}
      className={`lma-mascot${interactive ? " lma-mascot--interactive" : ""}`}
      style={style}
    >
      <defs>
        <clipPath id={CLIP_ID}>
          <path d={BODY.headPath} />
        </clipPath>
      </defs>

      <g className={state === "idle" || state === "happy" ? "lma-bob" : undefined}>
        {variant === "full" && (
          <g className="lma-wheels">
            <circle cx={BODY.wheelLeft.cx} cy={BODY.wheelLeft.cy} r={BODY.wheelLeft.r} fill="#8F2626" />
            <circle cx={BODY.wheelRight.cx} cy={BODY.wheelRight.cy} r={BODY.wheelRight.r} fill="#8F2626" />
          </g>
        )}
        <path d={BODY.headPath} fill="#CA3E3E" />
        {eyesGroup}
        {variant === "full" && (
          <g className={state === "thinking" ? "lma-antenna lma-antenna--thinking" : "lma-antenna"}>
            <path d={BODY.antennaStalk} fill="#CA3E3E" />
            <circle
              className="lma-antenna-tip"
              cx={BODY.antennaTip.cx}
              cy={BODY.antennaTip.cy}
              r={BODY.antennaTip.r}
              fill={state === "happy" ? "#4ADE80" : "#DA675E"}
            />
          </g>
        )}
      </g>
    </svg>
  );
}
