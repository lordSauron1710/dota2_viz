# dota2_viz

Comprehensive Three.js viewer for the Kez hero model with animation controls and diagnostics.

## Viewer features

- FBX loader with TGA texture support and automatic texture path remapping.
- Animation controls: clip picker, speed, time scrub, loop, and clamp.
- View controls: auto-rotate, grid/floor toggles, skeleton helper, reset view.
- Stats readout for draw calls, triangles, geometries, and textures.
- Local FBX upload to preview other assets.

## Asset structure

- `assets/kez/kez_econ.fbx` — FBX model export (primary asset for the viewer).
- `assets/kez/kez_econ.ma` — Maya scene file.
- `assets/kez/materials/` — textures/material maps used by the model.
- `assets/kez/materials/base/` — base/shared material maps.
- `assets/kez_instructions.png` — reference sheet with usage notes.

## Notes from `kez_instructions.png`

- Model/texture usage: “Use the hero model to see your item in context.”
- Item slots and budgets:
  - Head: LoD0 triangle limit 3000; LoD1 triangle limit 1200; texture size 512x512.
  - Shoulders: LoD0 triangle limit 6000; LoD1 triangle limit 2400; texture size 512x512.
  - Weapon: LoD0 triangle limit 2500; LoD1 triangle limit 1000; texture size 256x256.
  - Weapon offhand: LoD0 triangle limit 2000; LoD1 triangle limit 800; texture size 256x256.
  - Belt: LoD0 triangle limit 4000; LoD1 triangle limit 1600; texture size 512x512.

## Run

```bash
python3 -m http.server
```

Open `http://localhost:8000`.
