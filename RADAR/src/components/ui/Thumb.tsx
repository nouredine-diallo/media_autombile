'use client';

import { IconImageOff } from '@/components/icons';

/**
 * Vignette d'image distante.
 *
 * Composant client : le repli en cas d'échec de chargement passe par un
 * gestionnaire `onError`, qui ne peut pas traverser la frontière serveur.
 *
 * Les images sources (RSS / og:image) font typiquement 600-1200 px de large et
 * sont affichées ici à 48-80 px : le navigateur les réduit, donc le rendu reste
 * net sur écran Retina (2×). L'attribut `sizes` évite qu'un futur srcset serve
 * une variante trop petite. En cas d'échec, on remplace par une icône vectorielle
 * — jamais par un emoji, jamais par une injection d'innerHTML.
 *
 * L'icône de repli est fixée ici plutôt que reçue en prop : un composant ne
 * peut pas traverser la frontière serveur → client.
 */
export function Thumb({
  src,
  alt,
  size = 48,
  className = '',
}: {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  const box = `overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] ${className}`;

  if (!src) {
    return (
      <div
        className={`${box} flex items-center justify-center`}
        style={{ width: size, height: size }}
      >
        <IconImageOff
          size={Math.round(size * 0.38)}
          strokeWidth={1.5}
          className="text-[var(--text-faint)]"
        />
      </div>
    );
  }

  return (
    <div className={box} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        sizes={`${size * 2}px`}
        className="h-full w-full object-cover"
        onError={(e) => {
          const el = e.currentTarget;
          el.style.display = 'none';
        }}
      />
    </div>
  );
}
