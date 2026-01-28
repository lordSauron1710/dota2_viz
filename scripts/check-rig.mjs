import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = process.argv[2] ?? path.join(__dirname, "..", "assets", "kez", "kez_econ.fbx");
const resolvedPath = path.resolve(inputPath);

const buffer = await readFile(resolvedPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new FBXLoader();
const fbx = loader.parse(arrayBuffer, path.dirname(resolvedPath));

let hasBones = false;
let hasSkinnedMesh = false;
let boneCount = 0;
let skinnedMeshCount = 0;

fbx.traverse((obj) => {
  if (obj.isBone) {
    hasBones = true;
    boneCount += 1;
  }
  if (obj.isSkinnedMesh) {
    hasSkinnedMesh = true;
    skinnedMeshCount += 1;
  }
});

console.log({
  file: resolvedPath,
  hasBones,
  hasSkinnedMesh,
  boneCount,
  skinnedMeshCount,
});
