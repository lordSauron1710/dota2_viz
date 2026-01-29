# Downsizing Process

This document captures the Phase 1 downsizing work applied to ship Kez + Doom with smaller assets while keeping visual quality.

## Goals
- Keep only Kez + Doom.
- Reduce texture footprint without changing runtime features.
- Keep asset paths stable for the viewer.

## What changed
1) Removed Monkey King assets and UI references.
2) Converted Kez + Doom textures from `.tga` to `.png`.
3) Updated the viewer to resolve textures as `.png` (including Valve `.vtf` remaps).
4) Replaced the 4K EXR sky with a 1K HDR and updated the loader.
5) Fixed grayscale+alpha PNG conversion for Doom eye textures.

## Commands used
- Convert and downscale textures (2K cap, convert TGA -> PNG):
  ```bash
  node scripts/downscale_textures.mjs
  ```

## Resulting size reductions (approx)
- Kez materials: ~440 MB -> ~174 MB
- Doom materials: ~261 MB -> ~47 MB
- Combined materials: ~701 MB -> ~221 MB
- Sky environment: ~67 MB EXR -> ~1.2 MB HDR

## Notes
- The conversion outputs PNG files and removes the original TGA files.
- The viewer is now configured to look for `.png` materials by default.
- If additional heroes are added later, repeat the same conversion process.
