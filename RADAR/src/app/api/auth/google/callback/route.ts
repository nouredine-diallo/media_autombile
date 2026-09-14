import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCode, storeTokens, getUserEmail } from '@/lib/google-auth';
import { GOOGLE_OAUTH_STATE_COOKIE } from '@/app/api/auth/google/route';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error) {
    return NextResponse.redirect(
      new URL(`/drive?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/drive?error=No+authorization+code+received', request.url)
    );
  }

  // Finding A4 (audit 2026-09-07) : vérification CSRF — voir google-auth.ts
  // pour le scénario d'attaque évité. Le cookie est supprimé dans tous les
  // cas (usage unique), avant même de savoir si la vérification passe.
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);

  if (!expectedState || !state || state !== expectedState) {
    console.error('Google OAuth callback: state invalide ou absent — requête rejetée (protection CSRF)');
    return NextResponse.redirect(
      new URL('/drive?error=Requ%C3%AAte+invalide+(state)+%E2%80%94+relance+la+connexion+Drive', request.url)
    );
  }

  try {
    const tokens = await exchangeCode(code);

    // Get user email
    const email = await getUserEmail();
    tokens.email = email ?? undefined;

    storeTokens(tokens);

    return NextResponse.redirect(new URL('/drive?connected=true', request.url));
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return NextResponse.redirect(
      new URL(`/drive?error=${encodeURIComponent(err instanceof Error ? err.message : 'Unknown error')}`, request.url)
    );
  }
}
