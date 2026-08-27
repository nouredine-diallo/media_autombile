import { redirect } from 'next/navigation';

/**
 * Fusionné dans /corrections (onglet "Règles actives", 2026-08-27) —
 * "Corrections" et "Guide de style" affichaient déjà la même table
 * `style_rules` sous deux formes différentes. Route conservée pour ne pas
 * casser un lien existant, redirige vers la page unifiée.
 */
export default function StyleGuideRedirect() {
  redirect('/corrections?tab=rules');
}
