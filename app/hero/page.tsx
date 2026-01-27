"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Viewer3D, { type Viewer3DHandle } from "../../components/Viewer3D";
import ViewerControls from "../../components/ViewerControls";
import { type UrlState, parseUrlState, serializeUrlState } from "../../lib/urlState";
import "./hero.css";

function areUrlStatesEqual(a: UrlState, b: UrlState) {
  return (
    a.anim === b.anim &&
    a.speed === b.speed &&
    a.preset === b.preset &&
    a.autoplay === b.autoplay
  );
}

export default function HeroPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewerRef = useRef<Viewer3DHandle | null>(null);

  const parsedState = useMemo(() => {
    return parseUrlState(new URLSearchParams(searchParams.toString()));
  }, [searchParams]);

  const [urlState, setUrlState] = useState<UrlState>(parsedState);
  const [animations, setAnimations] = useState<string[]>([]);
  const [backgroundMode, setBackgroundMode] = useState<"gradient" | "solid">("gradient");

  useEffect(() => {
    if (!areUrlStatesEqual(urlState, parsedState)) {
      setUrlState(parsedState);
    }
  }, [parsedState, urlState]);

  useEffect(() => {
    const params = serializeUrlState(urlState).toString();
    router.replace(`/hero?${params}`);
  }, [router, urlState]);

  const handleClipsLoaded = useCallback((clips: string[]) => {
    setAnimations(clips);
    setUrlState((prev) => {
      if (clips.length > 0 && (!prev.anim || !clips.includes(prev.anim))) {
        return { ...prev, anim: clips[0] };
      }
      return prev;
    });
  }, []);

  const handleActiveClipChange = useCallback((clip: string | null) => {
    setUrlState((prev) => {
      if (clip && clip !== prev.anim) {
        return { ...prev, anim: clip };
      }
      return prev;
    });
  }, []);

  const handleResetCamera = useCallback(() => {
    viewerRef.current?.resetCamera();
  }, []);

  const { anim, speed, preset, autoplay } = urlState;
  const itemBudgets = [
    {
      name: "Head",
      color: "#b51414",
      lod0: "3000",
      lod1: "1200",
      texture: "512H x 512W",
    },
    {
      name: "Shoulders",
      color: "#f0e20f",
      lod0: "6000",
      lod1: "2400",
      texture: "512H x 512W",
    },
    {
      name: "Weapon",
      color: "#2ea14b",
      lod0: "2500",
      lod1: "1000",
      texture: "256H x 256W",
    },
    {
      name: "Weapon Offhand",
      color: "#2b6f6b",
      lod0: "2000",
      lod1: "800",
      texture: "256H x 256W",
    },
    {
      name: "Belt",
      color: "#2f35c9",
      lod0: "4000",
      lod1: "1600",
      texture: "512H x 512W",
    },
  ];

  return (
    <main>
      <div className="hero-layout">
        <header className="hero-header">
          <div>
            <p className="eyebrow">Single Hero 3D Viewer</p>
            <h1>Kez Hero Lab</h1>
            <p>
              This viewer loads the Kez hero asset locally and lets you explore
              available animation clips. Use the controls to tweak playback,
              lighting, and camera position.
            </p>
          </div>
          <div className="hero-header__status">
            <span>Asset path</span>
            <strong>/public/assets/kez/kez_econ.fbx</strong>
          </div>
        </header>

        <section className="hero-content">
          <Viewer3D
            ref={viewerRef}
            activeAnimation={anim}
            autoplay={autoplay}
            speed={speed}
            preset={preset}
            backgroundMode={backgroundMode}
            onClipsLoaded={handleClipsLoaded}
            onActiveClipChange={handleActiveClipChange}
          />
          <ViewerControls
            animations={animations}
            activeAnimation={anim}
            autoplay={autoplay}
            speed={speed}
            preset={preset}
            backgroundMode={backgroundMode}
            onAnimationChange={(clip) => setUrlState((prev) => ({ ...prev, anim: clip }))}
            onAutoplayChange={(next) => setUrlState((prev) => ({ ...prev, autoplay: next }))}
            onSpeedChange={(value) => setUrlState((prev) => ({ ...prev, speed: value }))}
            onPresetChange={(value) => setUrlState((prev) => ({ ...prev, preset: value }))}
            onBackgroundChange={setBackgroundMode}
            onResetCamera={handleResetCamera}
          />
        </section>
        <section className="kez-info">
          <div className="kez-bio">
            <div>
              <h2>Kez bio</h2>
              <blockquote>
                “I was born with a price on my head. As I got better at causing
                trouble, that price went up. Every time Queen Imperia raised the
                bounty, I knew I must have done something right. I think that’s
                the worst part about being gone so long in Icewrack... I’ve got
                to get that price back up to a respectable number.”
              </blockquote>
              <div className="kez-bio__links">
                <span>Model and texture files</span>
                <a href="/assets/kez/kez_econ.fbx" download>
                  Download Kez model
                </a>
              </div>
            </div>
            <div className="kez-bio__image" aria-hidden="true">
              <span>Kez portrait placeholder</span>
            </div>
          </div>
          <div className="kez-budgets">
            <h3>Item slots and their budgets</h3>
            <ul>
              {itemBudgets.map((budget) => (
                <li key={budget.name}>
                  <div className="budget-title">
                    <span
                      className="budget-swatch"
                      style={{ backgroundColor: budget.color }}
                    />
                    <strong>{budget.name}</strong>
                  </div>
                  <ul>
                    <li>LoD0 Triangle Limit: {budget.lod0}</li>
                    <li>LoD1 Triangle Limit: {budget.lod1}</li>
                    <li>Texture Size: {budget.texture}</li>
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
