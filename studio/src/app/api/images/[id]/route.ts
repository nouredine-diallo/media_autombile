import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getSession } from "@/lib/session";
import { resolveVariantPath } from "@/lib/images/store";

export const runtime = "nodejs";

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const variant = request.nextUrl.searchParams.get("variant") ?? "cropped";

  const filePath = await resolveVariantPath(id, variant);
  if (!filePath) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const bytes = await readFile(filePath);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
