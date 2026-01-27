# DotA2 Hero Viewer (v2)

An interactive Three.js + Next.js viewer for Dota 2 hero assets. The v2 UI is rebuilt from the ground up with a new three-panel layout, icon-based controls, and a hero picker + FBX loader.

## Highlights

- Rebuilt UI inspired by a three-panel playground layout.
- Reset/Pause controls replaced with icon buttons.
- Hero dropdown list for quick selection.
- Load local `.fbx` files at runtime.
- Assets are served from the repo `assets/` directory (no more `public/assets`).

## Tech stack

- Next.js `^14.2.35`
- React `18.3.1`
- Three.js `0.160.0`

## Quick start (Next.js)

```bash
npm install
npm run dev
```

Open `http://localhost:3000/hero`.

## Asset layout

All hero assets live in the top-level `assets/` directory:

```
assets/
  kez/
    kez_econ.fbx
    kez_econ.ma
    kez_instructions.png
    materials/
      base/
      ...
```

Notes:
- `kez_econ.ma` is included for reference but is not used by the viewer.
- Textures referenced by the FBX should remain under the same hero folder.

## Asset serving in Next.js

The app serves `/assets/*` via a Next.js route handler that reads from the repo `assets/` directory.

Path examples:
- `assets/kez/kez_econ.fbx` is served as `/assets/kez/kez_econ.fbx`
- `assets/kez/materials/...` is served as `/assets/kez/materials/...`

The route is implemented in `app/assets/[...path]/route.ts`.

## Loading models

There are two ways to load an FBX:

1) Bundled asset (default)
- Uses `/assets/kez/kez_econ.fbx`.

2) Local file
- Use the "Load FBX" button to select a local `.fbx` file.
- The viewer loads it using a local object URL.

## Hero list

The hero dropdown is pre-populated from the Dota 2 workshop requirements hero list.
The list lives in `lib/heroes.ts` and can be updated if new heroes are added.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Create a new project in Vercel and import the repo.
3. Ensure hero assets exist under `assets/<hero>/` before deploying.
4. Vercel will detect Next.js automatically. Use the default build command (`npm run build`).

## URL state

The viewer persists key settings in the `/hero` query string:

- `anim=<clipName>`
- `speed=<float>`
- `preset=<studio|neutral|rim>`
- `autoplay=1|0`

## Legacy static viewer

A static viewer remains in `index.html` + `app.js` for quick local testing.
Serve the repo root with:

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

## Asset source

The Kez asset pack originates from:

```
https://www.dota2.com/workshop/requirements/kez
```
