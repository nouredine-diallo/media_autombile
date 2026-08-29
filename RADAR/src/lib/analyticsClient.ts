"use client";

/**
 * Client de suivi léger — voir /api/analytics pour le pourquoi.
 *
 * navigator.sendBeacon() plutôt que fetch() (2026-08-29) — bug réel signalé
 * en prod : "la page charge puis affiche This page couldn't load" après
 * navigation. Cause trouvée : nginx sert en HTTP/1.1 pur (pas de HTTP/2,
 * vérifié sur la conf), donc le navigateur plafonne à ~6 connexions
 * simultanées par origine. Un fetch() de plus à CHAQUE changement de page
 * entrait en concurrence avec les propres requêtes de la page (le payload
 * RSC de Next.js, les chunks JS) — sur une connexion à latence variable,
 * ça pouvait faire échouer la navigation elle-même. sendBeacon() est conçu
 * précisément pour ce cas d'usage : le navigateur le traite hors de la
 * queue de connexions normale, ne bloque et ne fait jamais échouer une
 * navigation. Fallback sur fetch() uniquement si sendBeacon est indisponible
 * ou refuse la requête (garde le comportement précédent en dernier recours).
 */

const SESSION_KEY = "lma-analytics-session";

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage indisponible (navigation privée stricte, etc.) — un id
    // par appel plutôt qu'un crash, la session groupée devient juste moins
    // précise pour cet utilisateur, ce n'est jamais bloquant.
    return crypto.randomUUID();
  }
}

function send(eventType: "page_view" | "action", page: string, label?: string) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ eventType, page, label, sessionId: getSessionId() });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    const queued = navigator.sendBeacon("/api/analytics", blob);
    if (queued) return;
  }

  // Repli fetch — sendBeacon indisponible ou a refusé la requête.
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function trackPageView(page: string) {
  send("page_view", page);
}

/** À appeler sur les actions clés (ex. trackAction(pathname, "Générer l'article")). */
export function trackAction(page: string, label: string) {
  send("action", page, label);
}
