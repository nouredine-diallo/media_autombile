"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analyticsClient";

// Trouvé le 15 sept. 2026 (test réel de parcours) : monté dans le layout
// racine, donc rendu même sur /login et /select-name — /api/analytics
// n'étant pas dans l'allowlist du middleware (à raison : rien n'empêcherait
// sinon un POST non authentifié d'y injecter des faux événements), chaque
// visite de connexion déclenchait un 401 silencieux, jamais visible pour
// l'utilisateur mais une perte réelle de données sur le trafic pré-connexion.
// Corrigé à la source plutôt qu'en élargissant l'allowlist : pas de session,
// pas de tracking, cohérent avec l'usage réel (suivre l'activité éditoriale,
// pas les visites anonymes de la page de login).
const PUBLIC_ROUTES = ["/login", "/select-name"];

/** Monté une fois dans le layout racine — suit chaque changement de page automatiquement. */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (PUBLIC_ROUTES.includes(pathname)) return;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
