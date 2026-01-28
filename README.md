# DotA2 Hero Viewer 

An interactive Three.js + Next.js viewer for Dota 2 hero assets. The v2 UI is rebuilt from the ground up with a new three-panel layout, icon-based controls, and a hero picker + FBX loader.

## Highlights

- Rebuilt UI inspired by a three-panel playground layout.
- Reset/Pause controls replaced with icon buttons.
- Hero dropdown list for quick selection.
- Load local `.fbx` files at runtime.
- Assets are served from the repo `assets/` directory (no more `public/assets`).

## UI snapshots

Initial state:

![DotA2 Hero Viewer UI (initial)](ui%20updates/kez_ui_1.png)

Current state:

![DotA2 Hero Viewer UI (current)](ui%20updates/kez_ui_3.png)

## Desired state (project direction)

Kez is a placeholder hero. The intended end state is a viewer that can import any hero by fetching the correct assets from the official Dota 2 workshop requirements pages.

Planned direction:
- Auto-discover available heroes from the workshop requirements index.
- Fetch the hero-specific asset pack (FBX + textures) on demand.
- Cache downloaded assets locally under `assets/<hero>/`.
- Keep the hero list in the UI in sync with the available workshop data.

For now, assets are still placed manually under `assets/<hero>/`, and the UI uses Kez as the default.

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
- `autoplay=1|0`

## Asset source

Hero assets come from the Dota 2 workshop requirements pages (Kez is the current example):

```
https://www.dota2.com/workshop/requirements/
```

All Assets belong to Valve Corp. 
