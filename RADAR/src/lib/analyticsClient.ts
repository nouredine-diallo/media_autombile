"use client";

/**
 * Client de suivi léger — voir /api/analytics pour le pourquoi. Fire-and-
 * forget : un échec réseau ne doit jamais bloquer l'usage réel de l'outil,
 * exactement comme le callback STUDIO→RADAR (même pattern déjà établi).
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
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, page, label, sessionId: getSessionId() }),
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
