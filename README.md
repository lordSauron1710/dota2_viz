# dota2_viz

Simple Three.js viewer for the Kez hero model, plus the bundled asset pack.

## Asset structure

- `assets/kez/kez_econ.fbx` — FBX model export (primary asset for the viewer).
- `assets/kez/kez_econ.ma` — Maya scene file.
- `assets/kez/materials/` — textures/material maps used by the model.
- `assets/kez/materials/base/` — base/shared material maps.
- `assets/kez_instructions.png` — reference sheet with usage notes.
- Asset source: `https://www.dota2.com/workshop/requirements/kez`.

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

## Next.js viewer (v1)

This repo also includes a Next.js + Three.js viewer for a single locally stored Dota 2 hero model. It loads the model from `/public`, centers and fits the camera, and exposes animation, lighting, and playback controls.

### Asset placement

Place your hero asset at the exact path below (FBX for the Kez asset):

```
/public/assets/kez/kez_econ.fbx
```

If the model needs external textures, keep them under the Kez assets folder:

```
/public/assets/kez/materials/*
```

For the Kez asset folder, keep the `materials` folder (including `materials/base`) alongside `kez_econ.fbx` under `/public/assets/kez/`. The `.ma` file is not used by the viewer.

### Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/hero`.

### Deploying to Vercel

1. Push this repository to GitHub.
2. Create a new project in Vercel and import the repo.
3. Ensure the Kez asset exists in the `/public/assets/kez/` path before deploying.
4. Vercel will detect Next.js automatically. Use the default build command (`npm run build`).

### URL state

The viewer persists key settings in the `/hero` query string:

- `anim=<clipName>`
- `speed=<float>`
- `preset=<studio|neutral|rim>`
- `autoplay=1|0`
