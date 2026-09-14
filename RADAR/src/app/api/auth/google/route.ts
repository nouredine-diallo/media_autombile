import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getGoogleAuthUrl, isGoogleConfigured } from '@/lib/google-auth';

export const GOOGLE_OAUTH_STATE_COOKIE = 'google_oauth_state';

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: 'Google Drive non configuré — ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env.local' },
      { status: 503 }
    );
  }

  // Finding A4 (audit 2026-09-07) : voir google-auth.ts pour le scénario
  // d'attaque évité. Cookie httpOnly, courte durée de vie (10 min — le
  // temps de faire l'aller-retour Google), à usage unique (supprimé dès
  // vérifié par le callback).
  const state = randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });

  const url = getGoogleAuthUrl(state);
  return NextResponse.redirect(url);
}
