"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wrapper fetch pour les composants client — finding C2/C4 (audit
 * 2026-09-07) : aucun des 71 appels fetch() côté navigateur n'avait de
 * timeout, et un seul écran sur une dizaine détectait un 401 (session
 * expirée) pour rediriger proprement vers /login — ailleurs, le message
 * "Non authentifié" s'affichait comme une erreur générique ou disparaissait.
 *
 * Pas une réécriture de tous les appels : un remplacement de fetch() par
 * apiFetch() aux points d'entrée à plus fort trafic (voir le rapport
 * d'audit pour la liste). N'importe quel `RequestInit.signal` déjà fourni
 * par l'appelant est respecté tel quel (jamais écrasé).
 */

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Trouvé le 15 sept. 2026 : ce timeout de 15s s'appliquait aussi aux appels
 * de génération LLM (brief/article/correction), qui peuvent légitimement
 * prendre 30s à 2min (RADAR/CLAUDE.md §11) — le client abandonnait presque
 * systématiquement avant le serveur, affichant un faux timeout alors que le
 * calcul continuait en fond et finissait par aboutir (visible seulement au
 * rechargement suivant). `timeoutMs` permet aux appelants qui savent qu'un
 * appel est lent de repousser ce plafond sans changer le défaut, plus
 * adapté, des appels rapides (liste, statut, verrous).
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 401 && typeof window !== "undefined") {
    // Rechargement complet volontaire (pas useRouter/next/navigation) : ce
    // fichier est un utilitaire appelable hors arbre React, et une session
    // expirée doit repartir d'un état totalement propre plutôt que de
    // conserver un state client obsolète après la redirection.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  return res;
}

/**
 * Finding C7 (audit 2026-09-07) : aucune reconnexion automatique nulle part
 * — un écran resté sur une erreur réseau (5G qui coupe puis revient, cas
 * courant pour une équipe mobile) attendait un tap manuel sur "Réessayer"
 * même une fois la connexion revenue. `navigator.onLine` + l'événement
 * `online` du navigateur pour déclencher `onReconnect` sans que l'appelant
 * ait à gérer lui-même l'abonnement/désabonnement.
 *
 * `onReconnect` est lu via une ref pour ne réabonner l'écouteur `online`
 * que si le composant démonte/remonte, jamais à chaque rendu — un appelant
 * qui passe une fonction inline (le cas courant) ne doit pas provoquer un
 * désabonnement/réabonnement à chaque frappe/état local du composant. La
 * ref est mise à jour dans son propre effet (jamais pendant le rendu —
 * règle stricte de ce projet, `react-hooks/refs`).
 */
export function useOnlineStatus(onReconnect?: () => void): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      onReconnectRef.current?.();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
