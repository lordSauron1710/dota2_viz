import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import TGA from "tga";

const MAX_DIMENSION = Number.parseInt(
  process.env.MAX_DIMENSION ?? "2048",
  10,
);
const ROOTS = (process.env.ROOTS ?? "assets/kez/materials,assets/doom_bringer/materials")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const EXTENSIONS = new Set([".tga", ".png", ".jpg", ".jpeg", ".bmp"]);

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function downscaleFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tga") {
    const buffer = await fs.readFile(filePath);
    const image = new TGA(buffer);
    const width = image.width ?? 0;
    const height = image.height ?? 0;
    const maxDim = Math.max(width, height);
    const resized = maxDim > MAX_DIMENSION;
    const outputPath = filePath.replace(/\.tga$/i, ".png");
    const tmpPath = path.join(
      os.tmpdir(),
      `downscale-${path.basename(outputPath)}-${Date.now()}.png`,
    );

    const pixels = image.pixels;
    if (image.isGray && image.hasAlpha) {
      for (let i = 0; i < pixels.length; i += 4) {
        const gray = pixels[i];
        const alpha = pixels[i + 1];
        pixels[i] = gray;
        pixels[i + 1] = gray;
        pixels[i + 2] = gray;
        pixels[i + 3] = alpha;
      }
    }

    const pipeline = sharp(pixels, {
      raw: { width, height, channels: 4 },
      limitInputPixels: false,
    }).resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

    await pipeline.png().toFile(tmpPath);
    await fs.rename(tmpPath, outputPath);
    await fs.unlink(filePath);
    return { filePath, skipped: !resized, width, height, converted: true };
  }

  const image = sharp(filePath, { limitInputPixels: false });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const maxDim = Math.max(width, height);
  if (maxDim <= MAX_DIMENSION) {
    return { filePath, skipped: true };
  }

  const tmpPath = path.join(
    os.tmpdir(),
    `downscale-${path.basename(filePath)}-${Date.now()}${ext}`,
  );

  await image
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toFile(tmpPath);

  await fs.rename(tmpPath, filePath);
  return { filePath, skipped: false, width, height };
}

async function main() {
  const files = [];
  for (const root of ROOTS) {
    files.push(...(await collectFiles(root)));
  }

  let resized = 0;
  let skipped = 0;
  let converted = 0;
  for (const file of files) {
    try {
      const result = await downscaleFile(file);
      if (result.converted) {
        converted += 1;
      }
      if (result.skipped) {
        skipped += 1;
      } else {
        resized += 1;
      }
    } catch (error) {
      console.error(`Failed to process ${file}:`, error);
      process.exitCode = 1;
    }
  }

  console.log(`Processed ${files.length} files.`);
  console.log(`Resized: ${resized}`);
  console.log(`Converted to PNG: ${converted}`);
  console.log(`Skipped: ${skipped}`);
}

main();
