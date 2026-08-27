import React from "react";

/**
 * Parse du gras inline simple (**texte** → <strong>texte</strong>).
 *
 * Aucune dépendance externe — regex basique pour les besoins du gabarit 1B
 * (paragraphe avec mots-clés en gras). Ne gère pas les cas limites de
 * Markdown (listes, liens, etc.) — ce n'est pas un objectif ici.
 */
export function parseInlineBold(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
