# Dota 2 Hero Viewer (Single Asset)

This project is a Next.js + Three.js viewer for a single locally stored Dota 2 hero model. It loads the model from `/public`, centers and fits the camera, and exposes animation, lighting, and playback controls.

## Asset placement

Place your hero asset at the exact path below (FBX for the Kez asset):

```
/public/assets/kez/kez_econ.fbx
```

If the model needs external textures, keep them under the Kez assets folder:

```
/public/assets/kez/materials/*
```

For the Kez asset folder you mentioned, keep the `materials` folder (including `materials/base`) alongside `kez_econ.fbx` under `/public/assets/kez/`. The `.ma` file is not used by the viewer.

## Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/hero`.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Create a new project in Vercel and import the repo.
3. Ensure the Kez asset exists in the `/public/assets/kez/` path before deploying.
4. Vercel will detect Next.js automatically. Use the default build command (`npm run build`).

## URL state

The viewer persists key settings in the `/hero` query string:

- `anim=<clipName>`
- `speed=<float>`
- `preset=<studio|neutral|rim>`
- `autoplay=1|0`

Refreshing the page restores the same configuration.
