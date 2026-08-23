import { NextRequest, NextResponse } from 'next/server';
import { getDriveThumbnail } from '@/lib/driveGoogle';
import { getValidAccessToken } from '@/lib/google-auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('id');
  const url = searchParams.get('url');

  if (!fileId && !url) {
    return NextResponse.json({ error: 'id or url required' }, { status: 400 });
  }

  // Proxy a thumbnail URL (for CORS bypass)
  if (url) {
    const token = await getValidAccessToken();
    if (!token) {
      return NextResponse.json({ error: 'Not connected' }, { status: 401 });
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        return new NextResponse(null, { status: response.status });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch {
      return new NextResponse(null, { status: 502 });
    }
  }

  // Get thumbnail by file ID
  if (fileId) {
    const result = await getDriveThumbnail(fileId);
    if (!result) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(result.buffer, {
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  return new NextResponse(null, { status: 400 });
}
