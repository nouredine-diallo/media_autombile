import { NextResponse } from 'next/server';
import { getGoogleAuthUrl, isGoogleConfigured } from '@/lib/google-auth';

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: 'Google Drive non configuré — ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env.local' },
      { status: 503 }
    );
  }

  const url = getGoogleAuthUrl();
  return NextResponse.redirect(url);
}
