"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Viewer3D, { type Viewer3DHandle } from "../../components/Viewer3D";
import ViewerControls from "../../components/ViewerControls";
import { HEROES } from "../../lib/heroes";
import { type UrlState, parseUrlState, serializeUrlState } from "../../lib/urlState";
import "./hero.css";

const DEFAULT_MODEL_URL = "/assets/kez/kez_econ.fbx";

function areUrlStatesEqual(a: UrlState, b: UrlState) {
  return (
    a.anim === b.anim &&
    a.pose === b.pose &&
    a.speed === b.speed &&
    a.autoplay === b.autoplay
  );
}

export default function HeroPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewerRef = useRef<Viewer3DHandle | null>(null);
  const lastSerializedRef = useRef<string | null>(null);

  const parsedState = useMemo(() => {
    return parseUrlState(new URLSearchParams(searchParams.toString()));
  }, [searchParams]);

  const [urlState, setUrlState] = useState<UrlState>(parsedState);
  const [backgroundMode, setBackgroundMode] = useState<"gradient" | "solid">("gradient");
  const [selectedHero, setSelectedHero] = useState<string>(
    HEROES.includes("Kez") ? "Kez" : HEROES[0] ?? "Kez",
  );
  const modelUrl = DEFAULT_MODEL_URL;

  useEffect(() => {
    const currentParams = searchParams.toString();
    if (currentParams === lastSerializedRef.current) {
      return;
    }
    setUrlState((prev) => (areUrlStatesEqual(prev, parsedState) ? prev : parsedState));
  }, [parsedState, searchParams]);

  useEffect(() => {
    const params = serializeUrlState(urlState).toString();
    if (params === lastSerializedRef.current) {
      return;
    }
    lastSerializedRef.current = params;
    router.replace(`/hero?${params}`);
  }, [router, urlState]);

  const handleClipsLoaded = useCallback((clips: string[]) => {
    setUrlState((prev) => {
      if (clips.length > 0 && (!prev.anim || !clips.includes(prev.anim))) {
        return { ...prev, anim: clips[0] };
      }
      if (clips.length === 0 && prev.anim) {
        return { ...prev, anim: null };
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

  const handleToggleAutoplay = useCallback(() => {
    setUrlState((prev) => ({ ...prev, autoplay: !prev.autoplay }));
  }, []);

  const { anim, pose, speed, autoplay } = urlState;
  const lightingPreset = "spotlight";

  return (
    <main className="hero-shell">
      <header className="topbar">
        <h1 className="topbar__title">DotA2 Hero Viewer</h1>
      </header>

      <div className="hero-grid">
        <aside className="panel panel--left">
          <div className="panel__header">
            <span>Asset</span>
          </div>

          <div className="panel__section">
            <label htmlFor="hero-select">Hero</label>
            <select
              id="hero-select"
              value={selectedHero}
              onChange={(event) => setSelectedHero(event.target.value)}
            >
              {HEROES.map((hero) => (
                <option key={hero} value={hero}>
                  {hero}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <section className="viewer-frame">
          <Viewer3D
            ref={viewerRef}
            modelUrl={modelUrl}
            activeAnimation={anim}
            pose={pose}
            autoplay={autoplay}
            speed={speed}
            preset={lightingPreset}
            backgroundMode={backgroundMode}
            screenshotLabel={selectedHero}
            onClipsLoaded={handleClipsLoaded}
            onActiveClipChange={handleActiveClipChange}
          />
        </section>

        <ViewerControls
          pose={pose}
          speed={speed}
          backgroundMode={backgroundMode}
          autoplay={autoplay}
          onReset={handleResetCamera}
          onToggleAutoplay={handleToggleAutoplay}
          onScreenshot={() => viewerRef.current?.captureScreenshot()}
          onPoseChange={(value) => setUrlState((prev) => ({ ...prev, pose: value }))}
          onSpeedChange={(value) => setUrlState((prev) => ({ ...prev, speed: value }))}
          onBackgroundChange={setBackgroundMode}
        />
      </div>
    </main>
  );
}
