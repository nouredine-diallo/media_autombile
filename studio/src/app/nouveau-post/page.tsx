import { redirect } from "next/navigation";

/**
 * Ancienne première étape (dépôt des images + attribution des rôles).
 *
 * **Fusionnée dans `/titres` le 2026-08-21.** Les deux pages avaient chacune
 * leur propre zone d'upload et ne se transmettaient rien : les photos déposées
 * ici n'arrivaient jamais sur le montage, et l'export sortait un gabarit vide
 * avec juste le titre. Un parcours en deux pages déconnectées est aussi deux
 * fois plus de clics pour le même résultat.
 *
 * La page est conservée en redirection plutôt que supprimée : des liens et des
 * signets pointent dessus. Son ancien contenu reste dans `archive/nouveau-post-page-avant-fusion.tsx`
 * tant que la fusion n'a pas été validée à l'usage.
 */
export default function NouveauPostPage() {
  redirect("/titres");
}
