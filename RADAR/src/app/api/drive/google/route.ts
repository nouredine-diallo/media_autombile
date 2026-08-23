import { NextRequest, NextResponse } from 'next/server';
import { listDriveFiles, syncDriveToDb, getCloudFilesFromDb } from '@/lib/driveGoogle';
import { isGoogleConfigured, getStoredTokens, disconnectGoogle, getValidAccessToken } from '@/lib/google-auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Status check
  if (searchParams.get('status') === 'true') {
    const configured = isGoogleConfigured();
    const tokens = getStoredTokens();
    return NextResponse.json({
      configured,
      connected: !!tokens,
      email: tokens?.email ?? null,
    });
  }

  // Disconnect
  if (searchParams.get('disconnect') === 'true') {
    disconnectGoogle();
    return NextResponse.json({ success: true, connected: false });
  }

  // Check if connected
  if (!isGoogleConfigured() || !getStoredTokens()) {
    // Fallback to local files
    return NextResponse.json({
      connected: false,
      files: [],
      source: 'local',
    });
  }

  // Sync from Google Drive
  if (searchParams.get('sync') === 'true') {
    try {
      const result = await syncDriveToDb();
      return NextResponse.json({ success: true, ...result, source: 'google' });
    } catch (err) {
      console.error('Drive sync error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Sync failed' },
        { status: 500 }
      );
    }
  }

  // Search
  const search = searchParams.get('search');
  const parentId = searchParams.get('parentId');

  try {
    // Try Google Drive first
    const token = await getValidAccessToken();
    if (token) {
      const result = await listDriveFiles(parentId ?? undefined, undefined, search ?? undefined);
      return NextResponse.json({
        connected: true,
        files: result.files.map(f => ({
          id: f.id,
          name: f.name,
          mime_type: f.mimeType,
          size: parseInt(f.size || '0', 10),
          modified_at: f.modifiedTime,
          is_folder: f.mimeType === 'application/vnd.google-apps.folder' ? 1 : 0,
          thumbnail_url: f.thumbnailLink ?? null,
          web_view_link: f.webViewLink ?? null,
          is_cloud: 1,
          drive_id: f.id,
          parent_id: f.parents?.[0] ?? null,
        })),
        nextPageToken: result.nextPageToken,
        source: 'google',
      });
    }
  } catch (err) {
    console.error('Drive API error, falling back to cache:', err);
  }

  // Fallback to cached cloud files
  const files = getCloudFilesFromDb(parentId ?? undefined, search ?? undefined);
  return NextResponse.json({
    connected: true,
    files,
    source: 'cache',
  });
}
