import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

const ENV_ASSETS_ROOT = path.join(process.cwd(), "env_assets");

const CONTENT_TYPES: Record<string, string> = {
  ".exr": "image/x-exr",
};
const CACHE_CONTROL =
  process.env.NODE_ENV === "production"
    ? "public, max-age=31536000, immutable"
    : "no-cache";

function resolveAssetPath(segments: string[]) {
  const resolvedPath = path.resolve(ENV_ASSETS_ROOT, ...segments);
  if (!resolvedPath.startsWith(ENV_ASSETS_ROOT)) {
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
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("Failed to serve env asset", error);
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}

export const runtime = "nodejs";
