"use client";

/**
 * Client de suivi léger — voir /api/analytics pour le pourquoi.
 *
 * Vraie cause du "This page couldn't load" trouvée le 2026-08-29 par
 * diagnostic réseau réel (Playwright, écouteur `pageerror` sur la vraie
 * URL de prod) : `crypto.randomUUID()` lève une exception NON RATTRAPÉE
 * ("crypto.randomUUID is not a function") — cette méthode n'existe QUE
 * dans un contexte sécurisé (HTTPS, ou localhost par exception du
 * navigateur). Le site de prod tourne en HTTP simple (89.168.53.133.nip.io,
 * pas de certificat) : chaque appel plantait, sur CHAQUE navigation,
 * puisqu'appelé aussi bien dans le `try` que dans son propre `catch` (le
 * `catch` relançait donc la même exception, cette fois vraiment non
 * rattrapée). Invisible en local car `localhost` bénéficie de l'exception
 * "contexte sécurisé" du navigateur — d'où l'écart jamais reproduit avant
 * ce diagnostic direct sur la vraie URL. Le passage à sendBeacon() (fait
 * juste avant) ne pouvait rien résoudre : le plantage a lieu avant l'envoi,
 * dans la génération de l'id.
 *
 * Corrigé avec un générateur d'id sans API restreinte — suffisant pour
 * grouper des événements par session (pas besoin d'aléa cryptographique
 * ici), fonctionne dans tous les contextes, plus léger qu'un appel à
 * l'API Web Crypto.
 */

const SESSION_KEY = "lma-analytics-session";

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = generateId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage indisponible (navigation privée stricte, etc.) — un id
    // par appel plutôt qu'un crash, la session groupée devient juste moins
    // précise pour cet utilisateur, ce n'est jamais bloquant.
    return generateId();
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
