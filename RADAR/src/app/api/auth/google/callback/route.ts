import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, storeTokens, getUserEmail } from '@/lib/google-auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

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
