import { NextResponse } from 'next/server';
import { getDriveFiles, getDriveFileById, getBreadcrumb, getDriveStats, syncLocalDirectory } from '@/lib/drive';

// GET files or single file
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const search = searchParams.get('search');
    const parentId = searchParams.get('parentId');
    const sync = searchParams.get('sync');
    const stats = searchParams.get('stats');

    if (stats === 'true') {
      const driveStats = getDriveStats();
      return NextResponse.json({ success: true, stats: driveStats });
    }

    if (sync === 'true') {
      const count = syncLocalDirectory();
      return NextResponse.json({ success: true, synced: count });
    }

    if (id) {
      const file = getDriveFileById(parseInt(id));
      if (!file) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      const breadcrumb = getBreadcrumb(parseInt(id));
      return NextResponse.json({ success: true, file, breadcrumb });
    }

    const files = getDriveFiles(search || undefined, parentId || undefined);
    return NextResponse.json({ success: true, files });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
