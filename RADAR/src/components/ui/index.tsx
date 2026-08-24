/**
 * Primitives d'interface du Dashboard.
 *
 * Objectif : une seule définition de « carte », « badge », « bouton »,
 * « état vide » pour toute l'application. Une page n'invente pas ses propres
 * couleurs ni ses propres rayons — elle assemble ces briques.
 *
 * Toutes les couleurs viennent des jetons de globals.css. Aucun hexadécimal
 * en dur ici, aucun effet de verre : ces composants portent du contenu dense.
 */
import { ReactNode, ComponentProps, ElementType } from 'react';
import Link from 'next/link';

/* --------------------------------------------------------------- Ton -------
   `accent` est la couleur de MARQUE (rouge brique) : identité et interaction.
   Les autres tons décrivent un ÉTAT, jamais une décoration, et s'écartent du
   rouge en teinte pour ne pas être confondus avec la marque :
     warn = urgent (ambre) · info = en cours (bleu) · success = prêt (vert)
     danger = erreur (rouge vif, rare, toujours avec icône + libellé)
   `studio` est l'identité de l'application externe.                          */
export type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'info' | 'success' | 'studio';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-[var(--text-secondary)]',
  accent: 'text-[var(--accent)]',
  danger: 'text-[var(--danger)]',
  warn: 'text-[var(--warn)]',
  info: 'text-[var(--info)]',
  success: 'text-[var(--success)]',
  studio: 'text-[var(--studio)]',
};

const TONE_SOFT_BG: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-hover)]',
  accent: 'bg-[var(--accent-soft)]',
  danger: 'bg-[var(--danger-soft)]',
  warn: 'bg-[var(--warn-soft)]',
  info: 'bg-[var(--info-soft)]',
  success: 'bg-[var(--success-soft)]',
  studio: 'bg-[var(--studio-soft)]',
};

const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-[var(--border-subtle)]',
  accent: 'border-[var(--accent-border)]',
  danger: 'border-[var(--danger-border)]',
  warn: 'border-[var(--warn-border)]',
  info: 'border-[var(--info-border)]',
  success: 'border-[var(--success-border)]',
  studio: 'border-[var(--studio-border)]',
};

/* --------------------------------------------------------------- Carte ---- */
export function Card({
  children,
  className = '',
  tone = 'neutral',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border bg-[var(--surface-raised)] ${
        tone === 'neutral' ? 'border-[var(--border-subtle)]' : TONE_BORDER[tone]
      } ${padded ? 'p-4' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

/** En-tête de carte : un titre, une action à droite. Rien d'autre. */
export function CardHeader({
  title,
  icon: Icon,
  action,
  count,
}: {
  title: string;
  icon?: ElementType;
  action?: ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon size={16} strokeWidth={1.75} className="text-[var(--text-muted)]" />}
        <h2 className="t-title truncate text-[var(--text-primary)]">{title}</h2>
        {count !== undefined && (
          <span className="font-data t-caption text-[var(--text-muted)]">{count}</span>
        )}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------- En-tête de section */
export function SectionHeader({
  label,
  icon: Icon,
  tone = 'neutral',
  count,
  action,
}: {
  label: string;
  icon?: ElementType;
  tone?: Tone;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      {Icon && <Icon size={14} strokeWidth={2} className={TONE_TEXT[tone]} />}
      <h2 className="t-eyebrow">{label}</h2>
      {count !== undefined && (
        <span
          className={`font-data rounded-[var(--radius-full)] px-1.5 py-0.5 text-[11px] leading-none ${TONE_SOFT_BG[tone]} ${TONE_TEXT[tone]}`}
        >
          {count}
        </span>
      )}
      <div className="ml-auto">{action}</div>
    </div>
  );
}

/* --------------------------------------------------------------- Badge ---- */
export function Badge({
  children,
  tone = 'neutral',
  icon: Icon,
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ElementType;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2 py-0.5 text-[11px] font-medium leading-5 ${TONE_SOFT_BG[tone]} ${TONE_TEXT[tone]} ${className}`}
    >
      {Icon && <Icon size={12} strokeWidth={2} />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- Bouton ---- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'studio';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] active:bg-[var(--brand-pressed)] border border-transparent',
  secondary:
    'bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-overlay)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-hover)] hover:text-white',
  danger:
    'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-border)] hover:bg-[var(--danger-soft)] hover:border-[var(--danger)]',
  studio:
    'bg-[var(--studio-soft)] text-[var(--studio)] border border-[var(--studio-border)] hover:border-[var(--studio)]',
};

const BUTTON_SIZE = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-[var(--radius-md)]',
};

function buttonClass(variant: ButtonVariant, size: keyof typeof BUTTON_SIZE, className: string) {
  return `inline-flex items-center justify-center font-medium transition-colors duration-[var(--dur-fast)] disabled:opacity-45 disabled:pointer-events-none ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`;
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: keyof typeof BUTTON_SIZE }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'secondary',
  size = 'sm',
  className = '',
  href,
  external,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZE;
  className?: string;
  href: string;
  external?: boolean;
  children: ReactNode;
} & Omit<ComponentProps<'a'>, 'href'>) {
  const cls = buttonClass(variant, size, className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------- Tuile chiffre -- */
export function StatTile({
  value,
  label,
  href,
  external,
  tone = 'neutral',
}: {
  value: ReactNode;
  label: string;
  href?: string;
  external?: boolean;
  tone?: Tone;
}) {
  const body = (
    <>
      <div className={`font-data text-[22px] font-semibold leading-none ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      <div className="t-caption mt-1.5 text-[var(--text-muted)]">{label}</div>
    </>
  );
  const cls =
    'block rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3.5 transition-colors duration-[var(--dur)] hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)]';

  if (!href) return <div className={cls}>{body}</div>;
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/* ------------------------------------------------------------ État vide ---- */
/** État 2/3 obligatoire : dit quoi faire, jamais « aucune donnée » tout court. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
}: {
  icon: ElementType;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8' : 'py-14'
      }`}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-full)] bg-[var(--surface-hover)]">
        <Icon size={18} strokeWidth={1.75} className="text-[var(--text-muted)]" />
      </div>
      <p className="t-label text-[var(--text-primary)]">{title}</p>
      {hint && <p className="t-caption mt-1 max-w-sm text-[var(--text-muted)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- Squelette --- */
/** État 3/3 : épouse la forme du contenu attendu, pas une roue qui tourne. */
export function SkeletonRows({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton rounded-[var(--radius-lg)]" style={{ height }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Vignette ---- */
export { Thumb } from './Thumb';
