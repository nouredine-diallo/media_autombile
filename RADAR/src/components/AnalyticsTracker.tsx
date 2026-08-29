"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analyticsClient";

/** Monté une fois dans le layout racine — suit chaque changement de page automatiquement. */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
