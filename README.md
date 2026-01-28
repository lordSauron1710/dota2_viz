# DotA2 Hero Viewer

A dynamic webapp for exploring Dota 2 hero assets in real time. The UI adapts per-hero (accent colors shift with the selected hero), and the viewer is built for lookdev, pose tuning, and lighting exploration directly in the browser.

## Project idea

Make hero assets easy to browse, compare, and tune without external DCC tools. The viewer emphasizes fast iteration on materials, lighting, and poses while keeping the models and textures close to their original workshop-ready structure.

## Features

- Hero selection for Kez, Doom, and Monkey King.
- Pose controls with playback and speed tuning.
- Dynamic UI accents that change with the selected hero.
- Lighting presets plus environment HDR and backdrop controls.
- Local screenshot capture after adjusting pose, environment, and background.
- One-click reset of the scene state.
- Pause/play control for the current animation.
- Texture resolution + fallbacks for Valve FBX + TGA layouts.
- Optional local FBX loading via file picker.

## UI samples

![Kez sample](ui%20updates/kez_final.png)

![Doom sample](ui%20updates/doom_final.png)

![Monkey King sample](ui%20updates/monkey_final.png)

## Tech stack

- Next.js 14
- React 18
- Three.js 0.160
- WebGL renderer with EffectComposer + SSAO pass
- EXR HDR environment maps

## Model storage and rendering

### Storage

Hero assets live under `assets/<hero>/` and are tracked with Git LFS. Each hero folder contains:

- FBX model files (primary runtime source)
- Optional MA files (reference only)
- `materials/` textures (TGA/DDS) in Valve layout
- `materials/base/` for shared base textures

### Serving

The app serves `/assets/*` using a Next.js route handler that streams from the repo `assets/` directory:

- Route: `app/assets/[...path]/route.ts`
- Example: `assets/doom_bringer/doom_econ.fbx` is served as `/assets/doom_bringer/doom_econ.fbx`

### Rendering

At runtime the viewer:

1) Loads FBX models with Three.js `FBXLoader`.
2) Resolves textures using `TGALoader`/`DDSLoader` and Valve material path rules.
3) Applies fallback textures for missing maps and corrects color space for albedo/emissive.
4) Tunes hero materials for readability while preserving original maps.
5) Drives lighting with custom rigs, SSAO, and tone mapping.

## Asset layout

```
assets/
  kez/
    kez_econ.fbx
    kez_econ.ma
    materials/
      base/
      ...
  doom_bringer/
    doom_econ.fbx
    doom_econ.ma
    materials/
      base/
      ...
  monkey_king/
    monkey_king_econ.fbx
    monkey_king_econ.ma
    materials/
      base/
      ...
```

## Timeline (from CHANGES.md)

2026-01-27 -> v0 baseline, Git LFS introduced, viewer rebuilt, UI v2 layout
2026-01-27 -> rendering pipeline + playback logic + screenshots added
2026-01-28 -> lighting presets, HDR environment, lore panel, and accent styling
2026-01-28 -> multi-hero scaling and Monkey King rendering fixes
2026-01-28 -> asset cleanup: Lion and Brewmaster removed

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000/hero`.

## Sources and attribution

Source reference:

```
https://www.dota2.com/workshop/requirements/
```

All Dota 2 hero assets are credited to Valve Corporation.
