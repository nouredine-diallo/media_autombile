"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wrapper fetch pour les composants client — finding C2/C4 (audit
 * 2026-09-07) : aucun des 25 appels fetch() côté navigateur n'avait de
 * timeout, et la gestion du 401 (session expirée) était quasi absente —
 * un seul écran (`titres/carrousel/page.tsx`) le détectait, via un test
 * fragile sur le texte du message d'erreur.
 *
 * Pas une réécriture de tous les appels : un remplacement de fetch() par
 * apiFetch() aux points d'entrée à plus fort trafic (upload, génération de
 * titre — voir le rapport d'audit pour la liste). N'importe quel
 * `RequestInit.signal` déjà fourni par l'appelant est respecté tel quel.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
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
 * — un export/génération resté sur une erreur réseau (5G qui coupe puis
 * revient) attendait un tap manuel même une fois la connexion revenue.
 * `navigator.onLine` + l'événement `online` pour déclencher `onReconnect`.
 * Identique à RADAR/src/lib/apiFetch.ts — même correctif, même app deux fois.
 *
 * `onReconnect` lu via une ref pour ne réabonner l'écouteur qu'au
 * montage/démontage, jamais à chaque rendu (l'appelant passe typiquement
 * une fonction inline). Ref mise à jour dans son propre effet, jamais
 * pendant le rendu (règle stricte de ce projet, `react-hooks/refs`).
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
