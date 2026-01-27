import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

const ASSETS_ROOT = path.join(process.cwd(), "assets");

const CONTENT_TYPES: Record<string, string> = {
  ".fbx": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".tga": "image/x-tga",
  ".dds": "image/vnd-ms.dds",
  ".bmp": "image/bmp",
};

function resolveAssetPath(segments: string[]) {
  const resolvedPath = path.resolve(ASSETS_ROOT, ...segments);
  if (!resolvedPath.startsWith(ASSETS_ROOT)) {
    return null;
  }
  return resolvedPath;
}

export async function GET(
  _request: Request,
  { params }: { params: { path?: string[] } },
) {
  const segments = params.path ?? [];
  const resolvedPath = resolveAssetPath(segments);

  if (!resolvedPath) {
    return NextResponse.json({ error: "Invalid asset path." }, { status: 400 });
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const stream = createReadStream(resolvedPath);

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to serve asset", error);
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}

export const runtime = "nodejs";
