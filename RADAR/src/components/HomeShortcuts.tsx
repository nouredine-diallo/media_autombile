'use client';

import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardHint } from '@/components/KeyboardHint';
import { useRouter } from 'next/navigation';

export function HomeShortcuts() {
  const router = useRouter();

  useKeyboardShortcuts([
    { key: 'v', description: 'Aller à la veille', action: () => router.push('/events') },
    { key: 'r', description: 'Aller aux prêts', action: () => router.push('/ready') },
    { key: 'c', description: 'Aller aux corrections', action: () => router.push('/corrections') },
    { key: 's', description: 'Aller aux stats', action: () => router.push('/stats') },
    { key: 'p', description: 'Aller aux partenaires', action: () => router.push('/partenaires') },
    { key: 'k', description: 'Aller au calendrier', action: () => router.push('/calendrier') },
    { key: '[', description: 'Rétracter la barre', action: () => {} },
  ]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <KeyboardHint
        shortcuts={[
          { key: 'V', description: 'Veille' },
          { key: 'R', description: 'Prêts' },
          { key: 'C', description: 'Corrections' },
          { key: 'S', description: 'Stats' },
          { key: 'P', description: 'Partenaires' },
          { key: 'K', description: 'Calendrier' },
          { key: '[', description: 'Barre latérale' },
        ]}
      />
    </div>
  );
}
