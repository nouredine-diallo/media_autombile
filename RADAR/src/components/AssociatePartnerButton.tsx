'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { IconCheck, IconPartners } from '@/components/icons';

interface Partner {
  id: number;
  name: string;
  brand: string | null;
}

/**
 * Associer un article validé à un partenaire, sans quitter la page où on le
 * valide déjà — le point naturel pour faire ce lien, pas une destination à
 * part (/partenaires) qu'il faut penser à revisiter plus tard.
 */
export function AssociatePartnerButton({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [associatedWith, setAssociatedWith] = useState<string | null>(null);

  const handleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && !partners && !loading) {
      setLoading(true);
      try {
        const res = await fetch('/api/partners');
        const data = await res.json();
        setPartners(data.partners || []);
      } catch {
        setPartners([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAssociate = async (partner: Partner) => {
    setOpen(false);
    setAssociatedWith(partner.name);
    try {
      await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'associate', partnerId: partner.id, contentId }),
      });
    } catch {
      setAssociatedWith(null);
    }
  };

  if (associatedWith) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--success-border)] bg-[var(--success-soft)] px-3 text-[13px] font-medium text-[var(--success)]">
        <IconCheck size={13} strokeWidth={2} />
        {associatedWith}
      </span>
    );
  }

  return (
    <div className="relative">
      <Button onClick={handleOpen} variant="secondary" size="md">
        <IconPartners size={13} strokeWidth={1.75} />
        Partenaire
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="chrome-glass absolute right-0 z-50 mt-1.5 w-56 rounded-[var(--radius-lg)] border p-1.5">
            {loading && (
              <div className="px-2.5 py-2 text-xs text-[var(--text-muted)]">Chargement…</div>
            )}
            {!loading && partners?.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-[var(--text-muted)]">
                Aucun partenaire enregistré
              </div>
            )}
            {!loading &&
              partners?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAssociate(p)}
                  className="block w-full truncate rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  {p.name}
                  {p.brand ? ` — ${p.brand}` : ''}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
